import type { AppData } from '../../src/types';
import { newSignal, readSignal, updateSignal } from './teacherSignals.ts';
import { calculateCoreRulePriority, getCoreRuleStats, listActiveCoreRules } from './learning-graph.ts';

type Env = { DB: D1Database };
type Account = { id: string; username: string; role: string };
type StudentActor = { id: number; is_admin: number } | null;
type Helpers = { json: (body: unknown, status?: number, origin?: string) => Response; randomHex: (size?: number) => string; boundedJson:<T>(request:Request,maxBytes?:number)=>Promise<T> };
type Permission = 'viewSessions'|'viewScores'|'viewWrongAnswers'|'viewMockExams'|'viewCalendar'|'viewWeeklyGoals'|'viewDrills'|'viewPlaire'|'viewAcademicInsights'|'createFeedback';
type Assignment = { id:string; student_user_id:number; support_account_id:string; role:'subject_teacher'|'academic_manager'|'parent'|'admin'; subject:string|null; permissions_json:string; created_at:string };

const clean = (value: unknown, max = 1200) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const asArray = (value: unknown, max = 8) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map(item => clean(item,80)).filter(Boolean).slice(0,max) : [];
const permissions = (value: string): Record<Permission, boolean> => { try { const parsed=JSON.parse(value); return parsed && typeof parsed==='object' ? parsed as Record<Permission,boolean> : {} as Record<Permission,boolean>; } catch { return {} as Record<Permission, boolean>; } };
const allowed = (assignment: Assignment, permission: Permission) => assignment.role === 'academic_manager' || assignment.role === 'admin' || permissions(assignment.permissions_json)[permission] === true;
const archiveSubjectFor = (subject: string | null) => subject==='국어'?'korean':subject==='수학'?'math':subject==='영어'?'english':null;
const teacherArchiveEntry = (entry:Record<string,unknown>,annotations:Record<string,unknown>[],rules:Record<string,unknown>[]) => ({
  id:String(entry.id),subject:entry.subject,year:Number(entry.year),month:Number(entry.month),institution:String(entry.institution??''),institutionCustomName:entry.institution_custom_name??undefined,examName:String(entry.exam_name??''),sourceName:String(entry.source_name??''),questionNumber:String(entry.question_number??''),category:String(entry.category??''),subcategory:String(entry.subcategory??''),title:String(entry.title??''),studiedAt:String(entry.studied_at??''),masteryStatus:String(entry.mastery_status??''),memo:String(entry.memo??''),conditionSummary:entry.condition_summary??undefined,firstThought:entry.first_thought??undefined,representation:entry.representation??undefined,solutionFlow:entry.solution_flow??undefined,bottleneck:entry.bottleneck??undefined,transfer:entry.transfer??undefined,mainIdea:entry.main_idea??undefined,structureSummary:entry.structure_summary??undefined,keyExpression:entry.key_expression??undefined,reviewEnabled:Boolean(entry.review_enabled),wrongAnswerId:entry.wrong_answer_id??null,annotations:annotations.filter(item=>item.entryId===entry.id).map(item=>({id:String(item.id),archiveEntryId:String(entry.id),color:String(item.color??''),type:String(item.type??''),text:String(item.text??''),order:Number(item.sortOrder??0)})),coreRules:rules.filter(item=>item.entryId===entry.id).map(item=>({...item,id:String(item.id),title:String(item.title??''),content:String(item.content??''),subject:entry.subject,tags:(()=>{try{return JSON.parse(String(item.tagsJson??'[]'))}catch{return[]}})(),masteryStatus:String(item.masteryStatus??'input'),usageCount:0}))
});

