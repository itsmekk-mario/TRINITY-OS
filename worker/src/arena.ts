type ArenaUser = { id: number; username: string; is_admin: number };
type ArenaEnv = { DB: D1Database };
type JsonResponder = (body: unknown, status?: number, origin?: string, extra?: HeadersInit) => Response;
type ArenaTools = { json: JsonResponder; randomHex: (size?: number) => string; boundedJson:<T>(request:Request,maxBytes?:number)=>Promise<T> };

function ensureArenaTables(db: D1Database) {
  return db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS arena_profiles (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,nickname TEXT NOT NULL UNIQUE,grade TEXT NOT NULL DEFAULT '',target_university TEXT NOT NULL DEFAULT '',target_department TEXT NOT NULL DEFAULT '',target_admission_type TEXT NOT NULL DEFAULT '',study_goal TEXT NOT NULL DEFAULT '[]',achievement_level TEXT NOT NULL DEFAULT '',profile_image TEXT,updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS arena_groups (id TEXT PRIMARY KEY,owner_user_id INTEGER NOT NULL REFERENCES users(id),name TEXT NOT NULL,type TEXT NOT NULL CHECK(type IN ('university','department','custom')),target_university TEXT NOT NULL DEFAULT '',target_department TEXT NOT NULL DEFAULT '',visibility TEXT NOT NULL CHECK(visibility IN ('public','private')),invite_code TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS arena_group_members (group_id TEXT NOT NULL REFERENCES arena_groups(id) ON DELETE CASCADE,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,role TEXT NOT NULL DEFAULT 'member',joined_at TEXT NOT NULL,PRIMARY KEY(group_id,user_id))"),
    db.prepare('CREATE TABLE IF NOT EXISTS arena_seasons (id TEXT PRIMARY KEY,name TEXT NOT NULL,starts_at TEXT NOT NULL,ends_at TEXT NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS arena_season_preferences (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,season_id TEXT NOT NULL REFERENCES arena_seasons(id) ON DELETE CASCADE,custom_name TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(user_id,season_id))'),
    db.prepare("CREATE TABLE IF NOT EXISTS arena_score_snapshots (id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,season_id TEXT NOT NULL REFERENCES arena_seasons(id),week_start TEXT NOT NULL,score INTEGER NOT NULL,execution INTEGER NOT NULL,problem_solving INTEGER NOT NULL,consistency INTEGER NOT NULL,growth INTEGER NOT NULL,growth_rate REAL NOT NULL DEFAULT 0,metrics TEXT NOT NULL DEFAULT '{}',calculated_at TEXT NOT NULL,UNIQUE(user_id,season_id,week_start))"),
    db.prepare('CREATE TABLE IF NOT EXISTS arena_rivals (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,rival_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,created_at TEXT NOT NULL,PRIMARY KEY(user_id,rival_user_id),CHECK(user_id <> rival_user_id))'),
    db.prepare('CREATE TABLE IF NOT EXISTS arena_achievements (id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,code TEXT NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL,awarded_at TEXT NOT NULL,UNIQUE(user_id,code))'),
  ]).then(() => db.batch([
    db.prepare('CREATE INDEX IF NOT EXISTS arena_scores_season_score ON arena_score_snapshots(season_id,score DESC)'),
    db.prepare("INSERT OR IGNORE INTO arena_seasons(id,name,starts_at,ends_at) VALUES('suneung-2028-fall','2028 수능 시즌','2026-09-01','2026-12-31')"),
  ])).then(() => undefined);
}

const object = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const string = (value: unknown, max = 80) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const number = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
const parse = <T>(value: string | null | undefined, fallback: T): T => { try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } };
const monday = (iso: string) => { const date = new Date(iso); const day = date.getUTCDay() || 7; date.setUTCDate(date.getUTCDate() - day + 1); return date.toISOString().slice(0, 10); };

