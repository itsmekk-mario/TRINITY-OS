import { loadCloudflareConfig } from './cloudflare';

export type StudyStatus = 'studying' | 'break' | 'idle';

export type StudyState = {
  status: StudyStatus;
  subject?: string;
  active: boolean;
  startedAt?: string;
  elapsedSeconds: number;
  todayMinutes: number;
};

export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline';

export type StudyRoomInfo = {
  id: string;
  code: string;
  name: string;
  maxParticipants: number;
  createdAt: string;
};

export type StudyParticipant = {
  id: string;
  name: string;
  connectionId: string;
  cameraEnabled: boolean;
  studyState: StudyState;
  connectionState: ConnectionState;
  stream?: MediaStream;

  // 기존 Cloudflare Realtime 구현과의 과도기 호환용.
  // Worker 전환 완료 후 제거 가능.
  realtimeSessionId?: string;
  publishedTrackName?: string;
};

export type LiveKitAccess = {
  url: string;
  token: string;
  roomName?: string;
  expiresAt?: number;
};

type ApiResult<T> = T & {
  error?: string;
};

async function request<T>(
  path: string,
  body?: unknown,
  method: 'GET' | 'POST' | 'PUT' = body === undefined ? 'GET' : 'POST',
): Promise<T> {
  const config = loadCloudflareConfig();

  if (!config.url || !config.token) {
    throw new Error('로그인이 필요합니다.');
  }

  const response = await fetch(
    `${config.url.replace(/\/+$/, '')}${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      ...(body === undefined
        ? {}
        : {
            body: JSON.stringify(body),
          }),
    },
  );

  const value = await response
    .json()
    .catch(() => ({})) as ApiResult<T>;

  if (!response.ok) {
    throw new Error(
      value.error ||
        (response.status === 409
          ? '이 Study Room은 현재 가득 찼습니다.'
          : 'Study Room 요청에 실패했습니다.'),
    );
  }

  return value;
}

export const createStudyRoom = (
  name: string,
  maxParticipants: number,
) =>
  request<{ room: StudyRoomInfo }>(
    '/api/study-rooms',
    {
      name,
      maxParticipants,
    },
  );

export const joinStudyRoom = (code: string) =>
  request<{ room: StudyRoomInfo }>(
    '/api/study-rooms/join',
    {
      code,
    },
  );

export const createStudyRoomTicket = (code: string) =>
  request<{
    ticket: string;
    expiresAt: number;
    websocketPath: string;
    room: StudyRoomInfo;
  }>(
    `/api/study-rooms/${encodeURIComponent(code)}/ticket`,
    {},
  );

/**
 * LiveKit 접속 토큰을 TRINITY Worker에서 발급받는다.
 *
 * LIVEKIT_API_SECRET은 절대 브라우저에 들어오면 안 된다.
 * Worker가 로그인/방 권한을 확인한 후 단기 JWT만 반환해야 한다.
 */
export const createLiveKitAccess = (code: string) =>
  request<LiveKitAccess>(
    `/api/study-rooms/${encodeURIComponent(code)}/livekit/token`,
    {},
  );

export function studyRoomWebSocketUrl(
  path: string,
  ticket: string,
): string {
  const config = loadCloudflareConfig();

  const url = new URL(
    path,
    `${config.url.replace(/\/+$/, '')}/`,
  );

  url.protocol =
    url.protocol === 'https:'
      ? 'wss:'
      : 'ws:';

  url.searchParams.set('ticket', ticket);

  return url.toString();
}