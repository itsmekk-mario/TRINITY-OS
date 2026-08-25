export interface Env { DB: D1Database; SYNC_TOKEN: string; ALLOWED_ORIGIN?: string }
const encoder = new TextEncoder();
const json = (body: unknown, status = 200, origin = '*') => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS', 'Cache-Control': 'no-store' } });
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, '0')).join('');
const randomHex = (size = 32) => { const bytes = new Uint8Array(size); crypto.getRandomValues(bytes); return hex(bytes.buffer); };
const sha256 = async (value: string) => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
async function passwordHash(password: string, salt: string) { const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']); return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 100000 }, key, 256)); }
async function ensureTables(db: D1Database) { await db.batch([
  db.prepare('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY CHECK(id = 1), username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT NOT NULL)'),
  db.prepare('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL)'),
  db.prepare('CREATE TABLE IF NOT EXISTS learning_state_history (id INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL, saved_at TEXT NOT NULL)'),
]); }
async function sessionUser(request: Request, env: Env) { const bearer = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, ''); if (!bearer) return null; const hash = await sha256(bearer); return env.DB.prepare("SELECT u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND datetime(s.expires_at)>datetime('now')").bind(hash).first<{ username: string }>(); }
async function createSession(env: Env, username: string) { const token = randomHex(); const hash = await sha256(token); const expires = new Date(Date.now() + 30 * 86400000).toISOString(); await env.DB.prepare("DELETE FROM sessions WHERE datetime(expires_at)<=datetime('now')").run(); await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,1,?,?)').bind(hash, expires, new Date().toISOString()).run(); return { token, username, expiresAt: expires }; }

export default { async fetch(request: Request, env: Env): Promise<Response> {
  const origin = env.ALLOWED_ORIGIN || '*';
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS' } });
  await ensureTables(env.DB); const url = new URL(request.url);
  if (url.pathname === '/api/health' && request.method === 'GET') return json({ ok: true, service: 'trinity-os-sync' }, 200, origin);
  if (url.pathname === '/api/auth/register' && request.method === 'POST') {
    const body = await request.json<{ username?: string; password?: string; setupToken?: string }>();
    if (!env.SYNC_TOKEN || body.setupToken !== env.SYNC_TOKEN) return json({ error: '최초 등록 키가 올바르지 않습니다.' }, 401, origin);
    if (await env.DB.prepare('SELECT id FROM users WHERE id=1').first()) return json({ error: '이미 계정이 등록되어 있습니다.' }, 409, origin);
    const username = body.username?.trim(); const password = body.password || '';
    if (!username || username.length > 40 || password.length < 8) return json({ error: '아이디와 8자 이상의 비밀번호를 입력하세요.' }, 400, origin);
    const salt = randomHex(16); const hash = await passwordHash(password, salt); const now = new Date().toISOString();
    await env.DB.prepare('INSERT INTO users(id,username,password_hash,salt,created_at) VALUES(1,?,?,?,?)').bind(username, hash, salt, now).run();
    return json(await createSession(env, username), 201, origin);
  }
  if (url.pathname === '/api/auth/login' && request.method === 'POST') {
    const body = await request.json<{ username?: string; password?: string }>();
    const user = await env.DB.prepare('SELECT username,password_hash,salt FROM users WHERE id=1 AND username=?').bind(body.username?.trim() || '').first<{ username: string; password_hash: string; salt: string }>();
    if (!user || await passwordHash(body.password || '', user.salt) !== user.password_hash) return json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, 401, origin);
    return json(await createSession(env, user.username), 200, origin);
  }
  const user = await sessionUser(request, env);
  if (url.pathname === '/api/auth/me' && request.method === 'GET') return user ? json({ ok: true, username: user.username }, 200, origin) : json({ error: 'Unauthorized' }, 401, origin);
  if (url.pathname !== '/api/sync' || !['GET', 'PUT'].includes(request.method)) return json({ error: 'Not found' }, 404, origin);
  if (!user) return json({ error: 'Unauthorized' }, 401, origin);
  if (request.method === 'GET') { const row = await env.DB.prepare('SELECT payload,updated_at FROM learning_state WHERE id=1').first<{ payload: string; updated_at: string }>(); return row ? json({ data: JSON.parse(row.payload), updatedAt: row.updated_at }, 200, origin) : json({ data: null, updatedAt: null }, 200, origin); }
  const body = await request.json<{ data?: unknown }>(); if (!body?.data) return json({ error: 'data is required' }, 400, origin);
  const now = new Date().toISOString(); const previous = await env.DB.prepare('SELECT payload FROM learning_state WHERE id=1').first<{ payload: string }>();
  if (previous) await env.DB.prepare('INSERT INTO learning_state_history(payload,saved_at) VALUES(?,?)').bind(previous.payload, now).run();
  await env.DB.prepare('INSERT INTO learning_state(id,payload,updated_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').bind(JSON.stringify(body.data), now).run();
  await env.DB.prepare('DELETE FROM learning_state_history WHERE id NOT IN (SELECT id FROM learning_state_history ORDER BY id DESC LIMIT 20)').run();
  return json({ ok: true, updatedAt: now }, 200, origin);
} };
