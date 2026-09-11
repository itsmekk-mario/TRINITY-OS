import { support } from './support.ts';
import { aiService, type AIServiceConfig } from './lib/ai/service.ts';
import { AIProviderError, type ChatMessage } from './lib/ai/types.ts';
import { arena } from './arena.ts';

export interface Env {
  DB: D1Database; SYNC_TOKEN?: string; NVIDIA_API_KEY?: string; NVIDIA_MODEL?: string; NVIDIA_BASE_URL?: string;
  AI_PROVIDER?: string; AI_TIMEOUT_MS?: string; AI_MAX_RETRIES?: string; AI_DEBUG?: string; ENVIRONMENT?: string;
  ALLOWED_ORIGIN?: string; SUPABASE_URL?: string; SUPABASE_SERVICE_ROLE_KEY?: string; SUPABASE_BUCKET?: string;
}
const encoder = new TextEncoder();
const json = (body: unknown, status = 200, origin = '*', extra: HeadersInit = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS', 'Cache-Control': 'no-store', ...extra } });
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((v) => v.toString(16).padStart(2, '0')).join('');
const randomHex = (size = 32) => { const bytes = new Uint8Array(size); crypto.getRandomValues(bytes); return hex(bytes.buffer); };
const sha256 = async (value: string) => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
async function passwordHash(password: string, salt: string) { const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']); return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 100000 }, key, 256)); }
async function ensureTables(db: D1Database) { await db.batch([
  db.prepare('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password_hash TEXT, salt TEXT, is_admin INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)'),
  db.prepare('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL)'),
  db.prepare('CREATE TABLE IF NOT EXISTS api_tokens (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, label TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT)'),
  db.prepare('CREATE TABLE IF NOT EXISTS learning_state_history (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, payload TEXT NOT NULL, saved_at TEXT NOT NULL)'),
  db.prepare('CREATE TABLE IF NOT EXISTS learning_state (user_id INTEGER PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)'),
]); await db.batch([
  db.prepare('CREATE INDEX IF NOT EXISTS api_tokens_user_active ON api_tokens(user_id, revoked_at)'),
  db.prepare('CREATE INDEX IF NOT EXISTS learning_state_history_user_saved ON learning_state_history(user_id, saved_at DESC)'),
]); const columns = await db.prepare('PRAGMA table_info(users)').all<{ name: string }>(); if (!columns.results.some((column) => column.name === 'is_admin')) await db.prepare('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0').run(); }
type User = { id: number; username: string; is_admin: number };
async function sessionUser(request: Request, env: Env) { const bearer = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, ''); if (!bearer) return null; const hash = await sha256(bearer); return env.DB.prepare("SELECT u.id,u.username,u.is_admin FROM api_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=? AND t.revoked_at IS NULL UNION ALL SELECT u.id,u.username,u.is_admin FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND datetime(s.expires_at)>datetime('now') LIMIT 1").bind(hash, hash).first<User>(); }
async function createSession(env: Env, username: string, userId = 1) { const token = randomHex(); const hash = await sha256(token); const expires = new Date(Date.now() + 30 * 86400000).toISOString(); await env.DB.prepare("DELETE FROM sessions WHERE datetime(expires_at)<=datetime('now')").run(); await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').bind(hash, userId, expires, new Date().toISOString()).run(); return { token, username, expiresAt: expires }; }
async function secretMatches(provided: string, expected: string | undefined) {
  if (!expected) return false;
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(providedHash, expectedHash);
}
const tokenName = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 40) : '';

const coachSystem = '너는 TRINITY OS의 수능 학습 코치다. 감정적인 격려를 길게 하지 말고, 제공된 학습 데이터에 근거해 가장 중요한 다음 행동 하나를 제시한다. 데이터에 없는 사실을 만들지 말고 계획량을 무조건 늘리지 않는다. 학습량보다 실제 병목과 실행을 우선하며, 미완료 일정이 많아도 비난하지 않는다. 한국어로 1~2문장, 80자 안팎으로 답한다.';
const dailySystem = `${coachSystem}\n반드시 JSON만 반환한다: {"summary":"...","bottleneck":"...","nextAction":"...","coachMessage":"..."}. 각 값은 짧은 한국어 문장이다.`;
const arenaSystem = '너는 TRINITY Arena의 성장 코치다. 순위나 공부시간만으로 학생을 평가하거나 압박하지 않는다. 제공된 점수 근거와 그룹 평균을 비교해 가장 개선 여지가 큰 영역 하나와 실행 가능한 다음 행동 1~2개를 한국어 3문장 이내로 제시한다. 개인정보를 추론하지 않고, 데이터가 부족하면 부족하다고 명시한다.';
const asObject = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value.slice(0, 900) : fallback;
const jsonFromText = (value: string) => { try { return JSON.parse(value) as unknown; } catch { const match = value.match(/\{[\s\S]*\}/); try { return match ? JSON.parse(match[0]) as unknown : null; } catch { return null; } } };
const stableJson = (value: unknown): string => Array.isArray(value) ? `[${value.map(stableJson).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(',')}}` : JSON.stringify(value);
const providerConfig = (env: Env): AIServiceConfig => ({ provider: env.AI_PROVIDER || 'nvidia-kimi', apiKey: env.NVIDIA_API_KEY, model: env.NVIDIA_MODEL, baseUrl: env.NVIDIA_BASE_URL, timeoutMs: env.AI_TIMEOUT_MS, maxRetries: env.AI_MAX_RETRIES, debug: env.AI_DEBUG, environment: env.ENVIRONMENT });
const aiMessage = (error: AIProviderError) => {
  switch (error.code) {
    case 'AI_NOT_CONFIGURED': return 'AI 코치가 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.';
    case 'AI_AUTHENTICATION_FAILED': return 'AI 연결 인증에 실패했습니다. 관리자에게 설정 확인을 요청해 주세요.';
    case 'AI_ACCESS_DENIED': return '현재 AI 모델 접근 권한이 없습니다. 관리자에게 모델 설정 확인을 요청해 주세요.';
    case 'AI_RATE_LIMITED': return `AI 요청이 잠시 제한되었습니다.${error.retryAfterSeconds ? ` ${error.retryAfterSeconds}초 후 다시 시도해 주세요.` : ' 잠시 후 다시 시도해 주세요.'}`;
    case 'AI_TIMEOUT': return 'AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.';
    case 'AI_PROVIDER_UNAVAILABLE': return 'AI 서버가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해 주세요.';
    case 'AI_INVALID_RESPONSE': return 'AI 응답 형식을 확인하지 못했습니다. 다시 시도해 주세요.';
    default: return 'AI 요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
  }
};
const aiError = (cause: unknown, origin: string) => { const error = cause instanceof AIProviderError ? cause : new AIProviderError('Unhandled AI service error.', 502, 'AI_REQUEST_FAILED'); return json({ error: aiMessage(error), code: error.code, requestId: randomHex(8) }, error.status, origin, error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : {}); };
const prompt = (system: string, user: string): ChatMessage[] => [{ role: 'system', content: system }, { role: 'user', content: user }];

export default { async fetch(request: Request, env: Env): Promise<Response> {
  const origin = env.ALLOWED_ORIGIN || '*';
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS' } });
  await ensureTables(env.DB); const url = new URL(request.url);
  if (url.pathname === '/api/health' && request.method === 'GET') return json({ ok: true, service: 'trinity-os-sync' }, 200, origin);
  if (url.pathname === '/api/admin/access-tokens' && request.method === 'POST') {
    const issuerToken = request.headers.get('X-Setup-Token') || '';
    if (!await secretMatches(issuerToken, env.SYNC_TOKEN)) return json({ error: 'Unauthorized' }, 401, origin);
    const body = await request.json<{ username?: unknown; label?: unknown; admin?: unknown }>();
    const username = tokenName(body.username), label = tokenName(body.label) || 'personal token';
    if (!username) return json({ error: 'username is required (maximum 40 characters).' }, 400, origin);
    const now = new Date().toISOString(), admin = body.admin === true ? 1 : 0;
    await env.DB.prepare('INSERT OR IGNORE INTO users(username,is_admin,created_at) VALUES(?,?,?)').bind(username, admin, now).run();
    const user = await env.DB.prepare('SELECT id,username,is_admin FROM users WHERE username=?').bind(username).first<User>();
    if (!user) return json({ error: 'Unable to create user.' }, 500, origin);
    const token = `trinity_pat_${randomHex()}`;
    await env.DB.prepare('INSERT INTO api_tokens(token_hash,user_id,label,created_at) VALUES(?,?,?,?)').bind(await sha256(token), user.id, label, now).run();
    return json({ token, username: user.username, isAdmin: user.is_admin === 1 }, 201, origin);
  }
  if (url.pathname.startsWith('/api/admin/access-tokens/') && request.method === 'DELETE') {
    const issuerToken = request.headers.get('X-Setup-Token') || '';
    if (!await secretMatches(issuerToken, env.SYNC_TOKEN)) return json({ error: 'Unauthorized' }, 401, origin);
    const username = tokenName(decodeURIComponent(url.pathname.slice('/api/admin/access-tokens/'.length)));
    if (!username) return json({ error: 'username is required.' }, 400, origin);
    const user = await env.DB.prepare('SELECT id FROM users WHERE username=?').bind(username).first<{ id: number }>();
    if (!user) return json({ error: 'Not found.' }, 404, origin);
    await env.DB.prepare('UPDATE api_tokens SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').bind(new Date().toISOString(), user.id).run();
    return json({ ok: true }, 200, origin);
  }
  if (url.pathname === '/api/auth/login' && request.method === 'POST') {
    const body = await request.json<{ username?: string; password?: string }>(); const account = await env.DB.prepare('SELECT id,username,password_hash,salt FROM users WHERE username=?').bind(body.username?.trim() || '').first<{ id: number; username: string; password_hash: string | null; salt: string | null }>();
    if (!account?.password_hash || !account.salt) return json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, 401, origin);
    if (!account || await passwordHash(body.password || '', account.salt) !== account.password_hash) return json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, 401, origin);
    return json(await createSession(env, account.username, account.id), 200, origin);
  }
  const user = await sessionUser(request, env);
  const extra = await support(request, env, user?.is_admin === 1, origin, { json, sha256, passwordHash, randomHex });
  if (extra) return extra;
  const arenaResponse = await arena(request, env, user, origin, { json, randomHex });
  if (arenaResponse) return arenaResponse;
  if (url.pathname === '/api/auth/me' && request.method === 'GET') return user ? json({ ok: true, username: user.username }, 200, origin) : json({ error: 'Unauthorized' }, 401, origin);
  if (url.pathname === '/api/ai/daily-coach' && request.method === 'POST') {
    if (!user) return json({ error: 'Unauthorized' }, 401, origin);
    const body = asObject(await request.json<unknown>()); const context = body?.context;
    if (!asObject(context)) return json({ error: '학습 컨텍스트가 필요합니다.' }, 400, origin);
    try {
      const result = await aiService.complete({ user: user.username, operation: 'daily-coach', cacheKey: await sha256(stableJson(context)), force: body?.force === true, maxTokens: 180, config: providerConfig(env), messages: prompt(dailySystem, `오늘의 선별된 학습 데이터:\n${JSON.stringify(context)}`) });
      const parsed = asObject(jsonFromText(result.content)); const fallback = '오늘 첫 일정부터 차분히 완료해 보세요.';
      return json({ summary: text(parsed?.summary, fallback), bottleneck: text(parsed?.bottleneck, ''), nextAction: text(parsed?.nextAction, fallback), coachMessage: text(parsed?.coachMessage, result.content.slice(0, 160) || fallback), cached: result.cached }, 200, origin);
    } catch (cause) { return aiError(cause, origin); }
  }
  if (url.pathname === '/api/ai/teacher-feedback-summary' && request.method === 'POST') {
    if (!user) return json({ error: 'Unauthorized' }, 401, origin);
    const body = asObject(await request.json<unknown>()); const context = asObject(body?.context);
    if (!context) return json({ error: 'Teacher feedback context is required.' }, 400, origin);
    const safe = { today: asObject(context.today), subjectFeedback: Array.isArray(context.subjectFeedback) ? context.subjectFeedback.slice(0, 5) : [], academicFeedback: Array.isArray(context.academicFeedback) ? context.academicFeedback.slice(0, 3) : [], weeklyGoals: Array.isArray(context.weeklyGoals) ? context.weeklyGoals.slice(0, 5) : [], recentBottlenecks: Array.isArray(context.recentBottlenecks) ? context.recentBottlenecks.slice(0, 5) : [] };
    try { const result = await aiService.complete({ user: user.username, operation: 'teacher-feedback-summary', cacheKey: await sha256(stableJson(safe)), maxTokens: 180, config: providerConfig(env), messages: prompt('You summarize teacher feedback for a student. Never override, reinterpret, or invent a teacher decision. Use only the supplied academic context. Give a short Korean priority order with at most two concrete actions.', JSON.stringify(safe)) }); return json({ message: result.content, cached: result.cached }, 200, origin); } catch (cause) { return aiError(cause, origin); }
  }
  if (url.pathname === '/api/ai/arena-coach' && request.method === 'POST') {
    if (!user) return json({ error: 'Unauthorized' }, 401, origin);
    const body = asObject(await request.json<unknown>()); const context = asObject(body?.context);
    if (!context) return json({ error: 'Arena 성장 컨텍스트가 필요합니다.' }, 400, origin);
    const safe = { score: asObject(context.score), metrics: asObject(context.metrics), breakdown: asObject(context.breakdown), group: asObject(context.group), nextActions: Array.isArray(context.nextActions) ? context.nextActions.slice(0, 3) : [] };
    try { const result = await aiService.complete({ user: user.username, operation: 'arena-coach', cacheKey: await sha256(stableJson(safe)), maxTokens: 220, config: providerConfig(env), messages: prompt(arenaSystem, JSON.stringify(safe)) }); return json({ message: result.content, cached: result.cached }, 200, origin); } catch (cause) { return aiError(cause, origin); }
  }
  if (url.pathname === '/api/ai/chat' && request.method === 'POST') {
    if (!user) return json({ error: 'Unauthorized' }, 401, origin);
    const body = asObject(await request.json<unknown>()); const context = body?.context; const raw = Array.isArray(body?.messages) ? body.messages.slice(-6) : [];
    if (!asObject(context) || !raw.length) return json({ error: '학습 컨텍스트와 질문이 필요합니다.' }, 400, origin);
    const conversation = raw.map(asObject).filter((item): item is Record<string, unknown> => Boolean(item)).filter((item) => (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string').map((item) => `${item.role === 'user' ? '사용자' : '코치'}: ${text(item.content).slice(0, 500)}`).join('\n');
    if (!conversation) return json({ error: '유효한 질문이 필요합니다.' }, 400, origin);
    const requestText = `선별된 학습 데이터:\n${JSON.stringify(context)}\n\n최근 대화:\n${conversation}\n\n위 질문에만 짧게 답하세요.`;
    try { const result = await aiService.complete({ user: user.username, operation: 'chat', cacheKey: await sha256(requestText), maxTokens: 320, config: providerConfig(env), messages: prompt(coachSystem, requestText) }); return json({ message: result.content }, 200, origin); } catch (cause) { return aiError(cause, origin); }
  }
  if (url.pathname !== '/api/sync' || !['GET', 'PUT'].includes(request.method)) return json({ error: 'Not found' }, 404, origin);
  if (!user) return json({ error: 'Unauthorized' }, 401, origin);
  if (request.method === 'GET') { const row = await env.DB.prepare('SELECT payload,updated_at FROM learning_state WHERE user_id=?').bind(user.id).first<{ payload: string; updated_at: string }>(); return row ? json({ data: JSON.parse(row.payload), updatedAt: row.updated_at }, 200, origin) : json({ data: null, updatedAt: null }, 200, origin); }
  const body = await request.json<{ data?: unknown }>(); if (!body?.data) return json({ error: 'data is required' }, 400, origin);
  const now = new Date().toISOString(); const previous = await env.DB.prepare('SELECT payload FROM learning_state WHERE user_id=?').bind(user.id).first<{ payload: string }>();
  if (previous) await env.DB.prepare('INSERT INTO learning_state_history(user_id,payload,saved_at) VALUES(?,?,?)').bind(user.id, previous.payload, now).run();
  await env.DB.prepare('INSERT INTO learning_state(user_id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').bind(user.id, JSON.stringify(body.data), now).run();
  await env.DB.prepare('DELETE FROM learning_state_history WHERE user_id=? AND id NOT IN (SELECT id FROM learning_state_history WHERE user_id=? ORDER BY id DESC LIMIT 20)').bind(user.id, user.id).run();
  return json({ ok: true, updatedAt: now }, 200, origin);
} };
