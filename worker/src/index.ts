import { support } from './support.ts';
import { aiService, type AIServiceConfig } from './lib/ai/service.ts';
import { AIProviderError, type ChatMessage } from './lib/ai/types.ts';
import { arena } from './arena.ts';
import { boundedJson, MAX_JSON_BODY, MAX_SYNC_BODY, PASSWORD_HASH_ITERATIONS, passwordHash, randomHex, requestOrigin, RequestError, secretMatches, sessionTtlDays, sha256, validateAppData } from './security.ts';

export interface Env {
  DB: D1Database; SYNC_TOKEN?: string; NVIDIA_API_KEY?: string; NVIDIA_MODEL?: string; NVIDIA_BASE_URL?: string;
  AI_PROVIDER?: string; AI_TIMEOUT_MS?: string; AI_MAX_RETRIES?: string; AI_DEBUG?: string; ENVIRONMENT?: string;
  AI_USER_DAILY_LIMIT?: string; AI_GLOBAL_DAILY_LIMIT?: string; AI_CHAT_COOLDOWN_SECONDS?: string;
  ALLOWED_ORIGIN?: string; SUPABASE_URL?: string; SUPABASE_SERVICE_ROLE_KEY?: string; SUPABASE_BUCKET?: string;
  SESSION_TTL_DAYS?: string;
}
const json = (body: unknown, status = 200, origin = '', extra: HeadersInit = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}), 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Setup-Token', 'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS', 'Cache-Control': 'no-store', ...extra } });
async function ensureTables(db: D1Database) { await db.batch([
  db.prepare('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password_hash TEXT, salt TEXT, is_admin INTEGER NOT NULL DEFAULT 0, must_change_password INTEGER NOT NULL DEFAULT 0, password_changed_at TEXT, password_iterations INTEGER NOT NULL DEFAULT 310000, active INTEGER NOT NULL DEFAULT 1, arena_public_id TEXT, created_at TEXT NOT NULL)'),
  db.prepare('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL)'),
  db.prepare('CREATE TABLE IF NOT EXISTS api_tokens (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, label TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT)'),
  db.prepare('CREATE TABLE IF NOT EXISTS learning_state_history (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, payload TEXT NOT NULL, saved_at TEXT NOT NULL)'),
  db.prepare('CREATE TABLE IF NOT EXISTS learning_state (user_id INTEGER PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)'),
  db.prepare('CREATE TABLE IF NOT EXISTS ai_cache (cache_key TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, operation TEXT NOT NULL, response TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)'),
  db.prepare('CREATE TABLE IF NOT EXISTS ai_usage (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, operation TEXT NOT NULL, provider TEXT NOT NULL, model TEXT, created_at TEXT NOT NULL, success INTEGER NOT NULL DEFAULT 0, status_code INTEGER)'),
  db.prepare('CREATE TABLE IF NOT EXISTS student_login_attempts (key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires_at INTEGER NOT NULL)'),
  db.prepare('CREATE TABLE IF NOT EXISTS admin_rate_limits (key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires_at INTEGER NOT NULL)'),
  db.prepare("CREATE TABLE IF NOT EXISTS security_audit_logs (id TEXT PRIMARY KEY,actor_type TEXT NOT NULL,actor_id TEXT,action TEXT NOT NULL,target_type TEXT,target_id TEXT,created_at TEXT NOT NULL,metadata_json TEXT NOT NULL DEFAULT '{}')"),
]); await db.batch([
  db.prepare('CREATE INDEX IF NOT EXISTS api_tokens_user_active ON api_tokens(user_id, revoked_at)'),
  db.prepare('CREATE INDEX IF NOT EXISTS learning_state_history_user_saved ON learning_state_history(user_id, saved_at DESC)'),
  db.prepare('CREATE INDEX IF NOT EXISTS ai_cache_expiry ON ai_cache(expires_at)'),
  db.prepare('CREATE INDEX IF NOT EXISTS ai_usage_user_created ON ai_usage(user_id, created_at DESC)'),
  db.prepare('CREATE INDEX IF NOT EXISTS ai_usage_created ON ai_usage(created_at DESC)'),
]); const columns = await db.prepare('PRAGMA table_info(users)').all<{ name: string }>(); if (!columns.results.some((column) => column.name === 'is_admin')) await db.prepare('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0').run(); if (!columns.results.some((column) => column.name === 'must_change_password')) await db.prepare('ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0').run(); if (!columns.results.some((column) => column.name === 'password_changed_at')) await db.prepare('ALTER TABLE users ADD COLUMN password_changed_at TEXT').run(); if (!columns.results.some((column) => column.name === 'password_iterations')) await db.prepare('ALTER TABLE users ADD COLUMN password_iterations INTEGER NOT NULL DEFAULT 100000').run(); if (!columns.results.some((column) => column.name === 'active')) await db.prepare('ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1').run(); if (!columns.results.some((column) => column.name === 'arena_public_id')) await db.prepare('ALTER TABLE users ADD COLUMN arena_public_id TEXT').run(); await db.prepare("UPDATE users SET arena_public_id='arena_'||lower(hex(randomblob(16))) WHERE arena_public_id IS NULL").run(); const tokenColumns=await db.prepare('PRAGMA table_info(api_tokens)').all<{name:string}>(); if(!tokenColumns.results.some(column=>column.name==='scopes'))await db.prepare("ALTER TABLE api_tokens ADD COLUMN scopes TEXT NOT NULL DEFAULT 'sync:read,sync:write'").run(); }
type User = { id: number; username: string; is_admin: number; must_change_password: number };
type AuthContext = { user: User; authType: 'session'|'api_token'; tokenHash: string; scopes: string[] };
async function authContext(request: Request, env: Env): Promise<AuthContext|null> {
  const bearer=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,''); if(!bearer)return null; const tokenHash=await sha256(bearer);
  const session=await env.DB.prepare("SELECT u.id,u.username,u.is_admin,u.must_change_password FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND u.active=1 AND datetime(s.expires_at)>datetime('now')").bind(tokenHash).first<User>();
  if(session)return {user:session,authType:'session',tokenHash,scopes:[]};
  const pat=await env.DB.prepare("SELECT u.id,u.username,u.is_admin,u.must_change_password,t.scopes FROM api_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=? AND t.revoked_at IS NULL AND u.active=1").bind(tokenHash).first<User&{scopes:string}>();
  return pat?{user:pat,authType:'api_token',tokenHash,scopes:(pat.scopes||'').split(',').map(value=>value.trim()).filter(Boolean)}:null;
}
async function createSession(env: Env, username: string, userId: number) { const token=randomHex(),hash=await sha256(token),expires=new Date(Date.now()+sessionTtlDays(env.SESSION_TTL_DAYS)*86400000).toISOString(); await env.DB.prepare("DELETE FROM sessions WHERE datetime(expires_at)<=datetime('now')").run(); await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').bind(hash,userId,expires,new Date().toISOString()).run(); return {token,username,expiresAt:expires}; }
const tokenName = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 40) : '';
const clientIp = (request: Request) => request.headers.get('CF-Connecting-IP') || 'local';
async function rateKey(request: Request, username: string, windowMs = 900_000) { return sha256(`${clientIp(request)}:${username.toLowerCase()}:${Math.floor(Date.now()/windowMs)}`); }
async function audit(env: Env, action: string, actorId: string | null, targetType?: string, targetId?: string) { await env.DB.prepare('INSERT INTO security_audit_logs(id,actor_type,actor_id,action,target_type,target_id,created_at,metadata_json) VALUES(?,?,?,?,?,?,?,?)').bind(randomHex(16),'admin',actorId,action,targetType||null,targetId||null,new Date().toISOString(),'{}').run(); }
async function adminAllowed(request: Request, env: Env) { const key=await rateKey(request,'admin',60_000); const now=Date.now(); await env.DB.prepare('DELETE FROM admin_rate_limits WHERE expires_at<?').bind(now).run(); const row=await env.DB.prepare('SELECT attempts FROM admin_rate_limits WHERE key=?').bind(key).first<{attempts:number}>(); if((row?.attempts??0)>=20)return false; await env.DB.prepare('INSERT INTO admin_rate_limits(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1').bind(key,now+60_000).run(); return true; }