export const outData = (data: AppData, assignment: Assignment) => {
  const manager = assignment.role === 'academic_manager' || assignment.role === 'admin';
  const parent = assignment.role === 'parent';
  const subject = assignment.subject;
  const p = permissions(assignment.permissions_json);
  const isSubject = <T extends { subject?: string }>(item: T) => manager || parent || !subject || item.subject === subject;
  const sessions = allowed(assignment,'viewSessions') ? (data.sessions??[]).filter(isSubject).map(({id,subject,date,seconds})=>({id,subject,date,seconds})) : [];
  const scores = (allowed(assignment,'viewScores') || allowed(assignment,'viewMockExams')) ? (data.scores??[]).map(score=>parent
    ? {id:score.id,date:score.date,name:score.name,korean:score.korean,math:score.math,english:score.english}
    : manager ? {id:score.id,date:score.date,name:score.name,subject:score.subject,korean:score.reviews?.국어?.score??score.korean,math:score.reviews?.수학?.score??score.math,english:score.reviews?.영어?.score??score.english,duration:score.duration,errorType:score.errorType} : {id:score.id,date:score.date,name:score.name,subject:subject,score:subject==='수학'?score.reviews?.수학?.score??score.math:subject==='국어'?score.reviews?.국어?.score??score.korean:subject==='영어'?score.reviews?.영어?.score??score.english:undefined,duration:score.subject===subject?score.duration:score.reviews?.[subject as '수학'|'국어'|'영어']?.duration,errorType:score.subject===subject?score.errorType:undefined})
    .filter(score=>manager||parent||score.score!==undefined) : [];
  const plans = allowed(assignment,'viewCalendar') ? Object.values(data.calendar??{}).flatMap(day=>(day.plans??[]).filter(isSubject).map(plan=>({id:plan.id,date:day.date,subject:plan.subject,title:plan.title,done:plan.done,quantity:plan.quantity}))) : [];
  // Reuse the student's calendar entry; this is a permission-filtered view,
  // not a parallel calendar data store.
  const calendarDays = allowed(assignment,'viewCalendar') ? Object.values(data.calendar??{}).map(day=>({date:day.date,study:day.study,minutes:day.minutes,exam:day.exam,event:day.event,condition:day.condition,reflection:manager?day.reflection:undefined})) : [];
  const wrongAnswerDrills = allowed(assignment,'viewWrongAnswers') && !parent ? (data.wrongAnswerDrills??[]).filter(isSubject).map(({id,date,subject,source,question,bottleneck,wrongJudgment,missedCue,correction,transfer,scoreId,capabilityGoalId,retries})=>({id,date,subject,source,question,bottleneck,wrongJudgment,missedCue,correction,transfer,scoreId,capabilityGoalId,retries})) : [];
  const weeklyCapabilityGoals = allowed(assignment,'viewWeeklyGoals') ? (data.weeklyCapabilityGoals??[]).filter(isSubject).map(({id,weekStart,subject,ability,successCriterion,drillDesign,evidence,feedbackId,done})=>({id,weekStart,subject,ability,successCriterion:parent?undefined:successCriterion,drillDesign:parent?undefined:drillDesign,evidence:parent?undefined:evidence,feedbackId,done})) : [];
  const dailyDrills = allowed(assignment,'viewDrills') ? (data.dailyDrills??[]).filter(isSubject).map(({id,date,subject,title,action,successCriterion,capabilityGoalId,feedbackId,done,minutes})=>({id,date,subject,title,action:parent?undefined:action,successCriterion:parent?undefined:successCriterion,capabilityGoalId,feedbackId,done,minutes})) : [];
  const resources = (data.resources??[]).filter(isSubject).map(({id,subject,name,total,done})=>({id,subject,name,total,done}));
  const plaire = !parent && manager ? Object.values(data.plaire??{}).map(({date,bottleneck,nextAction})=>({date,bottleneck,nextAction})) : [];
  const trinity = !parent && allowed(assignment,'viewAcademicInsights') ? (data.trinity??[]).filter(isSubject).map(({id,date,subject,fields})=>({id,date,subject,fields})) : [];
  const monthlyPlans=allowed(assignment,'viewWeeklyGoals')?(data.monthlyPlans??[]).filter(isSubject).map(({id,month,subject,title,objective,strategy,successCriterion,done})=>({id,month,subject,title,objective:parent?undefined:objective,strategy:parent?undefined:strategy,successCriterion:parent?undefined:successCriterion,done})):[];
  const routine=allowed(assignment,'viewCalendar')?(data.routine??[]).filter(isSubject).map(({id,time,subject,title,detail})=>({id,time,subject,title,detail:parent?undefined:detail})):[];
  const goals=allowed(assignment,'viewWeeklyGoals')?(data.goals??[]).filter(isSubject).map(({id,subject,text,done})=>({id,subject,text,done})):[];
  const access={sessions:allowed(assignment,'viewSessions'),scores:allowed(assignment,'viewScores')||allowed(assignment,'viewMockExams'),wrongAnswers:!parent&&allowed(assignment,'viewWrongAnswers'),weeklyGoals:allowed(assignment,'viewWeeklyGoals'),drills:allowed(assignment,'viewDrills'),trinity:!parent&&allowed(assignment,'viewAcademicInsights')};
  return { access,sessions,scores,plans,calendarDays,wrongAnswerDrills,weeklyCapabilityGoals,dailyDrills,resources,plaire,trinity,monthlyPlans,routine,goals };
};