type ProfileRow = { user_id: number; nickname: string; grade: string; target_university: string; target_department: string; target_admission_type: string; study_goal: string; achievement_level: string; profile_image: string | null };
const profileDto = (row: ProfileRow) => ({ nickname: row.nickname, grade: row.grade, targetUniversity: row.target_university, targetDepartment: row.target_department, targetAdmissionType: row.target_admission_type, studyGoal: parse<string[]>(row.study_goal, []), achievementLevel: row.achievement_level, ...(row.profile_image ? { profileImage: row.profile_image } : {}) });

type GroupRow = { id: string; owner_user_id: number; name: string; type: 'university' | 'department' | 'custom'; target_university: string; target_department: string; visibility: 'public' | 'private'; invite_code: string; member_count: number; joined: number };
const groupDto = (row: GroupRow, userId: number) => ({ id: row.id, name: row.name, type: row.type, targetUniversity: row.target_university, targetDepartment: row.target_department, memberCount: row.member_count, visibility: row.visibility, joined: Boolean(row.joined), owner: row.owner_user_id === userId, ...(row.owner_user_id === userId ? { inviteCode: row.invite_code } : {}) });

async function season(db: D1Database, userId: number) {
  const DAY = 86_400_000, CYCLE_DAYS = 14, anchor = Date.UTC(2026, 8, 1);
  const today = new Date(), todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const cycle = Math.max(0, Math.floor((todayUtc - anchor) / (DAY * CYCLE_DAYS)));
  const startsAt = new Date(anchor + cycle * CYCLE_DAYS * DAY).toISOString().slice(0, 10);
  const endsAt = new Date(anchor + (cycle * CYCLE_DAYS + CYCLE_DAYS - 1) * DAY).toISOString().slice(0, 10);
  const id = `arena-14d-${startsAt}`, defaultName = `14일 성장 · 시즌 ${cycle + 1}`;
  await db.prepare('INSERT OR IGNORE INTO arena_seasons(id,name,starts_at,ends_at) VALUES(?,?,?,?)').bind(id, defaultName, startsAt, endsAt).run();
  const preference = await db.prepare('SELECT custom_name FROM arena_season_preferences WHERE user_id=? AND season_id=?').bind(userId, id).first<{custom_name:string}>();
  return { id, name: preference?.custom_name || defaultName, startsAt, endsAt, status: 'active' as const };
}

type RankingRow = { user_id: number; public_id: string; nickname: string; target_university: string; target_department: string; score: number; growth_rate: number };
async function ranking(db: D1Database, userId: number, seasonId: string, groupId = '') {
  const membership = groupId ? 'AND EXISTS (SELECT 1 FROM arena_group_members gm WHERE gm.user_id=p.user_id AND gm.group_id=?)' : '';
  const statement = db.prepare(`SELECT p.user_id,u.arena_public_id public_id,p.nickname,p.target_university,p.target_department,s.score,s.growth_rate FROM arena_profiles p JOIN users u ON u.id=p.user_id JOIN arena_score_snapshots s ON s.user_id=p.user_id WHERE s.season_id=? AND s.calculated_at=(SELECT MAX(s2.calculated_at) FROM arena_score_snapshots s2 WHERE s2.user_id=s.user_id AND s2.season_id=s.season_id) ${membership} ORDER BY s.score DESC,s.growth_rate DESC,s.calculated_at ASC LIMIT 100`);
  const result = groupId ? await statement.bind(seasonId, groupId).all<RankingRow>() : await statement.bind(seasonId).all<RankingRow>();
  return result.results.map((row, index) => ({ rank: index + 1, userId: row.public_id, nickname: row.nickname, score: row.score, growthRate: row.growth_rate, targetUniversity: row.target_university, targetDepartment: row.target_department, isMe: row.user_id === userId }));
}

type ScoreRow = { score: number; execution: number; problem_solving: number; consistency: number; growth: number; metrics: string; calculated_at: string };
const scoreDto = (row: ScoreRow) => ({ total: row.score, breakdown: { execution: row.execution, problemSolving: row.problem_solving, consistency: row.consistency, growth: row.growth }, metrics: parse<Record<string, unknown>>(row.metrics, {}), calculatedAt: row.calculated_at });