const coachSystem = `너는 TRINITY OS의 수능 학습 코치다.
제공된 TRINITY Analytics 결과만 근거로 판단하고 데이터에 없는 사실을 추측하거나 만들지 않는다.
공부시간을 무조건 늘리지 않고, 문제 수 증가보다 반복 병목의 수정과 재검증을 우선한다.
Weekly Capability Goal이 있으면 새 계획을 추가하기 전에 기존 목표와 연결한다.
wrongJudgment, missedCue, correction, retry 상태를 중요하게 보되 제공되지 않은 원문은 추론하지 않는다.
근거가 부족하면 데이터가 부족하다고 명시한다. 학년, 등급, 대학 합격 가능성을 임의로 판단하지 않는다.
감정적 격려를 길게 하지 않는다. 현재 상태, 가장 중요한 병목, 근거, 가장 중요한 다음 행동 1개 순서로 한국어로 짧게 답한다.
사용자가 여러 대안을 명시적으로 요구하지 않으면 행동을 여러 개 나열하지 않는다.`;
const arenaSystem = '너는 TRINITY Arena의 성장 코치다. 순위나 공부시간만으로 학생을 평가하거나 압박하지 않는다. 제공된 점수 근거와 그룹 평균을 비교해 가장 개선 여지가 큰 영역 하나와 실행 가능한 다음 행동 1~2개를 한국어 3문장 이내로 제시한다. 개인정보를 추론하지 않고, 데이터가 부족하면 부족하다고 명시한다.';
const asObject = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value.slice(0, 900) : fallback;
const stableJson = (value: unknown): string => Array.isArray(value) ? `[${value.map(stableJson).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(',')}}` : JSON.stringify(value);
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const short = (value: unknown, size = 120) => typeof value === 'string' ? value.slice(0, size) : undefined;
const compactItems = (value: unknown, limit: number, select: (item: Record<string, unknown>) => Record<string, unknown>) => Array.isArray(value) ? value.map(asObject).filter((item): item is Record<string, unknown> => Boolean(item)).slice(0, limit).map(select) : [];
function safeStudyContext(value: unknown) {
  const context = asObject(value); if (!context) return null;
  const execution = asObject(context.execution) ?? {}, primary = asObject(context.primaryBottleneck), retry = asObject(context.retryStatus), local = asObject(context.localDiagnosis);
  if (!local || !short(local.nextAction)) return null;
  return {
    period: context.period === '7d' ? '7d' : '14d',
    execution: { studyMinutes7d: finite(execution.studyMinutes7d), previousStudyMinutes7d: finite(execution.previousStudyMinutes7d), completionRateToday: finite(execution.completionRateToday), dailyDrillCompletionRate7d: finite(execution.dailyDrillCompletionRate7d) },
    subjectSummary: compactItems(context.subjectSummary, 4, (item) => ({ subject: short(item.subject, 12), studyMinutes7d: finite(item.studyMinutes7d), recentScoreTrend: short(item.recentScoreTrend, 20) })),
    primaryBottleneck: primary ? { name: short(primary.name), count7d: finite(primary.count7d), count14d: finite(primary.count14d), trend: short(primary.trend, 20), repeatedCues: Array.isArray(primary.repeatedCues) ? primary.repeatedCues.slice(0, 2).map((item) => short(item, 80)) : [], repeatedJudgments: Array.isArray(primary.repeatedJudgments) ? primary.repeatedJudgments.slice(0, 2).map((item) => short(item, 80)) : [], correctionAction: short(primary.correctionAction, 140), transferDrill: short(primary.transferDrill, 140) } : undefined,
    secondaryBottlenecks: compactItems(context.secondaryBottlenecks, 2, (item) => ({ name: short(item.name), count7d: finite(item.count7d), count14d: finite(item.count14d) })),
    retryStatus: retry ? { scheduled: finite(retry.scheduled), completed: finite(retry.completed), overdue: finite(retry.overdue) } : undefined,
    weeklyGoals: compactItems(context.weeklyGoals, 3, (item) => ({ subject: short(item.subject, 12), ability: short(item.ability), successCriterion: short(item.successCriterion, 160) })),
    plaire: asObject(context.plaire) ? { bottleneck: short(asObject(context.plaire)?.bottleneck), nextAction: short(asObject(context.plaire)?.nextAction, 160) } : undefined,
    localDiagnosis: { status: short(local.status, 180), primaryBottleneck: short(local.primaryBottleneck), nextAction: short(local.nextAction, 220), successCriterion: short(local.successCriterion, 180), evidence: Array.isArray(local.evidence) ? local.evidence.slice(0, 3).map((item) => short(item, 140)) : [] },
  };
}
const providerConfig = (env: Env): AIServiceConfig => ({ provider: env.AI_PROVIDER || 'nvidia-kimi', apiKey: env.NVIDIA_API_KEY, model: env.NVIDIA_MODEL, baseUrl: env.NVIDIA_BASE_URL, timeoutMs: env.AI_TIMEOUT_MS, maxRetries: env.AI_MAX_RETRIES, debug: env.AI_DEBUG, environment: env.ENVIRONMENT, userDailyLimit: env.AI_USER_DAILY_LIMIT, globalDailyLimit: env.AI_GLOBAL_DAILY_LIMIT, chatCooldownSeconds: env.AI_CHAT_COOLDOWN_SECONDS });
const aiMessage = (error: AIProviderError) => {
  switch (error.code) {
    case 'AI_NOT_CONFIGURED': return 'AI 코치가 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.';
    case 'AI_AUTHENTICATION_FAILED': return 'AI 연결 인증에 실패했습니다. 관리자에게 설정 확인을 요청해 주세요.';
    case 'AI_ACCESS_DENIED': return '현재 AI 모델 접근 권한이 없습니다. 관리자에게 모델 설정 확인을 요청해 주세요.';
    case 'AI_RATE_LIMITED': return /[가-힣]/.test(error.message) ? error.message : `AI 요청이 잠시 제한되었습니다.${error.retryAfterSeconds ? ` ${error.retryAfterSeconds}초 후 다시 시도해 주세요.` : ' 잠시 후 다시 시도해 주세요.'} 기본 TRINITY 분석은 정상적으로 사용할 수 있습니다.`;
    case 'AI_TIMEOUT': return 'AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.';
    case 'AI_PROVIDER_UNAVAILABLE': return 'AI 서버가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해 주세요.';
    case 'AI_INVALID_RESPONSE': return 'AI 응답 형식을 확인하지 못했습니다. 다시 시도해 주세요.';
    default: return 'AI 요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
  }
};
const aiError = (cause: unknown, origin: string) => { const error = cause instanceof AIProviderError ? cause : new AIProviderError('Unhandled AI service error.', 502, 'AI_REQUEST_FAILED'); return json({ error: aiMessage(error), code: error.code, requestId: randomHex(8) }, error.status, origin, error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : {}); };
const prompt = (system: string, user: string): ChatMessage[] => [{ role: 'system', content: system }, { role: 'user', content: user }];

