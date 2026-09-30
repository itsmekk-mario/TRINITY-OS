import type { AppData } from '../types';
import { initialData } from './storage';
import { trustedWorkerUrl } from './runtimeConfig';

const CONFIG_KEY = 'trinity-os:cloudflare-sync:v2';
const LEGACY_CONFIG_KEY = 'trinity-os:cloudflare-sync:v1';
const AUTH_KEY = 'trinity-os:auth-session:v1';
const keyForUser = (name: string, userId: number | string) => `trinity-os:${name}:${userId}:v1`;
const AUTO_SYNC_KEY = (userId: number | string) => `trinity-os:cloudflare-auto-sync-tab:${userId}:v2`;
const DEVICE_SYNC_KEY = (userId: number | string) => `trinity-os:cloudflare-auto-sync-device:${userId}:v1`;
export type CloudflareConfig = { url: string; token: string; username?: string; userId?: number; mustChangePassword?: boolean };
type RemotePayload = { data?: AppData | null; updatedAt?: string | null };
type AutoSyncMetadata = { localSignature: string; remoteUpdatedAt: string | null };
export type AutoSyncResult = {
  action: 'disabled' | 'uploaded' | 'downloaded' | 'unchanged' | 'conflict';
  data?: AppData;
  updatedAt?: string | null;
  reason?: string;
};

class SyncConflictError extends Error {
  constructor(message: string, public updatedAt: string | null) {
    super(message);
    this.name = 'SyncConflictError';
  }
}

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

/**
 * The active tab keeps its own compare-and-swap baseline in sessionStorage.
 * A second device-scoped baseline is persisted in localStorage only to bootstrap a
 * newly opened tab. Once a tab has its own baseline, it never adopts revisions observed
 * by another tab, so stale tabs still cannot inherit a newer CAS revision and overwrite it.
 */
function parseAutoSyncMetadata(value: string | null): AutoSyncMetadata | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<AutoSyncMetadata>;
    if (typeof parsed.localSignature !== 'string') return null;
    if (parsed.remoteUpdatedAt !== null && typeof parsed.remoteUpdatedAt !== 'string') return null;
    return { localSignature: parsed.localSignature, remoteUpdatedAt: parsed.remoteUpdatedAt ?? null };
  } catch { return null; }
}

function loadAutoSyncMetadata(userId: number | string): AutoSyncMetadata | null {
  return parseAutoSyncMetadata(sessionStorage.getItem(AUTO_SYNC_KEY(userId)));
}

function loadDeviceSyncMetadata(userId: number | string): AutoSyncMetadata | null {
  const current = parseAutoSyncMetadata(localStorage.getItem(DEVICE_SYNC_KEY(userId)));
  if (current) return current;

  // One-time migration from the pre-2026-09-29 shared baseline. It is only used as a
  // bootstrap reference; every write is still protected by expectedUpdatedAt on the server.
  const legacyKey = keyForUser('cloudflare-auto-sync', userId);
  const legacy = parseAutoSyncMetadata(localStorage.getItem(legacyKey));
  if (!legacy) return null;
  localStorage.setItem(DEVICE_SYNC_KEY(userId), JSON.stringify(legacy));
  localStorage.removeItem(legacyKey);
  return legacy;
}

function saveAutoSyncMetadata(userId: number | string, localSignature: string, remoteUpdatedAt: string | null) {
  const value = JSON.stringify({ localSignature, remoteUpdatedAt } satisfies AutoSyncMetadata);
  sessionStorage.setItem(AUTO_SYNC_KEY(userId), value);
  localStorage.setItem(DEVICE_SYNC_KEY(userId), value);
}

/**
 * Manual sync is the explicit conflict-resolution action. Once the user chooses a
 * direction, persist that exact state/revision as both the tab and device baseline so
 * the next automatic sync can continue instead of asking for the same decision again.
 */
