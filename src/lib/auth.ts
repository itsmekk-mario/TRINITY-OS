import { clearUserSyncState, loadCloudflareConfig, saveCloudflareConfig } from './cloudflare';
import { clearUserData } from './storage';

export type AuthResult = { token: string; username: string; userId: number; mustChangePassword?: boolean };
export type SessionIdentity = Pick<AuthResult, 'username' | 'userId' | 'mustChangePassword'>;

async function post(path: string, url: string, body: unknown): Promise<AuthResult> {
  const base = url.trim().replace(/\/+$/, '');
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as AuthResult & { error?: string };
  if (!response.ok) throw new Error(payload.error || `인증에 실패했습니다. (${response.status})`);
  saveCloudflareConfig({ url: base, token: payload.token, username: payload.username, userId: payload.userId, mustChangePassword: payload.mustChangePassword });
  return payload;
}

export const login = (url: string, username: string, password: string) =>
  post('/api/auth/login', url, { username, password });

export const register = (url: string, username: string, password: string, setupToken: string) =>
  post('/api/auth/register', url, { username, password, setupToken });

export async function changePassword(currentPassword: string, newPassword: string) {
  const config = loadCloudflareConfig();
  if (!config.url || !config.token) throw new Error('다시 로그인해 주세요.');
  const response = await fetch(`${config.url.replace(/\/+$/, '')}/api/auth/change-password`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const payload = await response.json() as AuthResult & { error?: string };
  if (!response.ok || !payload.token) throw new Error(payload.error || '비밀번호 변경에 실패했습니다.');
  saveCloudflareConfig({ url: config.url, token: payload.token, username: payload.username, userId: payload.userId, mustChangePassword: false });
  return payload;
}

export async function validateSession(): Promise<SessionIdentity | null> {
  const config = loadCloudflareConfig();
  if (!config.url || !config.token) return null;
  try {
    const response = await fetch(`${config.url.replace(/\/+$/, '')}/api/auth/me`, {
      headers: { Authorization: `Bearer ${config.token}` }, cache: 'no-store',
    });
    if (!response.ok) return null;
    const identity = await response.json() as SessionIdentity;
    saveCloudflareConfig({ ...config, username: identity.username, userId: identity.userId, mustChangePassword: identity.mustChangePassword });
    return identity;
  } catch { return null; }
}

export function logoutLocal() {
  const config = loadCloudflareConfig();
  if (config.userId !== undefined) {
    clearUserData(config.userId); clearUserSyncState(config.userId); localStorage.removeItem(`trinity-os:active-clock:${config.userId}:v2`);
    for (let index = localStorage.length - 1; index >= 0; index -= 1) { const key = localStorage.key(index); if (key?.startsWith(`trinity-os:ai-study-analysis:v1:${config.userId}:`)) localStorage.removeItem(key); }
  }
  saveCloudflareConfig({ url: config.url, token: '', username: '', mustChangePassword: false });
}

export async function logout() {
  const config=loadCloudflareConfig();
  try {
    if(config.url&&config.token)await fetch(`${config.url.replace(/\/+$/,'')}/api/auth/logout`,{method:'POST',headers:{Authorization:`Bearer ${config.token}`,'Content-Type':'application/json'}});
  } finally { logoutLocal(); }
}
