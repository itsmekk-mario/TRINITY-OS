import type { StudyRoomDurableObject } from './StudyRoomDurableObject.ts';
import { boundedJson } from '../security.ts';

type User = { id: number; username: string; arena_public_id?: string | null };
type RoomRow = { id: string; invite_code: string; name: string; owner_user_id: number; created_at: string; is_active: number; max_participants: number };
type SessionDescription = { type: 'offer' | 'answer'; sdp: string };
type RealtimeResponse = { sessionId?: string; sessionDescription?: SessionDescription; requiresImmediateRenegotiation?: boolean; tracks?: { trackName?: string; mid?: string; sessionId?: string }[]; errorCode?: string; errorDescription?: string };
export interface StudyRoomRouteEnv { DB: D1Database; STUDY_ROOM: DurableObjectNamespace<StudyRoomDurableObject>; CALLS_APP_ID?: string; CALLS_APP_SECRET?: string }
type Json = (body: unknown, status?: number, origin?: string, extra?: HeadersInit) => Response;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const roomDto = (row: RoomRow) => ({ id: row.id, code: row.invite_code, name: row.name, maxParticipants: row.max_participants, createdAt: row.created_at });
const codeFromPath = (pathname: string, suffix = '') => pathname.match(new RegExp(`^/api/study-rooms/([A-HJ-NP-Z2-9]{6,8})${suffix}$`))?.[1] ?? '';
const inviteCode = () => { const bytes = new Uint8Array(6); crypto.getRandomValues(bytes); return [...bytes].map((value) => CODE_ALPHABET[value % CODE_ALPHABET.length]).join(''); };
const participantId = (user: User) => user.arena_public_id || `student-${user.id}`;
const validSessionId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{8,160}$/.test(value);
const validParticipantId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{3,160}$/.test(value);
const validDescription = (value: unknown): value is SessionDescription => Boolean(value && typeof value === 'object' && ((value as SessionDescription).type === 'offer' || (value as SessionDescription).type === 'answer') && typeof (value as SessionDescription).sdp === 'string' && (value as SessionDescription).sdp.length <= 180_000);
async function activeRoom(db: D1Database, code: string) { return db.prepare('SELECT id,invite_code,name,owner_user_id,created_at,is_active,max_participants FROM study_rooms WHERE invite_code=? AND is_active=1').bind(code).first<RoomRow>(); }

