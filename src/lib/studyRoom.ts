import { loadCloudflareConfig } from './cloudflare';

export type StudyStatus = 'studying' | 'break' | 'idle';
export type StudyState = { status: StudyStatus; subject?: string; active: boolean; startedAt?: string; elapsedSeconds: number; todayMinutes: number };
export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline';
export type StudyRoomInfo = { id: string; code: string; name: string; maxParticipants: number; createdAt: string };
export type StudyParticipant = { id: string; name: string; connectionId: string; cameraEnabled: boolean; studyState: StudyState; connectionState: ConnectionState; stream?: MediaStream; realtimeSessionId?: string; publishedTrackName?: string };
export type RealtimeTrackResponse = { sessionDescription?: RTCSessionDescriptionInit; requiresImmediateRenegotiation?: boolean; tracks?: { trackName?: string; mid?: string; sessionId?: string }[]; publishedTrackName?: string };
type ApiResult<T> = T & { error?: string };

async function request<T>(path: string, body?: unknown, method: 'GET' | 'POST' | 'PUT' = body === undefined ? 'GET' : 'POST'): Promise<T> {
  const config = loadCloudflareConfig();
  if (!config.url || !config.token) throw new Error('로그인이 필요합니다.');
  const response = await fetch(`${config.url.replace(/\/+$/, '')}${path}`, { method, headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value = await response.json().catch(() => ({})) as ApiResult<T>;
  if (!response.ok) throw new Error(value.error || (response.status === 409 ? '이 Study Room은 현재 가득 찼습니다.' : 'Study Room 요청에 실패했습니다.'));
  return value;
}

export const createStudyRoom = (name: string, maxParticipants: number) => request<{ room: StudyRoomInfo }>('/api/study-rooms', { name, maxParticipants });
export const joinStudyRoom = (code: string) => request<{ room: StudyRoomInfo }>('/api/study-rooms/join', { code });
export const createStudyRoomTicket = (code: string) => request<{ ticket: string; expiresAt: number; websocketPath: string; room: StudyRoomInfo }>(`/api/study-rooms/${code}/ticket`, {});
export const createRealtimeSession = (code: string) => request<{ sessionId: string }>(`/api/study-rooms/${code}/realtime/session`, {});
export const publishRealtimeTrack = (code: string, body: { sessionId: string; sessionDescription: RTCSessionDescriptionInit; trackName: string; mid: string }) => request<RealtimeTrackResponse>(`/api/study-rooms/${code}/realtime/publish`, body);
export const subscribeRealtimeTrack = (code: string, sessionId: string, participantId: string) => request<RealtimeTrackResponse>(`/api/study-rooms/${code}/realtime/subscribe`, { sessionId, participantId });
export const renegotiateRealtimeSession = (code: string, sessionId: string, sessionDescription: RTCSessionDescriptionInit) => request<RealtimeTrackResponse>(`/api/study-rooms/${code}/realtime/renegotiate`, { sessionId, sessionDescription }, 'PUT');

export function studyRoomWebSocketUrl(path: string, ticket: string): string {
  const config = loadCloudflareConfig(), url = new URL(path, `${config.url.replace(/\/+$/, '')}/`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('ticket', ticket);
  return url.toString();
}

export function getIceServers(): RTCIceServer[] {
  const configured = import.meta.env.VITE_STUDY_ROOM_ICE_SERVERS;
  if (configured) {
    try { const parsed = JSON.parse(configured) as RTCIceServer[]; if (Array.isArray(parsed) && parsed.length) return parsed; } catch { /* Fall back to Cloudflare's public STUN service. */ }
  }
  return [{ urls: 'stun:stun.cloudflare.com:3478' }];
}
