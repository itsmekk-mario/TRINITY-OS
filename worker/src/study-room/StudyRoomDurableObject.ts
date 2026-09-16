import { DurableObject } from 'cloudflare:workers';

type StudyStatus = 'studying' | 'break' | 'idle';
type StudyState = { status: StudyStatus; subject?: string; active: boolean; startedAt?: string; elapsedSeconds: number; todayMinutes: number };
type Ticket = { token: string; expiresAt: number; roomId: string; roomName: string; maxParticipants: number; userId: number; participantId: string; username: string; connectionId: string };
type Attachment = { roomId: string; userId: number; participantId: string; username: string; connectionId: string; joinedAt: string; cameraEnabled: boolean; microphoneEnabled: boolean; studyState: StudyState; lastMediaTokenAt?: number; messageWindowStartedAt: number; messageCount: number };
type EmptyRoom = { roomId: string; emptySince: number };

export interface StudyRoomEnv { DB: D1Database }
const MAX_MESSAGE_BYTES = 32_768;
const OPEN = 1;
const idleStudyState = (): StudyState => ({ status: 'idle', active: false, elapsedSeconds: 0, todayMinutes: 0 });
const isIsoDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const finiteRange = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : 0;

export class StudyRoomDurableObject extends DurableObject<StudyRoomEnv> {
  async createTicket(ticket: Ticket): Promise<void> {
    const uniqueParticipants = new Set(this.openParticipants().map((item) => item.participantId));
    if (!uniqueParticipants.has(ticket.participantId) && uniqueParticipants.size >= ticket.maxParticipants) throw new Error('Room is full');
    await this.ctx.storage.put(`ticket:${ticket.token}`, ticket);
    const currentAlarm = await this.ctx.storage.getAlarm();
    if (currentAlarm === null || currentAlarm > ticket.expiresAt) await this.ctx.storage.setAlarm(ticket.expiresAt);
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    const tickets = await this.ctx.storage.list<Ticket>({ prefix: 'ticket:' });
    await Promise.all([...tickets].filter(([, value]) => value.expiresAt <= now).map(([key]) => this.ctx.storage.delete(key)));
    const deadlines = [...tickets].map(([, value]) => value.expiresAt).filter((expiresAt) => expiresAt > now);
    const empty = await this.ctx.storage.get<EmptyRoom>('empty-room');
    if (empty) {
      const expiresAt = empty.emptySince + 5 * 60_000;
      if (expiresAt <= now && !this.ctx.getWebSockets().some((socket) => socket.readyState === OPEN)) {
        await this.env.DB.prepare('UPDATE study_rooms SET is_active=0 WHERE id=?').bind(empty.roomId).run();
        await this.ctx.storage.delete('empty-room');
      } else deadlines.push(expiresAt);
    }
    const next = deadlines.sort((a, b) => a - b)[0];
    if (next) await this.ctx.storage.setAlarm(next);
  }