async function achievements(db: D1Database, userId: number) {
  const rows = await db.prepare('SELECT id,code,title,description,awarded_at FROM arena_achievements WHERE user_id=? ORDER BY awarded_at DESC').bind(userId).all<{ id: string; code: string; title: string; description: string; awarded_at: string }>();
  return rows.results.map(row => ({ id: row.id, code: row.code, title: row.title, description: row.description, awardedAt: row.awarded_at }));
}

async function award(db: D1Database, userId: number, code: string, title: string, description: string, now: string, randomHex: (size?: number) => string) {
  await db.prepare('INSERT OR IGNORE INTO arena_achievements(id,user_id,code,title,description,awarded_at) VALUES(?,?,?,?,?,?)').bind(`ach_${randomHex(12)}`, userId, code, title, description, now).run();
}

async function rivals(db: D1Database, userId: number, seasonId: string) {
  const rows = await db.prepare(`SELECT p.user_id,u.arena_public_id public_id,p.nickname,p.target_university,p.target_department,s.score,s.growth_rate,s.metrics FROM arena_rivals r JOIN arena_profiles p ON p.user_id=r.rival_user_id JOIN users u ON u.id=p.user_id LEFT JOIN arena_score_snapshots s ON s.user_id=p.user_id AND s.season_id=? AND s.calculated_at=(SELECT MAX(s2.calculated_at) FROM arena_score_snapshots s2 WHERE s2.user_id=p.user_id AND s2.season_id=?) WHERE r.user_id=? ORDER BY r.created_at DESC`).bind(seasonId, seasonId, userId).all<RankingRow & { metrics: string | null }>();
  const mine = await db.prepare('SELECT score,growth_rate,metrics FROM arena_score_snapshots WHERE user_id=? AND season_id=? ORDER BY calculated_at DESC LIMIT 1').bind(userId, seasonId).first<{ score: number; growth_rate: number; metrics: string }>();
  const myMetrics = parse<Record<string, number>>(mine?.metrics, {});
  return rows.results.map((row, index) => { const their = parse<Record<string, number>>(row.metrics, {}); const comparison = [
    { label: '이번 주 공부', mine: Math.round((myMetrics.currentWeekSeconds || 0) / 360) / 10, rival: Math.round((their.currentWeekSeconds || 0) / 360) / 10, unit: 'h' },
    { label: '문제 해결력', mine: Math.round(myMetrics.weaknessImprovementRate || 0), rival: Math.round(their.weaknessImprovementRate || 0), unit: '%' },
    { label: '오답 개선', mine: Math.round(myMetrics.drillCompletionRate || 0), rival: Math.round(their.drillCompletionRate || 0), unit: '%' },
  ]; const gap = comparison.map(item => ({ ...item, delta: item.mine - item.rival })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0]; return { rank: index + 1, userId: row.public_id, nickname: row.nickname, score: row.score || 0, growthRate: row.growth_rate || 0, targetUniversity: row.target_university, targetDepartment: row.target_department, comparison, insight: gap ? `${gap.label}에서 ${Math.abs(gap.delta).toFixed(1)}${gap.unit} 차이가 가장 큽니다. 승패보다 다음 주 변화 폭을 확인하세요.` : '비교할 학습 기록이 아직 부족합니다.' }; });
}

