import { loadCloudflareConfig, saveCloudflareConfig } from './cloudflare';

export type AuthResult = { token: string; username: string };

async function post(path: string, url: string, body: unknown): Promise<AuthResult> {
  const base = url.trim().replace(/\/+$/, '');
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as AuthResult & { error?: string };
  if (!response.ok) throw new Error(payload.error || `인증 실패 (${response.status})`);
  saveCloudflareConfig({ url: base, token: payload.token, username: payload.username });
  return payload;
}

export const login = (url: string, username: string, password: string) =>
  post('/api/auth/login', url, { username, password });

export const register = (url: string, username: string, password: string, setupToken: string) =>
  post('/api/auth/register', url, { username, password, setupToken });

export async function validateSession() {
  const config = loadCloudflareConfig();
  if (!config.url || !config.token) return false;
  try {
    const response = await fetch(`${config.url.replace(/\/+$/, '')}/api/auth/me`, {
      headers: { Authorization: `Bearer ${config.token}` }, cache: 'no-store',
    });
    return response.ok;
  } catch { return false; }
}

export function logoutLocal() {
  const config = loadCloudflareConfig();
  saveCloudflareConfig({ url: config.url, token: '', username: '' });
}