export async function teacherArena(env: Env, studentUserId: number, role: string) {
  if (role !== 'academic_manager' && role !== 'admin') return undefined;
  const tables = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('arena_score_snapshots','arena_seasons','arena_achievements','arena_groups','arena_group_members')").all<{name:string}>();
  if (tables.results.length !== 5) return {snapshots:[],achievements:[],groups:[]};
  const columns=await env.DB.prepare('PRAGMA table_info(arena_score_snapshots)').all<{name:string}>(),v2=columns.results.some(v=>v.name==='score_version');
  const snapshotSql=v2?'SELECT s.id,s.week_start,s.score,s.execution,s.mastery,s.performance,s.consistency,s.growth,s.score_version,s.calculated_at,t.name season FROM arena_score_snapshots s JOIN arena_seasons t ON t.id=s.season_id WHERE s.user_id=? AND s.score_version=2 ORDER BY s.week_start DESC,s.calculated_at DESC LIMIT 104':'SELECT s.id,s.week_start,s.score,s.execution,0 mastery,s.problem_solving performance,s.consistency,s.growth,1 score_version,s.calculated_at,t.name season FROM arena_score_snapshots s JOIN arena_seasons t ON t.id=s.season_id WHERE s.user_id=? ORDER BY s.week_start DESC,s.calculated_at DESC LIMIT 104';
  const [snapshots,achievements,groups] = await Promise.all([
    env.DB.prepare(snapshotSql).bind(studentUserId).all(),
    env.DB.prepare('SELECT id,title,description,awarded_at FROM arena_achievements WHERE user_id=? ORDER BY awarded_at DESC').bind(studentUserId).all(),
    env.DB.prepare('SELECT g.id,g.name,g.type FROM arena_groups g JOIN arena_group_members m ON m.group_id=g.id WHERE m.user_id=? ORDER BY g.name').bind(studentUserId).all()
  ]);
  return {snapshots:snapshots.results,achievements:achievements.results,groups:groups.results};
}

async function state(env: Env, studentUserId: number) {
  const row = await env.DB.prepare('SELECT payload FROM learning_state WHERE user_id=?').bind(studentUserId).first<{payload:string}>();
  if (!row) return null;
  try { return JSON.parse(row.payload) as AppData; } catch { return null; }
}
async function studentByPublicId(env: Env, publicId: string) { return env.DB.prepare('SELECT id,username,arena_public_id FROM users WHERE arena_public_id=? AND active=1').bind(publicId).first<{id:number;username:string;arena_public_id:string}>(); }
async function assignmentFor(env: Env, account: Account, publicId: string) {
  const student = await studentByPublicId(env, publicId); if (!student) return null;
  if (account.role === 'admin') return { assignment:{id:'admin',student_user_id:student.id,support_account_id:account.id,role:'admin',subject:null,permissions_json:'{}',created_at:''} as Assignment, student };
  const assignment = await env.DB.prepare('SELECT * FROM student_support_assignments WHERE support_account_id=? AND student_user_id=? AND role=? ORDER BY created_at DESC LIMIT 1').bind(account.id,student.id,account.role).first<Assignment>();
  return assignment ? { assignment,student } : null;
}
const feedbackRow = (row: Record<string, unknown>) => ({ ...row, categories: (()=>{ try{return JSON.parse(String(row.categories_json ?? '[]'));}catch{return[];} })(), signal:readSignal(row.signal_json), acknowledgedByStudent:Boolean(row.acknowledged_at) });
const feedbackContext = (body: Record<string, unknown>) => ({ type: ['general','mock_exam','wrong_answer','drill','weekly_goal','subject_progress','statistics','resource','weekly_plan','core_rule','learning_item'].includes(String(body.contextType)) ? String(body.contextType) : 'general', targetId: clean(body.contextTargetId,100) || null });
const feedbackLinks=(body:Record<string,unknown>)=>Array.isArray(body.links)?body.links.map(item=>item&&typeof item==='object'?item as Record<string,unknown>:{}).map(item=>({type:clean(item.type,30),id:clean(item.id,100)})).filter(item=>['wrong_answer','core_rule','learning_item','drill','subject_progress','mock_exam'].includes(item.type)&&item.id).slice(0,12):[];

