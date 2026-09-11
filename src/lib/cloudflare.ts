import type { AppData } from '../types';
import { initialData } from './storage';

const CONFIG_KEY = 'trinity-os:cloudflare-sync:v1';
const AUTO_SYNC_KEY = 'trinity-os:cloudflare-auto-sync:v1';
export const RECOVERY_KEY = 'trinity-os:cloudflare-recovery:v1';
export type CloudflareConfig = { url: string; token: string; username?: string };
type RemotePayload = { data?: AppData | null; updatedAt?: string | null };
type AutoSyncMetadata = { localSignature: string; remoteUpdatedAt: string | null };
export type AutoSyncResult = { action: 'disabled' | 'uploaded' | 'downloaded' | 'unchanged'; data?: AppData; updatedAt?: string | null };

export const loadCloudflareConfig = (): CloudflareConfig => {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || '{"url":"","token":""}') as CloudflareConfig; }
  catch { return { url: '', token: '', username: '' }; }
};
export const saveCloudflareConfig = (config: CloudflareConfig) => localStorage.setItem(CONFIG_KEY, JSON.stringify(config));

const signature = (data: AppData) => JSON.stringify(data);
const initialSignature = () => signature(initialData);

function loadAutoSyncMetadata(): AutoSyncMetadata | null {
  try {
    const value = localStorage.getItem(AUTO_SYNC_KEY);
    return value ? JSON.parse(value) as AutoSyncMetadata : null;
  } catch { return null; }
}

function saveAutoSyncMetadata(localSignature: string, remoteUpdatedAt: string | null) {
  localStorage.setItem(AUTO_SYNC_KEY, JSON.stringify({ localSignature, remoteUpdatedAt } satisfies AutoSyncMetadata));
}

function requestParts(config: CloudflareConfig) {
  if (!config.url || !config.token) throw new Error('Worker 주소를 확인하고 로그인해 주세요.');
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

/** Keeps browser data and D1 synchronized, preferring local changes on conflict. */
export async function autoSyncCloudflareData(data: AppData): Promise<AutoSyncResult> {
  const config = loadCloudflareConfig();
  if (!config.url || !config.token) return { action: 'disabled' };

  const localSignature = signature(data);
  const metadata = loadAutoSyncMetadata();
  const remote = await fetchCloudflareData(config);
  const remoteSignature = remote.data ? signature(remote.data) : null;
  const localChanged = !metadata || metadata.localSignature !== localSignature;
  const remoteChanged = Boolean(remote.updatedAt && remote.updatedAt !== metadata?.remoteUpdatedAt);

  if (remote.data && ((!metadata && localSignature === initialSignature()) || (!localChanged && remoteChanged))) {
    saveAutoSyncMetadata(remoteSignature!, remote.updatedAt ?? null);
    return { action: 'downloaded', data: remote.data, updatedAt: remote.updatedAt };
  }
  if (remoteSignature === localSignature) {
    saveAutoSyncMetadata(localSignature, remote.updatedAt ?? null);
    return { action: 'unchanged', updatedAt: remote.updatedAt };
  }

  const saved = await uploadCloudflareData(data, config);
  saveAutoSyncMetadata(localSignature, saved.updatedAt ?? null);
  return { action: 'uploaded', updatedAt: saved.updatedAt ?? null };
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
