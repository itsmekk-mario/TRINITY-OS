import type { AppData } from '../types';
import { initialData } from './storage';
import { trustedWorkerUrl } from './runtimeConfig';

const CONFIG_KEY = 'trinity-os:cloudflare-sync:v2';
const LEGACY_CONFIG_KEY = 'trinity-os:cloudflare-sync:v1';
const AUTH_KEY = 'trinity-os:auth-session:v1';
const keyForUser = (name: string, userId: number | string) => `trinity-os:${name}:${userId}:v1`;
export type CloudflareConfig = { url: string; token: string; username?: string; userId?: number; mustChangePassword?: boolean };
type RemotePayload = { data?: AppData | null; updatedAt?: string | null };
type AutoSyncMetadata = { localSignature: string; remoteUpdatedAt: string | null };
export type AutoSyncResult = { action: 'disabled' | 'uploaded' | 'downloaded' | 'unchanged'; data?: AppData; updatedAt?: string | null };

export const loadCloudflareConfig = (): CloudflareConfig => {
  try {
    // v1 contained the Bearer token in localStorage. Do not retain it after upgrade.
    localStorage.removeItem(LEGACY_CONFIG_KEY);
    const publicConfig = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}') as Omit<CloudflareConfig, 'token'>;
    const privateConfig = JSON.parse(sessionStorage.getItem(AUTH_KEY) || '{}') as Pick<CloudflareConfig, 'token'>;
    return { ...publicConfig, ...privateConfig, url: trustedWorkerUrl(publicConfig.url), token: privateConfig.token || '' };
  } catch { return { url: trustedWorkerUrl(), token: '', username: '' }; }
};
export const saveCloudflareConfig = (config: CloudflareConfig) => {
  const url = trustedWorkerUrl(config.url);
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ url, username: config.username || '', userId: config.userId, mustChangePassword: Boolean(config.mustChangePassword) }));
  if (config.token) sessionStorage.setItem(AUTH_KEY, JSON.stringify({ token: config.token }));
  else sessionStorage.removeItem(AUTH_KEY);
};

const signature = (data: AppData) => JSON.stringify(data);
const initialSignature = () => signature(initialData);

function loadAutoSyncMetadata(userId: number | string): AutoSyncMetadata | null {
  try {
    const value = localStorage.getItem(keyForUser('cloudflare-auto-sync', userId));
    return value ? JSON.parse(value) as AutoSyncMetadata : null;
  } catch { return null; }
}

function saveAutoSyncMetadata(userId: number | string, localSignature: string, remoteUpdatedAt: string | null) {
  localStorage.setItem(keyForUser('cloudflare-auto-sync', userId), JSON.stringify({ localSignature, remoteUpdatedAt } satisfies AutoSyncMetadata));
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
export async function autoSyncCloudflareData(data: AppData, userId: number | string): Promise<AutoSyncResult> {
  const config = loadCloudflareConfig();
  if (!config.url || !config.token || config.userId !== Number(userId)) return { action: 'disabled' };

  const localSignature = signature(data);
  const metadata = loadAutoSyncMetadata(userId);
  const remote = await fetchCloudflareData(config);
  const remoteSignature = remote.data ? signature(remote.data) : null;
  const localChanged = !metadata || metadata.localSignature !== localSignature;
  const remoteChanged = Boolean(remote.updatedAt && remote.updatedAt !== metadata?.remoteUpdatedAt);

  if (remote.data && ((!metadata && localSignature === initialSignature()) || (!localChanged && remoteChanged))) {
    saveAutoSyncMetadata(userId, remoteSignature!, remote.updatedAt ?? null);
    return { action: 'downloaded', data: remote.data, updatedAt: remote.updatedAt };
  }
  if (remoteSignature === localSignature) {
    saveAutoSyncMetadata(userId, localSignature, remote.updatedAt ?? null);
    return { action: 'unchanged', updatedAt: remote.updatedAt };
  }

  const saved = await uploadCloudflareData(data, config);
  saveAutoSyncMetadata(userId, localSignature, saved.updatedAt ?? null);
  return { action: 'uploaded', updatedAt: saved.updatedAt ?? null };
}

export function saveRecoveryCopy(userId: number | string, data: AppData) {
  localStorage.setItem(keyForUser('cloudflare-recovery', userId), JSON.stringify({ savedAt: new Date().toISOString(), data }));
}

export function loadRecoveryCopy(userId: number | string): { savedAt: string; data: AppData } | null {
  try {
    const value = localStorage.getItem(keyForUser('cloudflare-recovery', userId));
    return value ? JSON.parse(value) as { savedAt: string; data: AppData } : null;
  } catch { return null; }
}

export function clearUserSyncState(userId: number | string) {
  localStorage.removeItem(keyForUser('cloudflare-auto-sync', userId));
  localStorage.removeItem(keyForUser('cloudflare-recovery', userId));
}
