import type { StudyRoomDurableObject } from './StudyRoomDurableObject.ts';
import { boundedJson } from '../security.ts';
import { createLiveKitToken, liveKitHttpUrl } from './livekit.ts';

type User = { id: number; username: string; arena_public_id?: string | null };
type RoomRow = {
  id: string;
  invite_code: string;
  name: string;
  owner_user_id: number;
  created_at: string;
  is_active: number;
  max_participants: number;
};

export interface StudyRoomRouteEnv {
  DB: D1Database;
  STUDY_ROOM: DurableObjectNamespace<StudyRoomDurableObject>;
  LIVEKIT_URL?: string;
  LIVEKIT_API_KEY?: string;
  LIVEKIT_API_SECRET?: string;
}

type Json = (body: unknown, status?: number, origin?: string, extra?: HeadersInit) => Response;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const participantId = (user: User) => user.arena_public_id || `student-${user.id}`;
const roomDto = (row: RoomRow) => ({
  id: row.id,
  code: row.invite_code,
  name: row.name,
  maxParticipants: row.max_participants,
  createdAt: row.created_at,
});

const codeFromPath = (pathname: string, suffix = '') =>
  pathname.match(new RegExp(`^/api/study-rooms/([A-HJ-NP-Z2-9]{6,8})${suffix}$`))?.[1] ?? '';

function inviteCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return [...bytes].map((value) => CODE_ALPHABET[value % CODE_ALPHABET.length]).join('');
}

async function activeRoom(db: D1Database, code: string) {
  return db.prepare(`
    SELECT id, invite_code, name, owner_user_id, created_at, is_active, max_participants
    FROM study_rooms
    WHERE invite_code=? AND is_active=1
  `).bind(code).first<RoomRow>();
}

async function mediaStatus(env: StudyRoomRouteEnv) {
  if (!env.LIVEKIT_URL) return { online: false, status: 'not_configured' as const };
  try {
    const response = await fetch(liveKitHttpUrl(env.LIVEKIT_URL), {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(2_500),
    });
    const online = response.status >= 200 && response.status < 500;
    return { online, status: online ? 'online' as const : 'offline' as const };
  } catch {
    return { online: false, status: 'offline' as const };
  }
}

export async function connectStudyRoomWebSocket(
  request: Request,
  env: StudyRoomRouteEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  const code = codeFromPath(url.pathname, '/websocket');
  if (!code || request.method !== 'GET') return null;
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('WebSocket upgrade required', { status: 426 });
  }
  return env.STUDY_ROOM.getByName(code).fetch(request);
}

export async function handleStudyRoomApi(
  request: Request,
  env: StudyRoomRouteEnv,
  user: User | null,
  origin: string,
  json: Json,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/study-rooms')) return null;
  if (!user) return json({ error: '로그인이 필요합니다.' }, 401, origin);

  if (url.pathname === '/api/study-rooms/media-status' && request.method === 'GET') {
    return json(await mediaStatus(env), 200, origin);
  }

  if (url.pathname === '/api/study-rooms' && request.method === 'POST') {
    const body = await boundedJson<{ name?: unknown; maxParticipants?: unknown }>(request);
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 40) : '';
    const requestedMax = Number(body.maxParticipants);
    const maxParticipants = Number.isInteger(requestedMax) && requestedMax >= 2 && requestedMax <= 10
      ? requestedMax
      : 6;
    if (!name) return json({ error: '방 이름을 입력해 주세요.' }, 400, origin);

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = inviteCode();
      try {
        await env.DB.prepare(`
          INSERT INTO study_rooms(id,invite_code,name,owner_user_id,created_at,is_active,max_participants)
          VALUES(?,?,?,?,?,1,?)
        `).bind(id, code, name, user.id, createdAt, maxParticipants).run();
        return json({ room: { id, code, name, maxParticipants, createdAt } }, 201, origin);
      } catch (error) {
        if (!String(error).toLowerCase().includes('unique')) throw error;
      }
    }
    return json({ error: '방 코드를 만들지 못했습니다. 다시 시도해 주세요.' }, 503, origin);
  }

  if (url.pathname === '/api/study-rooms/join' && request.method === 'POST') {
    const body = await boundedJson<{ code?: unknown }>(request);
    const code = typeof body.code === 'string'
      ? body.code.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 8)
      : '';
    const room = code ? await activeRoom(env.DB, code) : null;
    return room
      ? json({ room: roomDto(room) }, 200, origin)
      : json({ error: '존재하지 않거나 종료된 Study Room입니다.' }, 404, origin);
  }

  const ticketCode = codeFromPath(url.pathname, '/ticket');
  if (ticketCode && request.method === 'POST') {
    const room = await activeRoom(env.DB, ticketCode);
    if (!room) return json({ error: '존재하지 않거나 종료된 Study Room입니다.' }, 404, origin);

    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const token = [...tokenBytes].map((value) => value.toString(16).padStart(2, '0')).join('');
    const expiresAt = Date.now() + 60_000;
    const connectionId = crypto.randomUUID();
    try {
      await env.STUDY_ROOM.getByName(ticketCode).createTicket({
        token,
        expiresAt,
        roomId: room.id,
        roomName: room.name,
        maxParticipants: room.max_participants,
        userId: user.id,
        participantId: participantId(user),
        username: user.username,
        connectionId,
      });
    } catch (error) {
      if (String(error).toLowerCase().includes('full')) {
        return json({ error: '이 Study Room은 현재 가득 찼습니다.' }, 409, origin);
      }
      throw error;
    }
    return json({
      ticket: token,
      expiresAt,
      websocketPath: `/api/study-rooms/${ticketCode}/websocket`,
      room: roomDto(room),
    }, 200, origin);
  }

  const liveKitCode = codeFromPath(url.pathname, '/livekit/token');
  if (liveKitCode && request.method === 'POST') {
    const room = await activeRoom(env.DB, liveKitCode);
    if (!room) return json({ error: '존재하지 않거나 종료된 Study Room입니다.' }, 404, origin);

    const body = await boundedJson<{ connectionId?: unknown }>(request);
    const connectionId = typeof body.connectionId === 'string' ? body.connectionId.trim().slice(0, 80) : '';
    const authorization = await env.STUDY_ROOM.getByName(liveKitCode)
      .authorizeMediaToken(participantId(user), connectionId);
    if (!authorization.allowed) {
      return json(
        { error: authorization.rateLimited ? '토큰 요청이 너무 빠릅니다.' : '먼저 Study Room 연결을 완료해 주세요.' },
        authorization.rateLimited ? 429 : 403,
        origin,
        authorization.rateLimited ? { 'Retry-After': '3' } : {},
      );
    }

    try {
      const access = await createLiveKitToken({
        apiKey: env.LIVEKIT_API_KEY ?? '',
        apiSecret: env.LIVEKIT_API_SECRET ?? '',
        serverUrl: env.LIVEKIT_URL ?? '',
        roomId: room.id,
        identity: participantId(user),
      });
      return json(access, 200, origin, { 'Cache-Control': 'no-store' });
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'LIVEKIT_NOT_CONFIGURED' || code === 'LIVEKIT_URL_INVALID') {
        return json({ error: '캠 서버가 아직 설정되지 않았습니다. 학습방 기능은 계속 사용할 수 있습니다.' }, 503, origin);
      }
      console.error(JSON.stringify({ message: 'LiveKit token creation failed', roomId: room.id }));
      return json({ error: 'LiveKit 접속 토큰을 만들지 못했습니다.' }, 500, origin);
    }
  }

  return json({ error: 'Not found' }, 404, origin);
}
