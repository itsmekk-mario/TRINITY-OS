import type { AppData } from '../types';

const CONFIG_KEY = 'trinity-os:cloudflare-sync:v1';
type Config = { url: string; token: string };
export const loadCloudflareConfig = (): Config => { try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || '{"url":"","token":""}') as Config; } catch { return { url: '', token: '' }; } };
export const saveCloudflareConfig = (config: Config) => localStorage.setItem(CONFIG_KEY, JSON.stringify(config));

export async function cloudflareSync(data: AppData, config: Config) {
  if (!config.url || !config.token) throw new Error('Worker URL과 동기화 토큰을 입력하세요.');
  const base = config.url.replace(/\/$/, '');
  const headers = { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' };
  const remoteResponse = await fetch(`${base}/api/sync`, { headers });
  if (!remoteResponse.ok) throw new Error(`Worker 연결 실패 (${remoteResponse.status})`);
  const remotePayload = await remoteResponse.json() as { data?: AppData | null };
  const remote = remotePayload.data;
  if (!remote) { const created = await fetch(`${base}/api/sync`, { method: 'PUT', headers, body: JSON.stringify({ data }) }); if (!created.ok) throw new Error(`Worker 저장 실패 (${created.status})`); return data; }
  const merged: AppData = {
    ...data, ...remote, calendar: { ...data.calendar, ...remote.calendar }, journals: { ...data.journals, ...remote.journals }, plaire: { ...data.plaire, ...remote.plaire },
    sessions: [...new Map([...data.sessions, ...remote.sessions].map(x => [x.id, x])).values()], scores: [...new Map([...data.scores, ...remote.scores].map(x => [x.id, x])).values()], trinity: [...new Map([...data.trinity, ...remote.trinity].map(x => [x.id, x])).values()], resources: [...new Map([...data.resources, ...remote.resources].map(x => [x.id, x])).values()], goals: [...new Map([...data.goals, ...remote.goals].map(x => [x.id, x])).values()], routine: [...new Map([...data.routine, ...remote.routine].map(x => [x.id, x])).values()],
  };
  const saved = await fetch(`${base}/api/sync`, { method: 'PUT', headers, body: JSON.stringify({ data: merged }) });
  if (!saved.ok) throw new Error(`Worker 저장 실패 (${saved.status})`);
  return merged;
}