export async function collaboration(request: Request, env: Env, owner: boolean, account: Account | null, origin: string, h: Helpers, studentActor: StudentActor = null): Promise<Response | null> {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  if (!path.startsWith('/api/collab/')) return null;
  const out = (body: unknown, status = 200) => h.json(body,status,origin);
  try {
    if (!studentActor && !account) return out({error:'Unauthorized'},401);
    if (path === '/api/collab/student/feedback' && method === 'GET') {
      if (!studentActor) return out({error:'Student session required'},403);
      const rows = await env.DB.prepare("SELECT f.*,a.username AS teacher_name,a.collaboration_role AS teacher_role FROM teacher_feedback f JOIN support_accounts a ON a.id=f.teacher_id WHERE f.student_user_id=? ORDER BY CASE f.progress WHEN 'active' THEN 0 ELSE 1 END,f.created_at DESC LIMIT 100").bind(studentActor.id).all<Record<string,unknown>>();
      return out({feedback:rows.results.map(feedbackRow)});
    }
    const studentFeedback = path.match(/^\/api\/collab\/student\/feedback\/([^/]+)\/(acknowledge|apply)$/);
    if (studentFeedback && method === 'POST') {
      if (!studentActor) return out({error:'Student session required'},403);
      const [,id,operation] = studentFeedback; const feedback = await env.DB.prepare('SELECT id FROM teacher_feedback WHERE id=? AND student_user_id=?').bind(id,studentActor.id).first(); if (!feedback) return out({error:'Feedback not found'},404);
      const now = new Date().toISOString();
      if (operation === 'acknowledge') await env.DB.prepare('UPDATE teacher_feedback SET acknowledged_at=?,updated_at=? WHERE id=? AND student_user_id=?').bind(now,now,id,studentActor.id).run();
      else { const body=await h.boundedJson<{target?:string;linkedId?:string}>(request); const column=body.target==='weekly_goal'?'linked_weekly_goal_id':body.target==='daily_drill'?'linked_daily_drill_id':''; const linked=clean(body.linkedId,100); if(!column||!linked)return out({error:'Invalid feedback link'},400); await env.DB.prepare(`UPDATE teacher_feedback SET ${column}=?,acknowledged_at=COALESCE(acknowledged_at,?),updated_at=? WHERE id=? AND student_user_id=?`).bind(linked,now,now,id,studentActor.id).run(); }
      return out({ok:true});
    }
    if (!account) return out({error:'Support session required'},403);
    const rulesRoute=path.match(/^\/api\/collab\/students\/([^/]+)\/core-rules$/);
    if(rulesRoute&&method==='GET'){
      const access=await assignmentFor(env,account,rulesRoute[1]);
      if(!access||access.assignment.role==='parent')return out({error:'Core Rule permission required'},403);
      const assigned=access.assignment.role==='subject_teacher'?archiveSubjectFor(access.assignment.subject):null;
      if(access.assignment.role==='subject_teacher'&&!assigned)return out({error:'Unsupported subject'},403);
      return out({rules:await listActiveCoreRules(env.DB,access.student.id,assigned??undefined,30)});
    }
    const intelligenceRoute=path.match(/^\/api\/collab\/students\/([^/]+)\/core-rules\/([^/]+)\/intelligence$/);
    if(intelligenceRoute&&method==='GET'){
      const access=await assignmentFor(env,account,intelligenceRoute[1]);
      if(!access||access.assignment.role==='parent')return out({error:'Core Rule permission required'},403);
      const assigned=access.assignment.role==='subject_teacher'?archiveSubjectFor(access.assignment.subject):null;
      if(access.assignment.role==='subject_teacher'&&!assigned)return out({error:'Unsupported subject'},403);
      const id=decodeURIComponent(intelligenceRoute[2]);
      const coreRule=await env.DB.prepare(`SELECT id,subject,title,content,tags_json tagsJson,mastery_status masteryStatus FROM core_rules WHERE id=? AND user_id=? ${assigned?'AND subject=?':''}`).bind(id,access.student.id,...(assigned?[assigned]:[])).first<Record<string,unknown>>();
      if(!coreRule)return out({error:'Core Rule not found'},404);
      const [linkedItems,wrongAnswers,drills,reviews,evidence,stats]=await Promise.all([
        env.DB.prepare('SELECT e.id,e.title,e.studied_at studiedAt FROM archive_entries e JOIN archive_entry_core_rules l ON l.archive_entry_id=e.id WHERE l.core_rule_id=? AND e.user_id=? ORDER BY e.studied_at DESC').bind(id,access.student.id).all(),
        env.DB.prepare('SELECT w.id,w.date,w.question FROM wrong_answers w JOIN core_rule_wrong_answer_links l ON l.user_id=w.user_id AND l.wrong_answer_id=w.id WHERE l.core_rule_id=? AND w.user_id=? ORDER BY w.updated_at DESC').bind(id,access.student.id).all(),
        env.DB.prepare('SELECT d.id,d.date,d.title FROM learning_drills d JOIN core_rule_drill_links l ON l.user_id=d.user_id AND l.drill_id=d.id WHERE l.core_rule_id=? AND d.user_id=? ORDER BY d.updated_at DESC').bind(id,access.student.id).all(),
        env.DB.prepare("SELECT id,reviewed_at reviewedAt,result FROM learning_reviews WHERE user_id=? AND target_type='core_rule' AND target_id=? ORDER BY COALESCE(reviewed_at,scheduled_at,created_at) DESC").bind(access.student.id,id).all(),
        env.DB.prepare('SELECT source_type sourceType,source_id sourceId,relation_type relationType,occurred_at occurredAt,created_at createdAt FROM core_rule_evidence WHERE user_id=? AND core_rule_id=? ORDER BY occurred_at DESC,created_at DESC LIMIT 100').bind(access.student.id,id).all(),
        getCoreRuleStats(env.DB,access.student.id,id),
      ]);
      const priority=calculateCoreRulePriority(stats,String(coreRule.masteryStatus??'input'));
      return out({coreRule:{...coreRule,tags:(()=>{try{return JSON.parse(String(coreRule.tagsJson??'[]'))}catch{return[]}})(),usageCount:stats.evidenceCount},linkedItems:linkedItems.results,wrongAnswers:wrongAnswers.results,drills:drills.results,reviews:reviews.results,evidence:evidence.results,stats:{...stats,linkedItems:linkedItems.results.length},...priority});
    }
    const archiveRoute = path.match(/^\/api\/collab\/students\/([^/]+)\/archive$/);
    if (archiveRoute && method === 'GET') {
      const access=await assignmentFor(env,account,archiveRoute[1]);
      if(!access || access.assignment.role==='parent' || (!allowed(access.assignment,'viewWrongAnswers')&&!allowed(access.assignment,'viewAcademicInsights')))return out({error:'Archive permission required'},403);
      const subject=access.assignment.role==='subject_teacher'&&access.assignment.subject ? archiveSubjectFor(access.assignment.subject)??'__none__' : null;
      const entries=await env.DB.prepare(`SELECT e.* FROM archive_entries e WHERE e.user_id=? ${subject?'AND e.subject=?':''} ORDER BY e.studied_at DESC LIMIT 300`).bind(access.student.id,...(subject?[subject]:[])).all<Record<string,unknown>>();
      const ids=entries.results.map(item=>String(item.id));if(!ids.length)return out({entries:[]});const marks=ids.map(()=>'?').join(',');
      const [annotations,rules]=await Promise.all([env.DB.prepare(`SELECT id,archive_entry_id entryId,color,type,text,sort_order sortOrder FROM archive_annotations WHERE archive_entry_id IN (${marks}) ORDER BY sort_order`).bind(...ids).all<Record<string,unknown>>(),env.DB.prepare(`SELECT l.archive_entry_id entryId,r.id,r.title,r.content,r.tags_json tagsJson,r.mastery_status masteryStatus FROM archive_entry_core_rules l JOIN core_rules r ON r.id=l.core_rule_id WHERE l.archive_entry_id IN (${marks}) AND r.user_id=?`).bind(...ids,access.student.id).all<Record<string,unknown>>()]);
      return out({entries:entries.results.map(entry=>teacherArchiveEntry(entry,annotations.results,rules.results))});
    }
    if (path === '/api/collab/assignments' && method === 'GET') {
      if (!owner && account.role !== 'admin') return out({error:'Admin required'},403);
      const [assignments,students]=await Promise.all([env.DB.prepare('SELECT x.*,a.username teacher_name,u.username student_name,u.arena_public_id student_id FROM student_support_assignments x JOIN support_accounts a ON a.id=x.support_account_id JOIN users u ON u.id=x.student_user_id ORDER BY x.created_at DESC').all(),env.DB.prepare('SELECT username,arena_public_id student_id FROM users WHERE active=1 ORDER BY username').all()]); return out({assignments:assignments.results,students:students.results});
    }
    if (path === '/api/collab/assignments' && method === 'POST') {
      if (!owner && account.role !== 'admin') return out({error:'Admin required'},403);
      const body=await h.boundedJson<{teacherId?:string;studentId?:string;role?:string;subject?:string;permissions?:Record<Permission,boolean>}>(request); const teacherId=clean(body.teacherId,100), studentId=clean(body.studentId,80); const role=['academic_manager','subject_teacher','parent'].includes(String(body.role)) ? String(body.role) as Assignment['role'] : null; const subject=clean(body.subject,30);
      if(!teacherId||!studentId||!role||(role==='subject_teacher'&&!subject))return out({error:'Student, support account, role, and subject are required'},400);
      const [teacher,student]=await Promise.all([env.DB.prepare("SELECT id,COALESCE(collaboration_role,CASE role WHEN 'tutor' THEN 'subject_teacher' ELSE role END) role FROM support_accounts WHERE id=? AND active=1").bind(teacherId).first<{id:string;role:string}>(),studentByPublicId(env,studentId)]); if(!teacher||!student)return out({error:'Account or student not found'},404); if(teacher.role!==role)return out({error:'Support account role does not match assignment role'},400);
      const id=h.randomHex(16),now=new Date().toISOString(); await env.DB.batch([env.DB.prepare('INSERT INTO student_support_assignments(id,student_user_id,support_account_id,role,subject,permissions_json,created_at) VALUES(?,?,?,?,?,?,?)').bind(id,student.id,teacherId,role,role==='subject_teacher'?subject:null,JSON.stringify(body.permissions??{}),now),env.DB.prepare('INSERT INTO security_audit_logs(id,actor_type,actor_id,action,target_type,target_id,created_at,metadata_json) VALUES(?,?,?,?,?,?,?,?)').bind(h.randomHex(16),'student_admin',account.id,'assignment.create','student_support_assignment',id,now,JSON.stringify({studentPublicId:student.arena_public_id,role,subject:role==='subject_teacher'?subject:null}))]); return out({ok:true,id},201);
    }
    if (path === '/api/collab/dashboard' && method === 'GET') {
      const sql=account.role==='admin' ? `SELECT 'admin-'||u.id id,u.id student_user_id,? support_account_id,'admin' role,NULL subject,'{}' permissions_json,'' created_at,u.arena_public_id student_id,u.username student_name FROM users u WHERE u.active=1` : `SELECT x.*,u.arena_public_id student_id,u.username student_name FROM student_support_assignments x JOIN users u ON u.id=x.student_user_id WHERE x.support_account_id=? AND x.role=? AND u.active=1 ORDER BY x.created_at DESC`;
      const assignments=await env.DB.prepare(sql).bind(account.id,...(account.role==='admin'?[]:[account.role])).all(); return out({assignments:assignments.results.map((item:any)=>({...item,permissions:permissions(item.permissions_json)}))});
    }
    const signalRoute = path.match(/^\/api\/collab\/students\/([^/]+)\/signals\/([^/]+)$/);
    if (signalRoute && method === 'PATCH') {
      const access = await assignmentFor(env,account,signalRoute[1]);
      if (!access || access.assignment.role === 'parent' || !allowed(access.assignment,'createFeedback')) return out({error:'Signal permission required'},403);
      const previous = await env.DB.prepare('SELECT * FROM teacher_feedback WHERE id=? AND student_user_id=?').bind(signalRoute[2],access.student.id).first<Record<string,unknown>>();
      const signal = readSignal(previous?.signal_json);
      if (!previous || !signal || (access.assignment.role === 'subject_teacher' && signal.subject !== access.assignment.subject) || signal.targetRole !== access.assignment.role) return out({error:'Signal not assigned to this role'},403);
      const body = await h.boundedJson<Record<string,unknown>>(request);
      if (body.weeklyGoal && previous.linked_weekly_goal_id || body.dailyDrill && previous.linked_daily_drill_id) return out({error:'Student has already applied this intervention'},409);
      let next; try { next=updateSignal(signal,body); } catch { return out({error:'Invalid signal update'},400); }
      const now=new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare('INSERT INTO teacher_feedback_audit(id,feedback_id,editor_id,snapshot_json,edited_at) VALUES(?,?,?,?,?)').bind(h.randomHex(16),signalRoute[2],account.id,JSON.stringify(previous),now),
        env.DB.prepare('UPDATE teacher_feedback SET signal_json=?,updated_at=? WHERE id=? AND student_user_id=?').bind(JSON.stringify(next),now,signalRoute[2],access.student.id)
      ]);
      return out({ok:true});
    }
    const edit=path.match(/^\/api\/collab\/feedback\/([^/]+)$/);
    if(edit&&method==='PATCH'){
      const previous=await env.DB.prepare('SELECT * FROM teacher_feedback WHERE id=? AND teacher_id=?').bind(edit[1],account.id).first<Record<string,unknown>>(); if(!previous)return out({error:'Only the author can edit this feedback'},403); const authorAccess=await assignmentFor(env,account,String(previous.student_id)); if(!authorAccess||!allowed(authorAccess.assignment,'createFeedback'))return out({error:'Feedback permission required'},403);
      const body=await h.boundedJson<Record<string,unknown>>(request),now=new Date().toISOString(),context=feedbackContext(body); await env.DB.prepare('INSERT INTO teacher_feedback_audit(id,feedback_id,editor_id,snapshot_json,edited_at) VALUES(?,?,?,?,?)').bind(h.randomHex(16),edit[1],account.id,JSON.stringify(previous),now).run(); await env.DB.prepare('UPDATE teacher_feedback SET title=?,categories_json=?,status=?,progress=?,bottleneck=?,observation=?,action=?,success_criterion=?,comment=?,context_type=?,context_target_id=?,updated_at=? WHERE id=? AND teacher_id=?').bind(clean(body.title,160),JSON.stringify(asArray(body.categories)),['needs_improvement','normal','stable'].includes(String(body.status))?String(body.status):String(previous.status),['active','achieved','replaced','archived'].includes(String(body.progress))?String(body.progress):String(previous.progress),clean(body.bottleneck),clean(body.observation,2000),clean(body.action,1200),clean(body.successCriterion,1200),clean(body.comment,2000),context.type,context.targetId,now,edit[1],account.id).run(); return out({ok:true,updatedAt:now});
    }
    const dailyRoute=path.match(/^\/api\/collab\/students\/([^/]+)\/daily\/([0-9]{4}-[0-9]{2}-[0-9]{2})$/);
    if(dailyRoute&&method==='GET'){
      const access=await assignmentFor(env,account,dailyRoute[1]); if(!access)return out({error:'No assignment for this student'},403);
      const date=dailyRoute[2];
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(`${date}T12:00:00Z`)))return out({error:'Invalid date'},400);
      const data=await state(env,access.student.id); if(!data)return out({studentId:access.student.arena_public_id,date,data:null});
      const view=outData(data,access.assignment);
      const noon=new Date(`${date}T12:00:00Z`); noon.setUTCDate(noon.getUTCDate()-((noon.getUTCDay()||7)-1)); const weekStart=noon.toISOString().slice(0,10);
      return out({studentId:access.student.arena_public_id,date,data:{
        sessions:view.sessions.filter(item=>item.date===date),scores:view.scores.filter(item=>item.date===date),wrongAnswerDrills:view.wrongAnswerDrills.filter(item=>item.date===date),dailyDrills:view.dailyDrills.filter(item=>item.date===date),plans:view.plans.filter(item=>item.date===date),calendarDays:view.calendarDays.filter(item=>item.date===date),plaire:view.plaire.filter(item=>item.date===date),trinity:view.trinity.filter(item=>item.date===date),weeklyCapabilityGoals:view.weeklyCapabilityGoals.filter(item=>item.weekStart===weekStart),resources:[],access:view.access
      }});
    }
    const match=path.match(/^\/api\/collab\/students\/([^/]+)(?:\/(data|feedback))?$/); if(!match)return out({error:'Not found'},404);
    const access=await assignmentFor(env,account,match[1]); if(!access)return out({error:'No assignment for this student'},403); const {assignment,student}=access; const data=await state(env,student.id);
    if(!match[2]&&method==='GET')return out({studentId:student.arena_public_id,assignment:{role:assignment.role,subject:assignment.subject,permissions:permissions(assignment.permissions_json)},summary:data?{totalSeconds:outData(data,assignment).sessions.reduce((sum,item)=>sum+item.seconds,0)}:null});
    if(match[2]==='data'&&method==='GET'){
      if(!data)return out({studentId:student.arena_public_id,data:null,teacherView:null}); const view=outData(data,assignment); const arena=await teacherArena(env,student.id,assignment.role); const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}); const monday=new Date(today+'T12:00:00Z'); monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()||7)-1)); const weekStart=monday.toISOString().slice(0,10); const weeklySessions=view.sessions.filter(item=>item.date>=weekStart&&item.date<=today); const weeklyPlans=view.plans.filter(item=>item.date>=weekStart&&item.date<=today); const teacherView={student:{id:student.arena_public_id,displayName:student.username},progress:{weeklyStudyMinutes:view.access.sessions?Math.round(weeklySessions.reduce((total,item)=>total+item.seconds,0)/60):null,executionRate:weeklyPlans.length?Math.round(weeklyPlans.filter(item=>item.done).length/weeklyPlans.length*100):null,subjectProgress:weeklySessions.reduce<Record<string,number>>((totals,item)=>{totals[item.subject]=(totals[item.subject]??0)+item.seconds;return totals;},{})},sessions:view.sessions,mockExams:view.scores,scores:view.scores,wrongAnswerDrills:view.wrongAnswerDrills,weeklyGoals:view.weeklyCapabilityGoals,dailyDrills:view.dailyDrills,resources:view.resources,academicInsights:view.plaire}; return out({studentId:student.arena_public_id,data:{sessions:view.sessions,scores:view.scores,wrongAnswerDrills:view.wrongAnswerDrills,weeklyCapabilityGoals:view.weeklyCapabilityGoals,dailyDrills:view.dailyDrills,resources:view.resources,plaire:view.plaire,plans:view.plans,calendarDays:view.calendarDays,trinity:view.trinity,access:view.access,arena},syncedAt:(await env.DB.prepare('SELECT updated_at FROM learning_state WHERE user_id=?').bind(student.id).first<{updated_at:string}>())?.updated_at,teacherView});
    }
    if(match[2]==='feedback'&&method==='GET'){
      const rows=await env.DB.prepare('SELECT f.*,a.username AS teacher_name,a.collaboration_role AS teacher_role FROM teacher_feedback f JOIN support_accounts a ON a.id=f.teacher_id WHERE f.student_user_id=? ORDER BY f.created_at DESC LIMIT 100').bind(student.id).all<Record<string,unknown>>(); return out({feedback:rows.results.filter(row=>assignment.role==='academic_manager'||assignment.role==='admin'||assignment.role==='parent'||row.subject===assignment.subject||readSignal(row.signal_json)?.subject===assignment.subject).map(feedbackRow)});
    }
    if(match[2]==='feedback'&&method==='POST'){
      if(!allowed(assignment,'createFeedback')||assignment.role==='parent')return out({error:'Feedback permission required'},403); const body=await h.boundedJson<Record<string,unknown>>(request),type=assignment.role==='academic_manager'||assignment.role==='admin'?'academic_management':'subject',now=new Date().toISOString(),id=h.randomHex(16),context=feedbackContext(body); let signal; try { signal=newSignal(body.signal,assignment.role,assignment.subject); } catch { return out({error:'Invalid signal'},400); } if(signal&&data){const view=outData(data,assignment);const available=new Set([...view.wrongAnswerDrills.map(item=>'wrong_answer:'+item.id),...view.scores.map(item=>'mock_exam:'+item.id),...view.weeklyCapabilityGoals.map(item=>'weekly_goal:'+item.id),...view.dailyDrills.map(item=>'drill:'+item.id),'subject_progress:'+signal.subject]);if(signal.evidenceRefs.some(ref=>!available.has(ref)))return out({error:'Evidence is not available to this assignment'},400);} else if(signal?.evidenceRefs.length)return out({error:'Evidence requires synced learning data'},400); await env.DB.prepare('INSERT INTO teacher_feedback(id,student_id,student_user_id,teacher_id,type,subject,title,categories_json,status,progress,bottleneck,observation,action,success_criterion,comment,context_type,context_target_id,created_at,updated_at,signal_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,student.arena_public_id,student.id,account.id,type,type==='subject'?assignment.subject:null,clean(body.title,160),JSON.stringify(asArray(body.categories)),['needs_improvement','normal','stable'].includes(String(body.status))?String(body.status):'normal','active',clean(body.bottleneck),clean(body.observation,2000),clean(body.action,1200),clean(body.successCriterion,1200),clean(body.comment,2000),context.type,context.targetId,now,now,signal?JSON.stringify(signal):null).run(); return out({ok:true,id},201);
    }
    return out({error:'Not found'},404);
  } catch(error) { const status=typeof error==='object'&&error&&'status' in error?Number((error as {status:number}).status):503; return out({error:status===413?'요청 본문이 너무 큽니다.':'요청 처리 중 오류가 발생했습니다.'},status); }
}
