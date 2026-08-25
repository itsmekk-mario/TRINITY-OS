import type { AppData } from '../types';

const CONFIG_KEY = 'trinity-os:cloudflare-sync:v1';
export const RECOVERY_KEY = 'trinity-os:cloudflare-recovery:v1';
export type CloudflareConfig = { url: string; token: string; username?: string };
type RemotePayload = { data?: AppData | null; updatedAt?: string | null };

export const loadCloudflareConfig = (): CloudflareConfig => {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || '{"url":"","token":""}') as CloudflareConfig; }
  catch { return { url: '', token: '', username: '' }; }
};
export const saveCloudflareConfig = (config: CloudflareConfig) => localStorage.setItem(CONFIG_KEY, JSON.stringify(config));

function requestParts(config: CloudflareConfig) {
  if (!config.url || !config.token) throw new Error('Worker URL과 동기화 토큰을 입력하세요.');
  return {
    base: config.url.replace(/\/+$/, ''),
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
  };
}

export async function fetchCloudflareData(config: CloudflareConfig): Promise<RemotePayload> {
  const { base, headers } = requestParts(config);
  const response = await fetch(`${base}/api/sync`, { headers, cache: 'no-store' });
  if (!response.ok) throw new Error(`Worker 연결 실패 (${response.status})`);
  return response.json() as Promise<RemotePayload>;
}

export async function uploadCloudflareData(data: AppData, config: CloudflareConfig) {
  const { base, headers } = requestParts(config);
  const response = await fetch(`${base}/api/sync`, { method: 'PUT', headers, body: JSON.stringify({ data }) });
  if (!response.ok) throw new Error(`Worker 저장 실패 (${response.status})`);
  return response.json() as Promise<{ ok: boolean; updatedAt?: string }>;
}

export function saveRecoveryCopy(data: AppData) {
  localStorage.setItem(RECOVERY_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data }));
}

export function loadRecoveryCopy(): { savedAt: string; data: AppData } | null {
  try {
    const value = localStorage.getItem(RECOVERY_KEY);
    return value ? JSON.parse(value) as { savedAt: string; data: AppData } : null;
  } catch { return null; }
}
