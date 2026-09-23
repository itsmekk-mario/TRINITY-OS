import type { Env } from './index.ts';
import { boundedJson } from './security.ts';

type Json = (body: unknown, status?: number, origin?: string) => Response;
type State = 'idle' | 'starting' | 'running' | 'stopping' | 'uncertain';
type Row = { user_id: number; encrypted_jwt: string; subjects_json: string; mapping_json: string; state: State; active_started_at: number | null; active_subject: string | null; pending_id: string | null; connected_at: string; updated_at: string };
type YptReply = { s?: boolean; jwt?: unknown; ss?: unknown; c?: unknown; dl?: unknown };
const BASE = 'https://pi.tgclab.com';
const DEVICE = 'SM-S921N';
const SUBJECTS = ['국어', '수학', '영어', '통사', '통과', '탐구'] as const;
type Subject = typeof SUBJECTS[number];

const bytesToBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const base64ToBytes = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
async function key(env: Env): Promise<CryptoKey> {
  if (!env.YPT_ENCRYPTION_KEY) throw new Error('YPT encryption key is not configured');
  let raw: Uint8Array;
  try { raw = base64ToBytes(env.YPT_ENCRYPTION_KEY); } catch { throw new Error('Invalid YPT encryption key'); }
  if (raw.byteLength !== 32) throw new Error('Invalid YPT encryption key');
  return crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function encrypt(env: Env, plain: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(env), new TextEncoder().encode(plain));
  return `v1:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(sealed))}`;
}
async function decrypt(env: Env, sealed: string) {
  const [version, iv, body] = sealed.split(':');
  if (version !== 'v1' || !iv || !body) throw new Error('Invalid YPT credential');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(iv) as BufferSource }, await key(env), base64ToBytes(body) as BufferSource);
  return new TextDecoder().decode(plain);
}

