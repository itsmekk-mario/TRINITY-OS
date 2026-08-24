import type { AppData } from '../types';

const DISCOVERY_SCRIPT = 'https://accounts.google.com/gsi/client';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const FILE_NAME = 'trinity-os-sync.json';
let tokenClient: { requestAccessToken: (options?: { prompt?: string }) => void } | null = null;
let accessToken = '';

type GoogleWindow = Window & { google?: { accounts?: { oauth2?: { initTokenClient: (options: { client_id: string; scope: string; callback: (response: { access_token?: string; error?: string }) => void; error_callback?: (error: unknown) => void }) => typeof tokenClient } } } };

function loadGoogleScript() {
  return new Promise<void>((resolve, reject) => {
    if ((window as GoogleWindow).google?.accounts?.oauth2) return resolve();
    const existing = document.querySelector(`script[src="${DISCOVERY_SCRIPT}"]`);
    if (existing) { existing.addEventListener('load', () => resolve()); existing.addEventListener('error', () => reject(new Error('Google 인증 라이브러리를 불러오지 못했습니다.'))); return; }
    const script = document.createElement('script'); script.src = DISCOVERY_SCRIPT; script.async = true; script.defer = true; script.onload = () => resolve(); script.onerror = () => reject(new Error('Google 인증 라이브러리를 불러오지 못했습니다.')); document.head.appendChild(script);
  });
}

export async function authorize(clientId: string) {
  if (!clientId.trim()) throw new Error('Google OAuth Client ID를 먼저 입력하세요.');
  await loadGoogleScript();
  return new Promise<string>((resolve, reject) => {
    const google = (window as GoogleWindow).google;
    if (!google?.accounts?.oauth2) return reject(new Error('Google 인증을 초기화하지 못했습니다.'));
    tokenClient = google.accounts.oauth2.initTokenClient({ client_id: clientId.trim(), scope: DRIVE_SCOPE, callback: (response) => response.access_token ? resolve(response.access_token) : reject(new Error(response.error ?? 'Google 인증이 취소되었습니다.')), error_callback: () => reject(new Error('Google 인증 창을 닫았거나 인증에 실패했습니다.')) });
    tokenClient?.requestAccessToken({ prompt: accessToken ? '' : 'consent' });
  }).then((token) => { accessToken = token; return token; });
}

async function driveFetch(path: string, options: RequestInit = {}) {
  const response = await fetch(`https://www.googleapis.com/drive/v3${path}`, { ...options, headers: { Authorization: `Bearer ${accessToken}`, ...(options.headers ?? {}) } });
  if (!response.ok) { const message = await response.text(); throw new Error(`Google Drive 오류 (${response.status}): ${message.slice(0, 180)}`); }
  return response;
}

async function findSyncFile() {
  const query = encodeURIComponent(`name = '${FILE_NAME}' and 'appDataFolder' in parents and trashed = false`);
  const response = await driveFetch(`/files?q=${query}&spaces=appDataFolder&fields=files(id,name,modifiedTime)&pageSize=1`);
  const json = await response.json() as { files?: { id: string; name: string; modifiedTime?: string }[] };
  return json.files?.[0] ?? null;
}

function multipartBody(metadata: unknown, content: string) {
  const boundary = `trinity_${crypto.randomUUID?.() ?? Date.now()}`;
  return { body: `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`, contentType: `multipart/related; boundary=${boundary}` };
}

async function createSyncFile(data: AppData) {
  const envelope = JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), data });
  const multipart = multipartBody({ name: FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' }, envelope);
  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime', { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': multipart.contentType }, body: multipart.body });
  if (!response.ok) throw new Error(`Google Drive 파일 생성 실패 (${response.status})`);
  return response.json() as Promise<{ id: string }>;
}

async function updateSyncFile(id: string, data: AppData) {
  const envelope = JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), data });
  const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, { method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: envelope });
  if (!response.ok) throw new Error(`Google Drive 파일 갱신 실패 (${response.status})`);
}

export async function syncDrive(data: AppData): Promise<{ data: AppData; action: 'uploaded' | 'merged' }> {
  const file = await findSyncFile();
  if (!file) { await createSyncFile(data); return { data, action: 'uploaded' }; }
  const remoteResponse = await driveFetch(`/files/${file.id}?alt=media`); const payload = await remoteResponse.json() as { data?: AppData };
  const remote = payload.data;
  if (!remote) { await updateSyncFile(file.id, data); return { data, action: 'uploaded' }; }
  const merged: AppData = {
    ...data, ...remote, calendar: { ...data.calendar, ...remote.calendar }, journals: { ...data.journals, ...remote.journals }, plaire: { ...data.plaire, ...remote.plaire },
    sessions: [...new Map([...data.sessions, ...remote.sessions].map((item) => [item.id, item])).values()], scores: [...new Map([...data.scores, ...remote.scores].map((item) => [item.id, item])).values()],
    trinity: [...new Map([...data.trinity, ...remote.trinity].map((item) => [item.id, item])).values()], resources: [...new Map([...data.resources, ...remote.resources].map((item) => [item.id, item])).values()], goals: [...new Map([...data.goals, ...remote.goals].map((item) => [item.id, item])).values()], routine: [...new Map([...data.routine, ...remote.routine].map((item) => [item.id, item])).values()],
  };
  await updateSyncFile(file.id, merged); return { data: merged, action: 'merged' };
}
