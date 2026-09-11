import type { ArenaBootstrap, ArenaGroup, ArenaProfile, ArenaRankingEntry, ArenaScore } from '../types';
import { loadCloudflareConfig } from './cloudflare';

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const config = loadCloudflareConfig();
  if (!config.url || !config.token) throw new Error('Arena를 사용하려면 로그인이 필요합니다.');
  const response = await fetch(`${config.url.replace(/\/+$/, '')}${path}`, {
    method,
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || `Arena 요청에 실패했습니다. (${response.status})`);
  return payload;
}

export const fetchArena = () => request<ArenaBootstrap>('/api/arena');
export const saveArenaProfile = (profile: ArenaProfile) => request<{ profile: ArenaProfile }>('/api/arena/profile', 'PUT', profile);
export const publishArenaScore = (score: ArenaScore) => request<{ ok: true; achievements: ArenaBootstrap['achievements'] }>('/api/arena/score', 'POST', score);
export const createArenaGroup = (group: Pick<ArenaGroup, 'name' | 'type' | 'targetUniversity' | 'targetDepartment' | 'visibility'>) => request<{ group: ArenaGroup }>('/api/arena/groups', 'POST', group);
export const joinArenaGroup = (groupIdOrCode: string) => request<{ ok: true }>('/api/arena/groups/join', 'POST', { groupIdOrCode });
export const fetchArenaRanking = (groupId?: string) => request<{ ranking: ArenaRankingEntry[] }>(`/api/arena/ranking${groupId ? `?group=${encodeURIComponent(groupId)}` : ''}`);
export const addArenaRival = (rivalUserId: number) => request<{ ok: true }>('/api/arena/rivals', 'POST', { rivalUserId });
export const removeArenaRival = (rivalUserId: number) => request<{ ok: true }>(`/api/arena/rivals/${rivalUserId}`, 'DELETE');
export const requestArenaCoach = (context: unknown) => request<{ message: string; cached?: boolean }>('/api/ai/arena-coach', 'POST', { context });