export default { async fetch(request: Request, env: Env): Promise<Response> {
 try {
  const cors=requestOrigin(request,env.ALLOWED_ORIGIN,env.ENVIRONMENT),origin=cors.responseOrigin;
  if(request.method==='OPTIONS')return cors.allowed?new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Content-Type, Authorization, X-Setup-Token','Access-Control-Allow-Methods':'GET, PUT, POST, DELETE, OPTIONS','Vary':'Origin'}}):json({error:'허용되지 않은 Origin입니다.'},403);
  if(!cors.allowed&&request.method!=='GET'&&request.method!=='HEAD')return json({error:'허용되지 않은 Origin입니다.'},403);
  const url = new URL(request.url), declared=Number(request.headers.get('Content-Length')||0), limit=url.pathname==='/api/sync'?MAX_SYNC_BODY:MAX_JSON_BODY;
  if(declared>limit)return json({error:'요청 본문이 너무 큽니다.'},413,origin);
  await ensureTables(env.DB);
  if(request.method!=='GET'&&['/api/support/accounts','/api/collab/assignments'].includes(url.pathname)&&!await adminAllowed(request,env))return json({error:'요청이 너무 많습니다.'},429,origin,{'Retry-After':'60'});
  if (url.pathname === '/api/health' && request.method === 'GET') return json({ ok: true, service: 'trinity-os-sync' }, 200, origin);
  if (url.pathname === '/api/admin/students' && request.method === 'POST') {
    const issuerToken = request.headers.get('X-Setup-Token') || '';
    if (!await adminAllowed(request,env)) return json({error:'요청이 너무 많습니다.'},429,origin,{'Retry-After':'60'});
    if (!await secretMatches(issuerToken, env.SYNC_TOKEN)) return json({ error: '관리자 인증에 실패했습니다.' }, 401, origin);
    const body = await boundedJson<{ username?: unknown; password?: unknown; admin?: unknown }>(request);
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!/^[A-Za-z0-9._-]{3,40}$/.test(username)) return json({ error: '아이디는 영문, 숫자, 마침표, 밑줄, 하이픈으로 3~40자여야 합니다.' }, 400, origin);
    if (password.length < 8 || password.length > 128) return json({ error: '비밀번호는 8~128자로 입력해 주세요.' }, 400, origin);
    const existing = await env.DB.prepare('SELECT id FROM users WHERE username=?').bind(username).first<{ id: number }>();
    if (existing) return json({ error: '이미 사용 중인 아이디입니다.' }, 409, origin);
    const salt = randomHex(16), now = new Date().toISOString(), admin = body.admin === true ? 1 : 0;
    const publicId=`arena_${randomHex(16)}`;
    await env.DB.prepare('INSERT INTO users(username,password_hash,salt,password_iterations,is_admin,must_change_password,active,arena_public_id,created_at) VALUES(?,?,?,310000,?,1,1,?,?)').bind(username, await passwordHash(password, salt), salt, admin, publicId, now).run();
    await audit(env,'student.create','setup-token','user',publicId);
    return json({ username, isAdmin: admin === 1, mustChangePassword: true, createdAt: now }, 201, origin);
  }
  if (url.pathname === '/api/admin/access-tokens' && request.method === 'POST') {
    const issuerToken = request.headers.get('X-Setup-Token') || '';
    if (!await adminAllowed(request,env)) return json({error:'요청이 너무 많습니다.'},429,origin,{'Retry-After':'60'});
    if (!await secretMatches(issuerToken, env.SYNC_TOKEN)) return json({ error: 'Unauthorized' }, 401, origin);
    const body = await boundedJson<{ username?: unknown; label?: unknown; scopes?: unknown }>(request);
    const username = tokenName(body.username), label = tokenName(body.label) || 'personal token';
    if (!username) return json({ error: 'username is required (maximum 40 characters).' }, 400, origin);
    const now = new Date().toISOString();
    await env.DB.prepare("INSERT OR IGNORE INTO users(username,is_admin,active,arena_public_id,created_at) VALUES(?,0,1,'arena_'||lower(hex(randomblob(16))),?)").bind(username,now).run();
    const user = await env.DB.prepare('SELECT id,username,is_admin FROM users WHERE username=?').bind(username).first<User>();
    if (!user) return json({ error: 'Unable to create user.' }, 500, origin);
    const token = `trinity_pat_${randomHex()}`;
    const requested=Array.isArray(body.scopes)?body.scopes.filter(scope=>scope==='sync:read'||scope==='sync:write'):['sync:read']; const scopes=requested.length?requested.join(','):'sync:read';
    await env.DB.prepare('INSERT INTO api_tokens(token_hash,user_id,label,scopes,created_at) VALUES(?,?,?,?,?)').bind(await sha256(token), user.id, label, scopes, now).run();
    await audit(env,'api_token.issue','setup-token','user',String(user.id));
    return json({ token, username: user.username, isAdmin: user.is_admin === 1 }, 201, origin);
  }
  if (url.pathname.startsWith('/api/admin/access-tokens/') && request.method === 'DELETE') {
    const issuerToken = request.headers.get('X-Setup-Token') || '';
    if (!await adminAllowed(request,env)) return json({error:'요청이 너무 많습니다.'},429,origin,{'Retry-After':'60'});
    if (!await secretMatches(issuerToken, env.SYNC_TOKEN)) return json({ error: 'Unauthorized' }, 401, origin);
    const username = tokenName(decodeURIComponent(url.pathname.slice('/api/admin/access-tokens/'.length)));
    if (!username) return json({ error: 'username is required.' }, 400, origin);
    const user = await env.DB.prepare('SELECT id FROM users WHERE username=?').bind(username).first<{ id: number }>();
    if (!user) return json({ error: 'Not found.' }, 404, origin);
    await env.DB.prepare('UPDATE api_tokens SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').bind(new Date().toISOString(), user.id).run();
    await audit(env,'api_token.revoke','setup-token','user',String(user.id));
    return json({ ok: true }, 200, origin);
  }
  if (url.pathname === '/api/auth/login' && request.method === 'POST') {
    const body=await boundedJson<{username?:string;password?:string}>(request),username=body.username?.trim()||'',key=await rateKey(request,username),now=Date.now(); await env.DB.prepare('DELETE FROM student_login_attempts WHERE expires_at<?').bind(now).run(); const tries=await env.DB.prepare('SELECT attempts FROM student_login_attempts WHERE key=?').bind(key).first<{attempts:number}>(); if((tries?.attempts??0)>=8)return json({error:'로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.'},429,origin,{'Retry-After':'900'});
    const account=await env.DB.prepare('SELECT id,username,password_hash,salt,must_change_password,COALESCE(password_iterations,100000) password_iterations FROM users WHERE username=? AND active=1').bind(username).first<{id:number;username:string;password_hash:string|null;salt:string|null;must_change_password:number;password_iterations:number}>();
    const iterations=account?.password_iterations??PASSWORD_HASH_ITERATIONS,hash=await passwordHash(body.password||'',account?.salt??'trinity-dummy-login-salt',iterations),valid=Boolean(account?.password_hash&&account.salt&&await secretMatches(hash,account.password_hash));
    if(!valid){await env.DB.prepare('INSERT INTO student_login_attempts(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1,expires_at=excluded.expires_at').bind(key,now+900_000).run();return json({error:'아이디 또는 비밀번호가 올바르지 않습니다.'},401,origin);}
    await env.DB.prepare('DELETE FROM student_login_attempts WHERE key=?').bind(key).run();
    if(iterations<PASSWORD_HASH_ITERATIONS){const salt=randomHex(16);await env.DB.prepare('UPDATE users SET password_hash=?,salt=?,password_iterations=? WHERE id=?').bind(await passwordHash(body.password||'',salt),salt,PASSWORD_HASH_ITERATIONS,account!.id).run();}
    return json({ ...await createSession(env, account!.username, account!.id), mustChangePassword: account!.must_change_password === 1 }, 200, origin);
  }
  const auth = await authContext(request, env), user=auth?.user??null;
  const extra = await support(request, env, user?.is_admin === 1, origin, { json, sha256, passwordHash, secretMatches, randomHex,boundedJson }, user);
  if (extra) return extra;
  const arenaResponse = await arena(request, env, auth?.authType==='session'?user:null, origin, { json, randomHex,boundedJson });
  if (arenaResponse) return arenaResponse;
  if (url.pathname === '/api/auth/me' && request.method === 'GET') return user ? json({ ok: true, username: user.username, mustChangePassword: user.must_change_password === 1 }, 200, origin) : json({ error: 'Unauthorized' }, 401, origin);
  if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
    if(!auth||auth.authType!=='session')return json({error:'Unauthorized'},401,origin);
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(auth.tokenHash).run();
    return json({ok:true},200,origin);
  }
  if (url.pathname === '/api/auth/change-password' && request.method === 'POST') {
    if (!user) return json({ error: 'Unauthorized' }, 401, origin);
    if(auth?.authType!=='session')return json({error:'세션 로그인이 필요합니다.'},403,origin);
    const body = await boundedJson<{ currentPassword?: unknown; newPassword?: unknown }>(request);
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
    if (newPassword.length < 8 || newPassword.length > 128) return json({ error: '새 비밀번호는 8~128자로 입력해 주세요.' }, 400, origin);
    const account = await env.DB.prepare('SELECT password_hash,salt,COALESCE(password_iterations,100000) password_iterations FROM users WHERE id=?').bind(user.id).first<{ password_hash: string | null; salt: string | null;password_iterations:number }>();
    if (!account?.password_hash || !account.salt || !await secretMatches(await passwordHash(currentPassword, account.salt,account.password_iterations),account.password_hash)) return json({ error: '현재 비밀번호가 올바르지 않습니다.' }, 401, origin);
    if (await secretMatches(await passwordHash(newPassword, account.salt,account.password_iterations),account.password_hash)) return json({ error: '현재 비밀번호와 다른 비밀번호를 입력해 주세요.' }, 400, origin);
    const salt = randomHex(16), now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET password_hash=?,salt=?,password_iterations=?,must_change_password=0,password_changed_at=? WHERE id=?').bind(await passwordHash(newPassword, salt), salt,PASSWORD_HASH_ITERATIONS, now, user.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id),
    ]);
    return json({ ...await createSession(env, user.username, user.id), mustChangePassword: false }, 200, origin);
  }
  if (url.pathname === '/api/ai/daily-coach' && request.method === 'POST') return json({ error: '자동 AI 분석 API는 종료되었습니다. Dashboard의 로컬 TRINITY 분석을 사용해 주세요.', code: 'LOCAL_COACH_ONLY' }, 410, origin);
  if (url.pathname === '/api/ai/study-analysis' && request.method === 'POST') {
    if (!user || auth?.authType!=='session') return json({ error: 'Unauthorized' }, 401, origin);
    const body = asObject(await boundedJson<unknown>(request)); const context = safeStudyContext(body?.context);
    if (!context) return json({ error: '압축된 TRINITY Analytics 결과가 필요합니다.' }, 400, origin);
    const requestText = `TRINITY Analytics 결과:\n${JSON.stringify(context)}\n\n이 결과를 다시 계산하지 말고 근거를 연결해 현재 상태, 핵심 병목, 근거, 다음 행동 1개와 검증 기준을 짧게 설명하세요.`;
    try {
      const result = await aiService.complete({ db: env.DB, userId: user.id, user: user.username, operation: 'study-analysis', cacheKey: await sha256(stableJson(context)), maxTokens: 260, config: providerConfig(env), messages: prompt(coachSystem, requestText) });
      return json({ message: text(result.content, '정밀 분석 결과를 확인하지 못했습니다.'), cached: result.cached }, 200, origin);
    } catch (cause) { return aiError(cause, origin); }
  }
  if (url.pathname === '/api/ai/teacher-feedback-summary' && request.method === 'POST') {
    if (!user || auth?.authType!=='session') return json({ error: 'Unauthorized' }, 401, origin);
    const body = asObject(await boundedJson<unknown>(request)); const context = asObject(body?.context);
    if (!context) return json({ error: 'Teacher feedback context is required.' }, 400, origin);
    const safe = { today: asObject(context.today), subjectFeedback: Array.isArray(context.subjectFeedback) ? context.subjectFeedback.slice(0, 5) : [], academicFeedback: Array.isArray(context.academicFeedback) ? context.academicFeedback.slice(0, 3) : [], weeklyGoals: Array.isArray(context.weeklyGoals) ? context.weeklyGoals.slice(0, 5) : [], recentBottlenecks: Array.isArray(context.recentBottlenecks) ? context.recentBottlenecks.slice(0, 5) : [] };
    try { const result = await aiService.complete({ db: env.DB, userId: user.id, user: user.username, operation: 'teacher-feedback-summary', cacheKey: await sha256(stableJson(safe)), maxTokens: 180, config: providerConfig(env), messages: prompt('You summarize teacher feedback for a student. Never override, reinterpret, or invent a teacher decision. Use only the supplied academic context. Give a short Korean priority order with at most two concrete actions.', JSON.stringify(safe)) }); return json({ message: result.content, cached: result.cached }, 200, origin); } catch (cause) { return aiError(cause, origin); }
  }
  if (url.pathname === '/api/ai/arena-coach' && request.method === 'POST') {
    if (!user || auth?.authType!=='session') return json({ error: 'Unauthorized' }, 401, origin);
    const body = asObject(await boundedJson<unknown>(request)); const context = asObject(body?.context);
    if (!context) return json({ error: 'Arena 성장 컨텍스트가 필요합니다.' }, 400, origin);
    const safe = { score: asObject(context.score), metrics: asObject(context.metrics), breakdown: asObject(context.breakdown), group: asObject(context.group), nextActions: Array.isArray(context.nextActions) ? context.nextActions.slice(0, 3) : [] };
    try { const result = await aiService.complete({ db: env.DB, userId: user.id, user: user.username, operation: 'arena-coach', cacheKey: await sha256(stableJson(safe)), maxTokens: 220, config: providerConfig(env), messages: prompt(arenaSystem, JSON.stringify(safe)) }); return json({ message: result.content, cached: result.cached }, 200, origin); } catch (cause) { return aiError(cause, origin); }
  }
  if (url.pathname === '/api/ai/chat' && request.method === 'POST') {
    if (!user || auth?.authType!=='session') return json({ error: 'Unauthorized' }, 401, origin);
    const body = asObject(await boundedJson<unknown>(request)); const context = safeStudyContext(body?.context); const raw = Array.isArray(body?.messages) ? body.messages.slice(-6) : [];
    if (!context || !raw.length) return json({ error: '학습 컨텍스트와 질문이 필요합니다.' }, 400, origin);
    const conversation = raw.map(asObject).filter((item): item is Record<string, unknown> => Boolean(item)).filter((item) => (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string').map((item) => `${item.role === 'user' ? '사용자' : '코치'}: ${text(item.content).slice(0, 300)}`).join('\n');
    if (!conversation) return json({ error: '유효한 질문이 필요합니다.' }, 400, origin);
    const requestText = `선별된 학습 데이터:\n${JSON.stringify(context)}\n\n최근 대화:\n${conversation}\n\n위 질문에만 짧게 답하세요.`;
    try { const result = await aiService.complete({ db: env.DB, userId: user.id, user: user.username, operation: 'chat', cacheKey: await sha256(requestText), maxTokens: 280, config: providerConfig(env), messages: prompt(coachSystem, requestText) }); return json({ message: result.content, cached: result.cached }, 200, origin); } catch (cause) { return aiError(cause, origin); }
  }
  if (url.pathname !== '/api/sync' || !['GET', 'PUT'].includes(request.method)) return json({ error: 'Not found' }, 404, origin);
  if (!auth||!user) return json({ error: 'Unauthorized' }, 401, origin);
  if(auth.authType==='api_token'&&!auth.scopes.includes(request.method==='GET'?'sync:read':'sync:write'))return json({error:'Token scope does not allow this operation.'},403,origin);
  if (request.method === 'GET') { const row = await env.DB.prepare('SELECT payload,updated_at FROM learning_state WHERE user_id=?').bind(user.id).first<{ payload: string; updated_at: string }>(); return row ? json({ data: JSON.parse(row.payload), updatedAt: row.updated_at }, 200, origin) : json({ data: null, updatedAt: null }, 200, origin); }
  const body = await boundedJson<{ data?: unknown }>(request,MAX_SYNC_BODY); if (!body?.data) return json({ error: 'data is required' }, 400, origin);
  if(!validateAppData(body.data))return json({error:'지원되지 않는 학습 데이터 형식입니다.'},400,origin);
  const now = new Date().toISOString(); const previous = await env.DB.prepare('SELECT payload FROM learning_state WHERE user_id=?').bind(user.id).first<{ payload: string }>();
  if (previous) await env.DB.prepare('INSERT INTO learning_state_history(user_id,payload,saved_at) VALUES(?,?,?)').bind(user.id, previous.payload, now).run();
  await env.DB.prepare('INSERT INTO learning_state(user_id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').bind(user.id, JSON.stringify(body.data), now).run();
  await env.DB.prepare('DELETE FROM learning_state_history WHERE user_id=? AND id NOT IN (SELECT id FROM learning_state_history WHERE user_id=? ORDER BY id DESC LIMIT 20)').bind(user.id, user.id).run();
  return json({ ok: true, updatedAt: now }, 200, origin);
 } catch(cause) {
  const requestId=randomHex(8),cors=requestOrigin(request,env.ALLOWED_ORIGIN,env.ENVIRONMENT);
  if(cause instanceof RequestError)return json({error:cause.message,requestId},cause.status,cors.responseOrigin,cause.retryAfter?{'Retry-After':String(cause.retryAfter)}:{});
  console.error(JSON.stringify({message:'request failed',requestId,path:new URL(request.url).pathname,error:cause instanceof Error?cause.message:String(cause)}));
  return json({error:'요청 처리 중 오류가 발생했습니다.',requestId},500,cors.responseOrigin);
 }
} };