async function realtime(env: StudyRoomRouteEnv, path: string, method: 'POST' | 'PUT', body?: unknown): Promise<RealtimeResponse> {
  if (!env.CALLS_APP_ID || !env.CALLS_APP_SECRET) throw new Error('Cloudflare Realtime is not configured');
  const response = await fetch(`https://rtc.live.cloudflare.com/v1/apps/${encodeURIComponent(env.CALLS_APP_ID)}${path}`, { method, headers: { Authorization: `Bearer ${env.CALLS_APP_SECRET}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value = await response.json<RealtimeResponse>().catch(() => ({} as RealtimeResponse));
  if (!response.ok || value.errorCode) { console.error(JSON.stringify({ message: 'Cloudflare Realtime request failed', path, status: response.status, errorCode: value.errorCode })); throw new Error('Cloudflare Realtime request failed'); }
  return value;
}

export async function connectStudyRoomWebSocket(request: Request, env: StudyRoomRouteEnv): Promise<Response | null> {
  const url = new URL(request.url), code = codeFromPath(url.pathname, '/websocket');
  if (!code || request.method !== 'GET') return null;
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket upgrade required', { status: 426 });
  return env.STUDY_ROOM.getByName(code).fetch(request);
}

export async function handleStudyRoomApi(request: Request, env: StudyRoomRouteEnv, user: User | null, origin: string, json: Json): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/study-rooms')) return null;
  if (!user) return json({ error: '로그인이 필요합니다.' }, 401, origin);
  if (url.pathname === '/api/study-rooms' && request.method === 'POST') {
    const body = await boundedJson<{ name?: unknown; maxParticipants?: unknown }>(request);
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 40) : '';
    const requestedMax = Number(body.maxParticipants), maxParticipants = Number.isInteger(requestedMax) && requestedMax >= 2 && requestedMax <= 10 ? requestedMax : 10;
    if (!name) return json({ error: '방 이름을 입력해 주세요.' }, 400, origin);
    const id = crypto.randomUUID(), createdAt = new Date().toISOString();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = inviteCode();
      try { await env.DB.prepare('INSERT INTO study_rooms(id,invite_code,name,owner_user_id,created_at,is_active,max_participants) VALUES(?,?,?,?,?,1,?)').bind(id, code, name, user.id, createdAt, maxParticipants).run(); return json({ room: { id, code, name, maxParticipants, createdAt } }, 201, origin); }
      catch (error) { if (!String(error).toLowerCase().includes('unique')) throw error; }
    }
    return json({ error: '방 코드를 만들지 못했습니다. 다시 시도해 주세요.' }, 503, origin);
  }
  if (url.pathname === '/api/study-rooms/join' && request.method === 'POST') {
    const body = await boundedJson<{ code?: unknown }>(request);
    const code = typeof body.code === 'string' ? body.code.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 8) : '';
    const room = code ? await activeRoom(env.DB, code) : null;
    return room ? json({ room: roomDto(room) }, 200, origin) : json({ error: '존재하지 않거나 종료된 Study Room입니다.' }, 404, origin);
  }
  const ticketCode = codeFromPath(url.pathname, '/ticket');
  if (ticketCode && request.method === 'POST') {
    const room = await activeRoom(env.DB, ticketCode);
    if (!room) return json({ error: '존재하지 않거나 종료된 Study Room입니다.' }, 404, origin);
    const tokenBytes = new Uint8Array(32); crypto.getRandomValues(tokenBytes);
    const token = [...tokenBytes].map((value) => value.toString(16).padStart(2, '0')).join(''), expiresAt = Date.now() + 60_000, connectionId = crypto.randomUUID();
    try { await env.STUDY_ROOM.getByName(ticketCode).createTicket({ token, expiresAt, roomId: room.id, roomName: room.name, maxParticipants: room.max_participants, userId: user.id, participantId: participantId(user), username: user.username, connectionId }); }
    catch (error) { if (String(error).toLowerCase().includes('full')) return json({ error: '이 Study Room은 현재 가득 찼습니다.' }, 409, origin); throw error; }
    return json({ ticket: token, expiresAt, websocketPath: `/api/study-rooms/${ticketCode}/websocket`, room: roomDto(room) }, 200, origin);
  }
  const sessionCode = codeFromPath(url.pathname, '/realtime/session');
  if (sessionCode && request.method === 'POST') {
    if (!await activeRoom(env.DB, sessionCode)) return json({ error: '존재하지 않거나 종료된 Study Room입니다.' }, 404, origin);
    const room = env.STUDY_ROOM.getByName(sessionCode), ownId = participantId(user);
    if (!await room.beginRealtimeSession(ownId)) return json({ error: '영상 세션 재연결을 잠시 후 다시 시도해 주세요.' }, 429, origin, { 'Retry-After': '5' });
    try { const created = await realtime(env, '/sessions/new', 'POST'); if (!created.sessionId || !await room.registerRealtimeSession(ownId, created.sessionId)) return json({ error: 'Study Room presence를 먼저 연결해 주세요.' }, 409, origin); return json({ sessionId: created.sessionId }, 201, origin); }
    catch (error) { return json({ error: String(error).includes('not configured') ? 'Cloudflare Realtime 설정이 필요합니다.' : '영상 세션을 시작하지 못했습니다.' }, 503, origin); }
  }
  const publishCode = codeFromPath(url.pathname, '/realtime/publish');
  if (publishCode && request.method === 'POST') {
    const body = await boundedJson<{ sessionId?: unknown; sessionDescription?: unknown; trackName?: unknown; mid?: unknown }>(request), ownId = participantId(user);
    if (!validSessionId(body.sessionId) || !validDescription(body.sessionDescription) || typeof body.trackName !== 'string' || body.trackName.length > 160 || typeof body.mid !== 'string') return json({ error: '잘못된 publish 요청입니다.' }, 400, origin);
    const room = env.STUDY_ROOM.getByName(publishCode); if (!await room.authorizeRealtimeSession(ownId, body.sessionId)) return json({ error: '허용되지 않은 영상 세션입니다.' }, 403, origin);
    try { const result = await realtime(env, `/sessions/${encodeURIComponent(body.sessionId)}/tracks/new`, 'POST', { sessionDescription: body.sessionDescription, tracks: [{ location: 'local', trackName: body.trackName, mid: body.mid }] }); const trackName = result.tracks?.[0]?.trackName || body.trackName; if (!await room.registerPublishedTrack(ownId, body.sessionId, trackName)) return json({ error: 'publish 상태를 등록하지 못했습니다.' }, 409, origin); return json({ ...result, publishedTrackName: trackName }, 200, origin); }
    catch { return json({ error: '카메라 영상을 publish하지 못했습니다.' }, 502, origin); }
  }
  const subscribeCode = codeFromPath(url.pathname, '/realtime/subscribe');
  if (subscribeCode && request.method === 'POST') {
    const body = await boundedJson<{ sessionId?: unknown; participantId?: unknown }>(request), ownId = participantId(user);
    if (!validSessionId(body.sessionId) || !validParticipantId(body.participantId)) return json({ error: '잘못된 subscribe 요청입니다.' }, 400, origin);
    const room = env.STUDY_ROOM.getByName(subscribeCode); if (!await room.authorizeRealtimeSession(ownId, body.sessionId)) return json({ error: '허용되지 않은 영상 세션입니다.' }, 403, origin);
    const source = await room.subscriptionSource(ownId, body.participantId); if (!source) return json({ error: '구독할 카메라 track이 없습니다.' }, 404, origin);
    try { return json(await realtime(env, `/sessions/${encodeURIComponent(body.sessionId)}/tracks/new`, 'POST', { tracks: [{ location: 'remote', sessionId: source.sessionId, trackName: source.trackName }] }), 200, origin); }
    catch { return json({ error: '참가자 영상을 subscribe하지 못했습니다.' }, 502, origin); }
  }
  const renegotiateCode = codeFromPath(url.pathname, '/realtime/renegotiate');
  if (renegotiateCode && request.method === 'PUT') {
    const body = await boundedJson<{ sessionId?: unknown; sessionDescription?: unknown }>(request), ownId = participantId(user);
    if (!validSessionId(body.sessionId) || !validDescription(body.sessionDescription)) return json({ error: '잘못된 renegotiate 요청입니다.' }, 400, origin);
    if (!await env.STUDY_ROOM.getByName(renegotiateCode).authorizeRealtimeSession(ownId, body.sessionId)) return json({ error: '허용되지 않은 영상 세션입니다.' }, 403, origin);
    try { return json(await realtime(env, `/sessions/${encodeURIComponent(body.sessionId)}/renegotiate`, 'PUT', { sessionDescription: body.sessionDescription }), 200, origin); }
    catch { return json({ error: '영상 세션 협상을 완료하지 못했습니다.' }, 502, origin); }
  }
  return json({ error: 'Not found' }, 404, origin);
}
