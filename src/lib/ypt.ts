import { loadCloudflareConfig } from './cloudflare';
import type { Subject } from '../types';

export type YptState = 'disconnected' | 'idle' | 'starting' | 'running' | 'stopping' | 'uncertain';
export type YptStatus = { connected: boolean; state: YptState; subjects: string[]; mapping: Partial<Record<Subject, string>>; activeStartedAt: number | null; activeSubject: Subject | null };
export type YptTransition = { ok: true; state: 'idle' | 'running'; startedAt?: number; stoppedAt?: number | null };
class YptHttpError extends Error { constructor(public status: number, message: string) { super(message); } }

async function request<T>(path: string, method = 'GET', body?: object): Promise<T> {
  const config = loadCloudflareConfig();
  if (!config.token) throw new Error('TRINITY에 다시 로그인해 주세요.');
  let response: Response;
  try {
    response = await fetch(`${config.url.replace(/\/+$/, '')}/api/ypt/${path}`, {
      method,
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store', signal: AbortSignal.timeout(20_000),
    });
  } catch { throw new Error('열품타 상태를 확인할 수 없습니다. 연결 상태를 확인해 주세요.'); }
  let payload: { error?: string; code?: string };
  try { payload = await response.json() as { error?: string; code?: string }; }
  catch { throw new Error('열품타 응답을 확인할 수 없습니다. 앱에서 타이머 상태를 확인해 주세요.'); }
  if (!response.ok) throw new YptHttpError(response.status, payload.error || '열품타 요청에 실패했습니다. 앱에서 상태를 확인해 주세요.');
  return payload as T;
}

export const getYptStatus = async (): Promise<YptStatus> => {
  try { return await request<YptStatus>('status'); }
  catch (error) {
    // During rollout the existing production Worker has no YPT routes yet.
    if (error instanceof YptHttpError && error.status === 404) return { connected: false, state: 'disconnected', subjects: [], mapping: {}, activeStartedAt: null, activeSubject: null };
    throw error;
  }
};
export const connectYpt = (email: string, password: string) => request<YptStatus>('connect', 'POST', { email, password });
export const disconnectYpt = () => request<YptStatus>('connect', 'DELETE');
export const saveYptMapping = (mapping: Partial<Record<Subject, string>>) => request<YptStatus>('mapping', 'PUT', { mapping });
export const startYpt = (subject: Subject) => request<YptTransition>('start', 'POST', { subject });
export const stopYpt = () => request<YptTransition>('stop', 'POST');
export const resolveYpt = () => request<YptStatus>('resolve', 'POST', { confirmedStopped: true });