export function rememberCloudflareSyncBaseline(
  userId: number | string,
  data: AppData,
  remoteUpdatedAt: string | null,
) {
  saveAutoSyncMetadata(userId, signature(data), remoteUpdatedAt);
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

export async function uploadCloudflareData(
  data: AppData,
  config: CloudflareConfig,
  options?: { expectedUpdatedAt?: string | null },
) {
  const { base, headers } = requestParts(config);
  const body: { data: AppData; expectedUpdatedAt?: string | null } = { data };
  if (options && Object.prototype.hasOwnProperty.call(options, 'expectedUpdatedAt')) {
    body.expectedUpdatedAt = options.expectedUpdatedAt ?? null;
  }
  const response = await fetch(`${base}/api/sync`, { method: 'PUT', headers, body: JSON.stringify(body) });
  if (response.status === 409) {
    let payload: { error?: string; updatedAt?: string | null } = {};
    try { payload = await response.json() as typeof payload; } catch { /* no body */ }
    throw new SyncConflictError(payload.error || '다른 기기 또는 탭에서 데이터가 먼저 변경되었습니다.', payload.updatedAt ?? null);
  }
  if (!response.ok) throw new Error(`Worker 저장 실패 (${response.status})`);
  return response.json() as Promise<{ ok: boolean; updatedAt?: string }>;
}

/**
 * Synchronize using optimistic concurrency.
 * - Same state: accept and refresh the tab baseline.
 * - Only remote changed: download.
 * - Only this tab changed: conditional PUT using the revision this tab actually observed.
 * - Both changed / unknown baseline: never auto-overwrite; surface a conflict instead.
 */
export async function autoSyncCloudflareData(data: AppData, userId: number | string): Promise<AutoSyncResult> {
  const config = loadCloudflareConfig();
  if (!config.url || !config.token || config.userId !== Number(userId)) return { action: 'disabled' };

  const localSignature = signature(data);
  const tabMetadata = loadAutoSyncMetadata(userId);
  const metadata = tabMetadata ?? loadDeviceSyncMetadata(userId);
  const remote = await fetchCloudflareData(config);
  const remoteSignature = remote.data ? signature(remote.data) : null;

  if (remoteSignature === localSignature) {
    saveAutoSyncMetadata(userId, localSignature, remote.updatedAt ?? null);
    return { action: 'unchanged', updatedAt: remote.updatedAt };
  }

  const conflict = (reason: string, updatedAt = remote.updatedAt ?? null): AutoSyncResult => {
    saveRecoveryCopy(userId, data);
    return { action: 'conflict', updatedAt, reason };
  };

  if (!remote.data) {
    if (metadata?.remoteUpdatedAt) {
      return conflict('서버 상태가 이 탭이 마지막으로 확인한 상태와 달라 자동 저장을 중단했습니다.', null);
    }
    try {
      const saved = await uploadCloudflareData(data, config, { expectedUpdatedAt: null });
      saveAutoSyncMetadata(userId, localSignature, saved.updatedAt ?? null);
      return { action: 'uploaded', updatedAt: saved.updatedAt ?? null };
    } catch (error) {
      if (error instanceof SyncConflictError) return conflict(error.message, error.updatedAt);
      throw error;
    }
  }

  if (!metadata) {
    if (localSignature === initialSignature()) {
      saveAutoSyncMetadata(userId, remoteSignature!, remote.updatedAt ?? null);
      return { action: 'downloaded', data: remote.data, updatedAt: remote.updatedAt };
    }
    return conflict('이 기기에는 서버 기준 버전 정보가 없습니다. 최초 1회 동기화 방향을 직접 선택해 주세요.');
  }

  const localChanged = metadata.localSignature !== localSignature;
  const remoteChanged = metadata.remoteUpdatedAt !== (remote.updatedAt ?? null);

  if (!localChanged && remoteChanged) {
    saveAutoSyncMetadata(userId, remoteSignature!, remote.updatedAt ?? null);
    return { action: 'downloaded', data: remote.data, updatedAt: remote.updatedAt };
  }

  if (localChanged && remoteChanged) {
    return conflict('이 기기와 서버가 모두 변경되었습니다. 자동 덮어쓰기를 차단했습니다.');
  }

  if (!localChanged && !remoteChanged) {
    return conflict('동기화 기준과 실제 데이터가 일치하지 않습니다. 자동 덮어쓰기를 차단했습니다.');
  }

  try {
    const saved = await uploadCloudflareData(data, config, { expectedUpdatedAt: metadata.remoteUpdatedAt });
    saveAutoSyncMetadata(userId, localSignature, saved.updatedAt ?? null);
    return { action: 'uploaded', updatedAt: saved.updatedAt ?? null };
  } catch (error) {
    if (error instanceof SyncConflictError) return conflict(error.message, error.updatedAt);
    throw error;
  }
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
  // Clear legacy, device-scoped, and tab-scoped sync baselines for this account.
  localStorage.removeItem(keyForUser('cloudflare-auto-sync', userId));
  localStorage.removeItem(DEVICE_SYNC_KEY(userId));
  sessionStorage.removeItem(AUTO_SYNC_KEY(userId));
  localStorage.removeItem(keyForUser('cloudflare-recovery', userId));
}