export async function arena(request: Request, env: ArenaEnv, user: ArenaUser | null, origin: string, tools: ArenaTools): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/arena')) return null;
  if (!user) return tools.json({ error: 'Unauthorized' }, 401, origin);
  await ensureArenaTables(env.DB);
  const currentSeason = await season(env.DB, user.id); const now = new Date().toISOString();

  if (url.pathname === '/api/arena' && request.method === 'GET') {
    const [profile, groupRows, board, latest, rivalRows, badges] = await Promise.all([
      env.DB.prepare('SELECT * FROM arena_profiles WHERE user_id=?').bind(user.id).first<ProfileRow>(),
      env.DB.prepare(`SELECT g.*,COUNT(gm.user_id) member_count,MAX(CASE WHEN gm.user_id=? THEN 1 ELSE 0 END) joined FROM arena_groups g LEFT JOIN arena_group_members gm ON gm.group_id=g.id GROUP BY g.id HAVING g.visibility='public' OR joined=1 ORDER BY joined DESC,member_count DESC,g.created_at DESC`).bind(user.id).all<GroupRow>(),
      ranking(env.DB, user.id, currentSeason.id),
      env.DB.prepare('SELECT score,execution,problem_solving,consistency,growth,metrics,calculated_at FROM arena_score_snapshots WHERE user_id=? AND season_id=? ORDER BY calculated_at DESC LIMIT 1').bind(user.id, currentSeason.id).first<ScoreRow>(),
      rivals(env.DB, user.id, currentSeason.id),
      achievements(env.DB, user.id),
    ]);
    return tools.json({ profile: profile ? profileDto(profile) : null, groups: groupRows.results.map(row => groupDto(row, user.id)), ranking: board, rivals: rivalRows, achievements: badges, season: currentSeason, latestScore: latest ? scoreDto(latest) : null }, 200, origin);
  }

  if (url.pathname === '/api/arena/profile' && request.method === 'PUT') {
    const body = object(await tools.boundedJson<unknown>(request)); if (!body) return tools.json({ error: '프로필 정보가 필요합니다.' }, 400, origin);
    const nickname = string(body.nickname, 20); if (nickname.length < 2) return tools.json({ error: '닉네임은 2자 이상 입력해 주세요.' }, 400, origin);
    const goals = Array.isArray(body.studyGoal) ? body.studyGoal.map(item => string(item, 80)).filter(Boolean).slice(0, 5) : [];
    try { await env.DB.prepare(`INSERT INTO arena_profiles(user_id,nickname,grade,target_university,target_department,target_admission_type,study_goal,achievement_level,profile_image,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET nickname=excluded.nickname,grade=excluded.grade,target_university=excluded.target_university,target_department=excluded.target_department,target_admission_type=excluded.target_admission_type,study_goal=excluded.study_goal,achievement_level=excluded.achievement_level,profile_image=excluded.profile_image,updated_at=excluded.updated_at`).bind(user.id, nickname, string(body.grade, 20), string(body.targetUniversity), string(body.targetDepartment), string(body.targetAdmissionType, 30), JSON.stringify(goals), string(body.achievementLevel, 40), string(body.profileImage, 500) || null, now).run(); }
    catch { return tools.json({ error: '이미 사용 중인 닉네임입니다.' }, 409, origin); }
    const saved = await env.DB.prepare('SELECT * FROM arena_profiles WHERE user_id=?').bind(user.id).first<ProfileRow>();
    return tools.json({ profile: saved ? profileDto(saved) : null }, 200, origin);
  }

  if (url.pathname === '/api/arena/season' && request.method === 'PUT') {
    const body = object(await tools.boundedJson<unknown>(request)); const name = string(body?.name, 32);
    if (name.length < 2) return tools.json({ error: '시즌 이름은 2자 이상 입력해 주세요.' }, 400, origin);
    await env.DB.prepare('INSERT INTO arena_season_preferences(user_id,season_id,custom_name,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id,season_id) DO UPDATE SET custom_name=excluded.custom_name,updated_at=excluded.updated_at').bind(user.id,currentSeason.id,name,now).run();
    return tools.json({ season: { ...currentSeason, name } }, 200, origin);
  }

  if (url.pathname === '/api/arena/score' && request.method === 'POST') return tools.json({error:'클라이언트 점수 제출은 허용되지 않습니다. /api/arena/recalculate를 사용하세요.'},405,origin,{Allow:'POST /api/arena/recalculate'});

  if (url.pathname === '/api/arena/recalculate' && request.method === 'POST') {
    const row=await env.DB.prepare('SELECT payload FROM learning_state WHERE user_id=?').bind(user.id).first<{payload:string}>();
    if(!row)return tools.json({error:'Arena 점수를 계산할 학습 기록이 없습니다.'},409,origin);
    let data:AppData; try{data=JSON.parse(row.payload) as AppData;}catch{return tools.json({error:'학습 기록을 읽지 못했습니다.'},500,origin);}
    const calculatedAt=now,score=calculateArenaScore(data,new Date(calculatedAt)),{breakdown,metrics}=score;
    const execution=breakdown.execution,problem=breakdown.problemSolving,consistency=breakdown.consistency,growth=breakdown.growth,total=score.total,growthRate=metrics.growthRate;
    await env.DB.prepare(`INSERT INTO arena_score_snapshots(id,user_id,season_id,week_start,score,execution,problem_solving,consistency,growth,growth_rate,metrics,calculated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,season_id,week_start) DO UPDATE SET score=excluded.score,execution=excluded.execution,problem_solving=excluded.problem_solving,consistency=excluded.consistency,growth=excluded.growth,growth_rate=excluded.growth_rate,metrics=excluded.metrics,calculated_at=excluded.calculated_at`).bind(`score_${tools.randomHex(12)}`, user.id, currentSeason.id, monday(calculatedAt), total, execution, problem, consistency, growth, growthRate, JSON.stringify(metrics).slice(0, 8000), calculatedAt).run();
    const profile = await env.DB.prepare('SELECT target_university,achievement_level FROM arena_profiles WHERE user_id=?').bind(user.id).first<{ target_university: string; achievement_level: string }>();
    if (profile?.target_university.includes('서울대') && number(metrics.streakDays, 0, 10000) >= 30) await award(env.DB, user.id, 'snu-challenger', '서울대 도전자', '서울대학교 목표 설정 후 30일 연속 학습', now, tools.randomHex);
    if (profile?.achievement_level.includes('1등급')) await award(env.DB, user.id, 'grade-one', '1등급 진입', '프로필 성취 수준에 1등급 기록', now, tools.randomHex);
    if (number(metrics.completedTripleDrills, 0, 10000) >= 1) await award(env.DB, user.id, 'wrong-answer-breaker', '오답 제거자', '동일 오답 Drill 3회 연속 재풀이 완료', now, tools.randomHex);
    if (growthRate >= 10) await award(env.DB, user.id, 'growth-10', '주간 성장 +10', '한 주 성장률 10% 이상 달성', now, tools.randomHex);
    return tools.json({ ok: true,score, achievements: await achievements(env.DB, user.id) }, 200, origin);
  }

  if (url.pathname === '/api/arena/groups' && request.method === 'POST') {
    const body = object(await tools.boundedJson<unknown>(request)); const name = string(body?.name, 50); const type = string(body?.type, 20); const visibility = string(body?.visibility, 20);
    if (!name || !['university', 'department', 'custom'].includes(type) || !['public', 'private'].includes(visibility)) return tools.json({ error: '그룹 정보를 확인해 주세요.' }, 400, origin);
    const id = `grp_${tools.randomHex(12)}`, invite = tools.randomHex(5).toUpperCase();
    await env.DB.batch([env.DB.prepare('INSERT INTO arena_groups(id,owner_user_id,name,type,target_university,target_department,visibility,invite_code,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id, user.id, name, type, string(body?.targetUniversity), string(body?.targetDepartment), visibility, invite, now), env.DB.prepare("INSERT INTO arena_group_members(group_id,user_id,role,joined_at) VALUES(?,?, 'owner',?)").bind(id, user.id, now)]);
    const row = await env.DB.prepare('SELECT g.*,1 member_count,1 joined FROM arena_groups g WHERE id=?').bind(id).first<GroupRow>();
    return tools.json({ group: row ? groupDto(row, user.id) : null }, 201, origin);
  }

  if (url.pathname === '/api/arena/groups/join' && request.method === 'POST') {
    const body = object(await tools.boundedJson<unknown>(request)); const lookup = string(body?.groupIdOrCode, 80); if (!lookup) return tools.json({ error: '그룹 또는 초대 코드를 입력해 주세요.' }, 400, origin);
    const group = await env.DB.prepare('SELECT id,visibility,invite_code FROM arena_groups WHERE id=? OR invite_code=?').bind(lookup, lookup.toUpperCase()).first<{ id: string; visibility: string; invite_code: string }>();
    if (!group) return tools.json({ error: '그룹을 찾지 못했습니다.' }, 404, origin);
    if (group.visibility === 'private' && lookup.toUpperCase() !== group.invite_code) return tools.json({ error: '비공개 그룹은 초대 코드가 필요합니다.' }, 403, origin);
    await env.DB.prepare("INSERT OR IGNORE INTO arena_group_members(group_id,user_id,role,joined_at) VALUES(?,?,'member',?)").bind(group.id, user.id, now).run();
    return tools.json({ ok: true }, 200, origin);
  }

  if (url.pathname === '/api/arena/ranking' && request.method === 'GET') {
    const groupId=string(url.searchParams.get('group'),80);
    if(groupId){const access=await env.DB.prepare("SELECT g.id FROM arena_groups g LEFT JOIN arena_group_members gm ON gm.group_id=g.id AND gm.user_id=? WHERE g.id=? AND (g.visibility='public' OR gm.user_id IS NOT NULL)").bind(user.id,groupId).first(); if(!access)return tools.json({error:'그룹 접근 권한이 없습니다.'},403,origin);}
    return tools.json({ranking:await ranking(env.DB,user.id,currentSeason.id,groupId)},200,origin);
  }

  if (url.pathname === '/api/arena/rivals' && request.method === 'POST') {
    const body = object(await tools.boundedJson<unknown>(request)); const rivalPublicId=string(body?.rivalUserId,80); const rival=await env.DB.prepare('SELECT id FROM users WHERE arena_public_id=? AND active=1').bind(rivalPublicId).first<{id:number}>(); const rivalId=rival?.id||0; if (!rivalId || rivalId === user.id) return tools.json({ error: '라이벌을 확인해 주세요.' }, 400, origin);
    const count = await env.DB.prepare('SELECT COUNT(*) count FROM arena_rivals WHERE user_id=?').bind(user.id).first<{ count: number }>(); if ((count?.count || 0) >= 3) return tools.json({ error: '라이벌은 최대 3명까지 지정할 수 있습니다.' }, 409, origin);
    const exists = await env.DB.prepare('SELECT user_id FROM arena_profiles WHERE user_id=?').bind(rivalId).first(); if (!exists) return tools.json({ error: '학생을 찾지 못했습니다.' }, 404, origin);
    await env.DB.prepare('INSERT OR IGNORE INTO arena_rivals(user_id,rival_user_id,created_at) VALUES(?,?,?)').bind(user.id, rivalId, now).run(); return tools.json({ ok: true }, 200, origin);
  }

  if (url.pathname.startsWith('/api/arena/rivals/') && request.method === 'DELETE') { const publicId=decodeURIComponent(url.pathname.slice('/api/arena/rivals/'.length)); const rival=await env.DB.prepare('SELECT id FROM users WHERE arena_public_id=?').bind(publicId).first<{id:number}>(); if(rival)await env.DB.prepare('DELETE FROM arena_rivals WHERE user_id=? AND rival_user_id=?').bind(user.id, rival.id).run(); return tools.json({ ok: true }, 200, origin); }
  return tools.json({ error: 'Not found' }, 404, origin);
}
import type { AppData } from '../../src/types';
import { calculateArenaScore } from '../../src/lib/arenaScore.ts';