  async authorizeMediaToken(participantId: string, connectionId: string): Promise<{ allowed: boolean; rateLimited?: boolean }> {
    const socket = this.participantSocket(participantId);
    if (!socket || !connectionId) return { allowed: false };
    const attachment = socket.deserializeAttachment() as Attachment;
    if (attachment.connectionId !== connectionId) return { allowed: false };
    const now = Date.now();
    if (attachment.lastMediaTokenAt && now - attachment.lastMediaTokenAt < 3_000) {
      return { allowed: false, rateLimited: true };
    }
    attachment.lastMediaTokenAt = now;
    socket.serializeAttachment(attachment);
    return { allowed: true };
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket upgrade required', { status: 426 });
    const token = new URL(request.url).searchParams.get('ticket') || '';
    if (!token || token.length > 160) return new Response('Invalid ticket', { status: 401 });
    const key = `ticket:${token}`;
    const ticket = await this.ctx.storage.get<Ticket>(key);
    if (!ticket || ticket.expiresAt <= Date.now()) { if (ticket) await this.ctx.storage.delete(key); return new Response('Expired ticket', { status: 401 }); }
    await this.ctx.storage.delete(key);
    const existing = this.ctx.getWebSockets(`participant:${ticket.participantId}`).filter((socket) => socket.readyState === OPEN);
    const uniqueParticipants = new Set(this.openParticipants().map((item) => item.participantId));
    if (!uniqueParticipants.has(ticket.participantId) && uniqueParticipants.size >= ticket.maxParticipants) return new Response('Room is full', { status: 409 });
    existing.forEach((socket) => socket.close(4001, 'Replaced by a newer connection'));

    const pair = new WebSocketPair(), client = pair[0], server = pair[1];
    const joinedAt = new Date().toISOString();
    const attachment: Attachment = { roomId: ticket.roomId, userId: ticket.userId, participantId: ticket.participantId, username: ticket.username, connectionId: ticket.connectionId, joinedAt, cameraEnabled: false, microphoneEnabled: false, studyState: idleStudyState(), messageWindowStartedAt: Date.now(), messageCount: 0 };
    server.serializeAttachment(attachment);
    this.ctx.acceptWebSocket(server, [`participant:${ticket.participantId}`]);
    await this.ctx.storage.delete('empty-room');
    await this.env.DB.prepare('INSERT INTO study_room_members(room_id,user_id,connection_id,joined_at) VALUES(?,?,?,?)').bind(ticket.roomId, ticket.userId, ticket.connectionId, joinedAt).run();
    this.send(server, { type: 'room-state', room: { id: ticket.roomId, name: ticket.roomName, maxParticipants: ticket.maxParticipants }, selfId: ticket.participantId, participants: this.openParticipants().map((item) => this.toParticipant(item)) });
    this.broadcast({ type: 'participant-joined', participant: this.toParticipant(attachment) }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const bytes = typeof message === 'string' ? new TextEncoder().encode(message).byteLength : message.byteLength;
    if (bytes > MAX_MESSAGE_BYTES || typeof message !== 'string') return socket.close(1009, 'Message too large');
    const attachment = socket.deserializeAttachment() as Attachment | null;
    if (!attachment) return socket.close(1008, 'Missing identity');
    const now = Date.now();
    if (now - attachment.messageWindowStartedAt >= 60_000) { attachment.messageWindowStartedAt = now; attachment.messageCount = 0; }
    attachment.messageCount += 1;
    socket.serializeAttachment(attachment);
    if (attachment.messageCount > 180) return socket.close(1008, 'Rate limit exceeded');
    let value: Record<string, unknown>;
    try { value = JSON.parse(message) as Record<string, unknown>; } catch { return; }
    if (value.type === 'camera-state') {
      if (typeof value.enabled !== 'boolean') return;
      attachment.cameraEnabled = value.enabled; socket.serializeAttachment(attachment);
      this.broadcast({ type: 'camera-state', userId: attachment.participantId, enabled: value.enabled });
      return;
    }
    if (value.type === 'microphone-state') {
      if (typeof value.enabled !== 'boolean') return;
      attachment.microphoneEnabled = value.enabled; socket.serializeAttachment(attachment);
      this.broadcast({ type: 'microphone-state', userId: attachment.participantId, enabled: value.enabled });
      return;
    }
    if (value.type === 'study-state') {
      const active = value.active === true, subject = typeof value.subject === 'string' ? value.subject.trim().slice(0, 40) : undefined;
      attachment.studyState = { status: active ? 'studying' : value.status === 'break' ? 'break' : 'idle', subject, active, startedAt: active && isIsoDate(value.startedAt) ? value.startedAt : undefined, elapsedSeconds: Math.round(finiteRange(value.elapsedSeconds, 0, 604_800)), todayMinutes: Math.round(finiteRange(value.todayMinutes, 0, 1_440)) };
      socket.serializeAttachment(attachment);
      this.broadcast({ type: 'study-state', userId: attachment.participantId, ...attachment.studyState });
    }
  }

  async webSocketClose(socket: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    const attachment = socket.deserializeAttachment() as Attachment | null;
    if (!attachment) return;
    await this.env.DB.prepare('UPDATE study_room_members SET left_at=? WHERE room_id=? AND user_id=? AND joined_at=? AND left_at IS NULL').bind(new Date().toISOString(), attachment.roomId, attachment.userId, attachment.joinedAt).run();
    const duplicateStillOpen = this.ctx.getWebSockets(`participant:${attachment.participantId}`).some((item) => item !== socket && item.readyState === OPEN);
    if (!duplicateStillOpen) this.broadcast({ type: 'participant-left', participantId: attachment.participantId });
    const anyOpen = this.ctx.getWebSockets().some((item) => item !== socket && item.readyState === OPEN);
    if (!anyOpen) { const emptySince = Date.now(); await this.ctx.storage.put('empty-room', { roomId: attachment.roomId, emptySince } satisfies EmptyRoom); await this.ctx.storage.setAlarm(emptySince + 5 * 60_000); }
    socket.close(code, reason || (wasClean ? 'Closed' : 'Disconnected'));
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    const attachment = socket.deserializeAttachment() as Attachment | null;
    if (attachment) console.error(JSON.stringify({ message: 'study room websocket error', roomId: attachment.roomId, connectionId: attachment.connectionId }));
    socket.close(1011, 'WebSocket error');
  }

  private openParticipants(): Attachment[] {
    const byParticipant = new Map<string, Attachment>();
    for (const socket of this.ctx.getWebSockets()) { if (socket.readyState !== OPEN) continue; const value = socket.deserializeAttachment() as Attachment | null; if (value) byParticipant.set(value.participantId, value); }
    return [...byParticipant.values()];
  }
  private toParticipant(value: Attachment) { return { id: value.participantId, name: value.username, cameraEnabled: value.cameraEnabled, microphoneEnabled: value.microphoneEnabled, connectionId: value.connectionId, studyState: value.studyState }; }
  private participantSocket(participantId: string) { return this.ctx.getWebSockets(`participant:${participantId}`).find((socket) => socket.readyState === OPEN); }
  private broadcast(payload: unknown, except?: WebSocket): void { for (const socket of this.ctx.getWebSockets()) if (socket !== except && socket.readyState === OPEN) this.send(socket, payload); }
  private send(socket: WebSocket, payload: unknown): void { try { socket.send(JSON.stringify(payload)); } catch { /* Close callback reconciles presence. */ } }
}