class YptError extends Error {
  constructor(public code: 'REJECTED' | 'AUTH_EXPIRED' | 'UNCERTAIN') { super(code); }
}
async function ypt(path: string, body: object, jwt?: string): Promise<YptReply> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000), headers: { 'Content-Type': 'application/json', 'User-Agent': 'Dart/3.11 (dart:io)', ...(jwt ? { Authorization: `JWT ${jwt}` } : {}) }, body: JSON.stringify(body) });
  } catch { throw new YptError('UNCERTAIN'); }
  let data: YptReply;
  try { data = await response.json() as YptReply; } catch { throw new YptError('UNCERTAIN'); }
  if (response.status === 401 || response.status === 403 || data?.c === '112') throw new YptError('AUTH_EXPIRED');
  if (!response.ok) throw new YptError('UNCERTAIN');
  if (data?.s !== true) throw new YptError('REJECTED');
  if (path.startsWith('/study/') && (!data.dl || typeof data.dl !== 'object' || Array.isArray(data.dl))) throw new YptError('UNCERTAIN');
  return data;
}
function titles(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(item => item && typeof item === 'object' && item.dl !== true).map(item => ['tt', 't', 'title', 'subject', 'subjectName', 'subjectTitle'].map(field => item[field]).find(title => typeof title === 'string' && title.trim())?.trim()).filter((title): title is string => typeof title === 'string' && title.length > 0))];
}
function mapping(value: string): Partial<Record<Subject, string>> {
  try { const parsed: unknown = JSON.parse(value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Partial<Record<Subject, string>> : {}; } catch { return {}; }
}
function publicState(row: Row | null) {
  if (!row) return { connected: false, state: 'disconnected', subjects: [], mapping: {}, activeStartedAt: null, activeSubject: null };
  return { connected: true, state: row.state, subjects: JSON.parse(row.subjects_json) as string[], mapping: mapping(row.mapping_json), activeStartedAt: row.active_started_at, activeSubject: row.active_subject };
}
const changed = (result: D1Result) => result.meta?.changes ?? 0;
async function row(db: D1Database, userId: number) { return db.prepare('SELECT * FROM ypt_connections WHERE user_id=?').bind(userId).first<Row>(); }
async function objectBody(request: Request): Promise<Record<string, unknown> | null> {
  const value = await boundedJson<unknown>(request);
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
const errorResponse = (json: Json, origin: string, code: string, status: number, message: string) => json({ error: message, code }, status, origin);

export async function handleYptApi(request: Request, env: Env, userId: number | null, origin: string, json: Json): Promise<Response> {
  if (userId === null) return errorResponse(json, origin, 'UNAUTHORIZED', 401, '다시 로그인해 주세요.');
  const { pathname } = new URL(request.url);
  const db = env.DB;
  const current = await row(db, userId);
  if (pathname === '/api/ypt/status' && request.method === 'GET') return json(publicState(current), 200, origin);

  if (pathname === '/api/ypt/connect' && request.method === 'POST') {
    if (current && (current.state === 'starting' || current.state === 'stopping')) return errorResponse(json, origin, 'ACTIVE', 409, '진행 중인 요청이 끝난 뒤 다시 연결해 주세요.');
    const body = await objectBody(request);
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!email || email.length > 254 || !password || password.length > 256) return errorResponse(json, origin, 'INVALID_INPUT', 400, '열품타 이메일과 비밀번호를 입력해 주세요.');
    try {
      const login = await ypt('/user/sign-in-jwt', { email, password, loginProvider: 'Email', new: true, getx: true, language: 'en' });
      if (typeof login.jwt !== 'string' || !login.jwt) return errorResponse(json, origin, 'LOGIN_FAILED', 502, '열품타 인증 토큰을 받지 못했습니다.');
      const info = await ypt('/user/v2/reload/info', { pv: 0, cd: { su: null, sbu: null, cu: null, eu: null, du: null, tu: null } }, login.jwt);
      const subjects = titles(info.ss);
      if (!subjects.length) return errorResponse(json, origin, 'NO_SUBJECTS', 422, '열품타에서 과목을 만들고 다시 연결해 주세요.');
      const encrypted = await encrypt(env, login.jwt);
      const selected = Object.fromEntries(SUBJECTS.filter(subject => subjects.includes(subject)).map(subject => [subject, subject]));
      const now = new Date().toISOString();
      const result = await db.prepare("INSERT INTO ypt_connections(user_id,encrypted_jwt,subjects_json,mapping_json,connected_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET encrypted_jwt=excluded.encrypted_jwt,subjects_json=CASE WHEN ypt_connections.state='idle' THEN excluded.subjects_json ELSE ypt_connections.subjects_json END,mapping_json=CASE WHEN ypt_connections.state='idle' THEN excluded.mapping_json ELSE ypt_connections.mapping_json END,connected_at=excluded.connected_at,updated_at=excluded.updated_at WHERE ypt_connections.state IN ('idle','running','uncertain')").bind(userId, encrypted, JSON.stringify(subjects), JSON.stringify(selected), now, now).run();
      if (!changed(result)) return errorResponse(json, origin, 'ACTIVE', 409, '열품타 타이머 상태가 변경됐습니다.');
      return json(publicState(await row(db, userId)), 200, origin);
    } catch (cause) {
      if (cause instanceof YptError) return errorResponse(json, origin, cause.code, cause.code === 'REJECTED' ? 401 : 502, cause.code === 'REJECTED' ? '열품타 로그인 정보를 확인해 주세요.' : '열품타 연결에 실패했습니다. 다시 시도해 주세요.');
      throw cause;
    }
  }

  if (!current) return errorResponse(json, origin, 'NOT_CONNECTED', 404, '열품타 계정을 먼저 연결해 주세요.');
  if (pathname === '/api/ypt/mapping' && request.method === 'PUT') {
    if (current.state !== 'idle') return errorResponse(json, origin, 'ACTIVE', 409, '타이머가 종료된 뒤 과목을 변경할 수 있습니다.');
    const body = await objectBody(request);
    const input = body?.mapping;
    const known = JSON.parse(current.subjects_json) as string[];
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(subject => !SUBJECTS.includes(subject as Subject) || (input as Record<string, unknown>)[subject] !== '' && !known.includes((input as Record<string, unknown>)[subject] as string))) return errorResponse(json, origin, 'INVALID_MAPPING', 400, '열품타에 있는 과목을 선택해 주세요.');
    const next = Object.fromEntries(Object.entries(input).filter(([,title]) => title !== ''));
    const result = await db.prepare("UPDATE ypt_connections SET mapping_json=?,updated_at=? WHERE user_id=? AND state='idle'").bind(JSON.stringify(next), new Date().toISOString(), userId).run();
    if (!changed(result)) return errorResponse(json, origin, 'ACTIVE', 409, '타이머 상태가 변경됐습니다.');
    return json(publicState(await row(db, userId)), 200, origin);
  }
  if (pathname === '/api/ypt/start' && request.method === 'POST') {
    const body = await objectBody(request);
    const subject = body?.subject;
    if (!SUBJECTS.includes(subject as Subject)) return errorResponse(json, origin, 'INVALID_SUBJECT', 400, '과목을 선택해 주세요.');
    const title = mapping(current.mapping_json)[subject as Subject];
    if (!title || !(JSON.parse(current.subjects_json) as string[]).includes(title)) return errorResponse(json, origin, 'UNMAPPED_SUBJECT', 422, '설정에서 열품타 과목을 매핑해 주세요.');
    let token: string;
    try { token = await decrypt(env, current.encrypted_jwt); }
    catch { return errorResponse(json, origin, 'RECONNECT_REQUIRED', 503, '열품타 로그인 갱신이 필요합니다.'); }
    const startedAt = Date.now(), operationId = crypto.randomUUID();
    const acquired = await db.prepare("UPDATE ypt_connections SET state='starting',active_started_at=?,active_subject=?,pending_id=?,updated_at=? WHERE user_id=? AND state='idle'").bind(startedAt, subject, operationId, new Date().toISOString(), userId).run();
    if (!changed(acquired)) return errorResponse(json, origin, 'ACTIVE', 409, '다른 타이머 작업이 진행 중입니다.');
    try {
      await ypt('/study/start', { subject: title, deviceModel: DEVICE, taskId: null }, token);
      const done = await db.prepare("UPDATE ypt_connections SET state='running',pending_id=NULL,updated_at=? WHERE user_id=? AND state='starting' AND pending_id=?").bind(new Date().toISOString(), userId, operationId).run();
      if (!changed(done)) return errorResponse(json, origin, 'UNCERTAIN', 503, '상태 확인이 필요합니다. 열품타 앱을 확인해 주세요.');
      return json({ ok: true, state: 'running', startedAt }, 200, origin);
    } catch (cause) {
      if (cause instanceof YptError && cause.code === 'REJECTED') await db.prepare("UPDATE ypt_connections SET state='idle',active_started_at=NULL,active_subject=NULL,pending_id=NULL WHERE user_id=? AND state='starting' AND pending_id=?").bind(userId, operationId).run();
      else await db.prepare("UPDATE ypt_connections SET state='uncertain',updated_at=? WHERE user_id=? AND state='starting' AND pending_id=?").bind(new Date().toISOString(), userId, operationId).run();
      return errorResponse(json, origin, cause instanceof YptError ? cause.code : 'UNCERTAIN', cause instanceof YptError && cause.code === 'REJECTED' ? 502 : 503, '시작 결과를 확인할 수 없습니다. 열품타 앱을 확인해 주세요.');
    }
  }
  if (pathname === '/api/ypt/stop' && request.method === 'POST') {
    if (current.state === 'idle') return json({ ok: true, state: 'idle', stoppedAt: null }, 200, origin);
    if (current.state !== 'running' || current.active_started_at === null) return errorResponse(json, origin, 'UNCERTAIN', 409, '열품타 앱에서 타이머 상태를 확인해 주세요.');
    let token: string;
    try { token = await decrypt(env, current.encrypted_jwt); }
    catch { return errorResponse(json, origin, 'RECONNECT_REQUIRED', 503, '열품타 로그인 갱신이 필요합니다.'); }
    const stoppedAt = Date.now(), operationId = crypto.randomUUID();
    const acquired = await db.prepare("UPDATE ypt_connections SET state='stopping',pending_id=?,updated_at=? WHERE user_id=? AND state='running' AND active_started_at=?").bind(operationId, new Date().toISOString(), userId, current.active_started_at).run();
    if (!changed(acquired)) return errorResponse(json, origin, 'ACTIVE', 409, '다른 타이머 작업이 진행 중입니다.');
    try {
      await ypt('/study/stop', { startedAt: current.active_started_at, deviceModel: DEVICE }, token);
      const done = await db.prepare("UPDATE ypt_connections SET state='idle',active_started_at=NULL,active_subject=NULL,pending_id=NULL,updated_at=? WHERE user_id=? AND state='stopping' AND pending_id=?").bind(new Date().toISOString(), userId, operationId).run();
      if (!changed(done)) return errorResponse(json, origin, 'UNCERTAIN', 503, '상태 확인이 필요합니다. 열품타 앱을 확인해 주세요.');
      return json({ ok: true, state: 'idle', stoppedAt }, 200, origin);
    } catch {
      await db.prepare("UPDATE ypt_connections SET state='uncertain',updated_at=? WHERE user_id=? AND state='stopping' AND pending_id=?").bind(new Date().toISOString(), userId, operationId).run();
      return errorResponse(json, origin, 'UNCERTAIN', 503, '정지 결과를 확인할 수 없습니다. 열품타 앱에서 정지 여부를 확인해 주세요.');
    }
  }
  if (pathname === '/api/ypt/resolve' && request.method === 'POST') {
    const body = await objectBody(request);
    if (body?.confirmedStopped !== true) return errorResponse(json, origin, 'CONFIRM_REQUIRED', 400, '열품타 앱에서 정지한 후 확인해 주세요.');
    const result = await db.prepare("UPDATE ypt_connections SET state='idle',active_started_at=NULL,active_subject=NULL,pending_id=NULL,updated_at=? WHERE user_id=? AND state!='idle'").bind(new Date().toISOString(), userId).run();
    if (!changed(result)) return errorResponse(json, origin, 'ALREADY_IDLE', 409, '이미 정지된 상태입니다.');
    return json(publicState(await row(db, userId)), 200, origin);
  }
  if (pathname === '/api/ypt/connect' && request.method === 'DELETE') {
    const result = await db.prepare("DELETE FROM ypt_connections WHERE user_id=? AND state='idle'").bind(userId).run();
    if (!changed(result)) return errorResponse(json, origin, 'ACTIVE', 409, '타이머가 종료된 뒤 연결을 해제할 수 있습니다.');
    return json(publicState(null), 200, origin);
  }
  return errorResponse(json, origin, 'NOT_FOUND', 404, '요청을 찾을 수 없습니다.');
}
