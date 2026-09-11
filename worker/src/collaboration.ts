import type { AppData } from '../../src/types';

type Env = { DB: D1Database };
type Account = { id: string; username: string; role: string };
type Helpers = { json: (body: unknown, status?: number, origin?: string) => Response; randomHex: (size?: number) => string };
type Permission = 'viewSessions'|'viewScores'|'viewWrongAnswers'|'viewMockExams'|'viewCalendar'|'viewWeeklyGoals'|'viewDrills'|'viewPlaire'|'viewAcademicInsights'|'createFeedback';
type Assignment = { id:string; student_id:string; teacher_id:string; role:'subject_teacher'|'academic_manager'; subject:string|null; permissions_json:string; created_at:string };

const STUDENT_ID = 'student-1';
const clean = (value: unknown, max = 1200) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const asArray = (value: unknown, max = 8) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map(item => clean(item,80)).filter(Boolean).slice(0,max) : [];
const permissions = (value: string): Record<Permission, boolean> => { try { return JSON.parse(value) as Record<Permission, boolean>; } catch { return {} as Record<Permission, boolean>; } };
const allowed = (assignment: Assignment, permission: Permission) => assignment.role === 'academic_manager' || permissions(assignment.permissions_json)[permission] === true;
const outData = (data: AppData, subject?: string | null, manager = false) => {
  const isSubject = <T extends { subject?: string }>(item: T) => manager || !subject || item.subject === subject;
  const sessions = (data.sessions ?? []).filter(isSubject).slice(-80).map(({id,subject,date,seconds})=>({id,subject,date,seconds}));
  const scores = (data.scores ?? []).map(score => ({ id:score.id,date:score.date,name:score.name,subject:score.subject,score:subject === '수학' ? score.math : subject === '국어' ? score.korean : subject === '영어' ? score.english : score.reviews?.[subject as keyof typeof score.reviews]?.score })).filter(score => manager || score.subject === subject || score.score !== undefined).slice(-20);
  const plans = Object.values(data.calendar ?? {}).flatMap(day => (day.plans ?? []).filter(isSubject).map(plan => ({date:day.date,subject:plan.subject,title:plan.title,done:plan.done}))).slice(-100);
  return {
    sessions, scores, plans,
    wrongAnswerDrills:(data.wrongAnswerDrills ?? []).filter(isSubject).slice(-30).map(({id,date,subject,source,question,bottleneck,correction})=>({id,date,subject,source,question,bottleneck,correction})),
    weeklyCapabilityGoals:(data.weeklyCapabilityGoals ?? []).filter(isSubject).slice(-30),
    dailyDrills:(data.dailyDrills ?? []).filter(isSubject).slice(-40),
    plaire:manager ? Object.values(data.plaire ?? {}).slice(-7).map(({date,bottleneck,nextAction})=>({date,bottleneck,nextAction})) : [],
  };
};
const summary = (data: AppData) => {
  const week = new Date(); week.setDate(week.getDate() - 7); const since = week.toISOString().slice(0,10);
  const sessions = (data.sessions ?? []).filter(item => item.date >= since);
  const bySubject = sessions.reduce<Record<string, number>>((result,item)=>({ ...result, [item.subject]: (result[item.subject] ?? 0) + item.seconds }),{});
  const plans = Object.values(data.calendar ?? {}).flatMap(day => day.plans ?? []);
  const done = plans.filter(item=>item.done).length;
  const drills = (data.dailyDrills ?? []).filter(item=>item.date >= since);
  return { totalSeconds:sessions.reduce((total,item)=>total+item.seconds,0), bySubject, executionRate:plans.length ? Math.round(done/plans.length*100) : 0, drills:{done:drills.filter(item=>item.done).length,total:drills.length}, unfinishedPlans:plans.length-done, recentScores:(data.scores??[]).slice(-6).map(item=>({date:item.date,name:item.name,korean:item.korean,math:item.math,english:item.english})), recentBottlenecks:[...new Set((data.wrongAnswerDrills??[]).map(item=>item.bottleneck).filter(Boolean))].slice(0,5) };
};
function buildTeacherStudentView(data: AppData, assignment: Assignment) {
  const manager = assignment.role === 'academic_manager';
  const p = permissions(assignment.permissions_json);
  const projection = outData(data, assignment.subject, manager);
  if (!manager) {
    if (!p.viewSessions) projection.sessions=[];
    if (!p.viewScores || !p.viewMockExams) projection.scores=[];
    if (!p.viewWrongAnswers) projection.wrongAnswerDrills=[];
    if (!p.viewCalendar) projection.plans=[];
    if (!p.viewWeeklyGoals) projection.weeklyCapabilityGoals=[];
    if (!p.viewDrills) projection.dailyDrills=[];
  }
  // Plaire is always restricted: only an explicitly permitted, academic-only
  // subset is exposed. Journals, Notion, auth, AI chat, and free text never leave here.
  if (!p.viewPlaire && !p.viewAcademicInsights) projection.plaire=[];
  return {
    student:{id:STUDENT_ID,displayName:'학생'},
    progress:{weeklyStudyMinutes:Math.round(projection.sessions.reduce((total,item)=>total+item.seconds,0)/60),executionRate:summary(data).executionRate,subjectProgress:summary(data).bySubject},
    sessions:projection.sessions,mockExams:projection.scores,scores:projection.scores,wrongAnswerDrills:projection.wrongAnswerDrills,
    weeklyGoals:projection.weeklyCapabilityGoals,dailyDrills:projection.dailyDrills,resources:(data.resources??[]).filter(item=>manager||item.subject===assignment.subject).map(({id,subject,name,total,done})=>({id,subject,name,total,done})),academicInsights:projection.plaire,
  };
}
async function state(env: Env) { const row = await env.DB.prepare('SELECT payload FROM learning_state WHERE id=1').first<{payload:string}>(); return row ? JSON.parse(row.payload) as AppData : null; }
async function assignmentFor(env: Env, account: Account, studentId: string, role?: Assignment['role']) { if (studentId !== STUDENT_ID) return null; const sql = role ? 'SELECT * FROM student_teacher_assignments WHERE teacher_id=? AND student_id=? AND role=?' : 'SELECT * FROM student_teacher_assignments WHERE teacher_id=? AND student_id=?'; return env.DB.prepare(sql).bind(account.id,studentId,...(role?[role]:[])).first<Assignment>(); }
const feedbackRow = (row: Record<string, unknown>) => ({ ...row, categories: (()=>{ try{return JSON.parse(String(row.categories_json ?? '[]'));}catch{return[];} })(), acknowledgedByStudent:Boolean(row.acknowledged_at) });
const feedbackContext = (body: Record<string, unknown>) => ({
  type: ['general','mock_exam','wrong_answer','weekly_goal','subject_progress'].includes(String(body.contextType)) ? String(body.contextType) : 'general',
  targetId: clean(body.contextTargetId,100) || null,
});

export async function collaboration(request: Request, env: Env, owner: boolean, account: Account | null, origin: string, h: Helpers): Promise<Response | null> {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  if (!path.startsWith('/api/collab/')) return null;
  const out = (body: unknown, status = 200) => h.json(body,status,origin);
  try {
    if (!owner && !account) return out({error:'Unauthorized'},401);
    if (path === '/api/collab/student/feedback' && method === 'GET') {
      if (!owner) return out({error:'Student session required'},403);
      const rows = await env.DB.prepare("SELECT f.*,a.username AS teacher_name,a.collaboration_role AS teacher_role FROM teacher_feedback f JOIN support_accounts a ON a.id=f.teacher_id WHERE f.student_id=? ORDER BY CASE f.progress WHEN 'active' THEN 0 ELSE 1 END, f.created_at DESC LIMIT 100").bind(STUDENT_ID).all<Record<string,unknown>>();
      return out({feedback:rows.results.map(feedbackRow)});
    }
    if (path.match(/^\/api\/collab\/student\/feedback\/[^/]+\/(acknowledge|apply)$/) && method === 'POST') {
      if (!owner) return out({error:'Student session required'},403);
      const [,id,operation] = path.match(/^\/api\/collab\/student\/feedback\/([^/]+)\/(acknowledge|apply)$/)!;
      const feedback = await env.DB.prepare('SELECT * FROM teacher_feedback WHERE id=? AND student_id=?').bind(id,STUDENT_ID).first<Record<string,unknown>>(); if (!feedback) return out({error:'Feedback not found'},404);
      const now = new Date().toISOString();
      if (operation === 'acknowledge') await env.DB.prepare('UPDATE teacher_feedback SET acknowledged_at=?,updated_at=? WHERE id=?').bind(now,now,id).run();
      else { const body = await request.json<{target?:string; linkedId?:string}>(); const column = body.target === 'weekly_goal' ? 'linked_weekly_goal_id' : body.target === 'daily_drill' ? 'linked_daily_drill_id' : ''; if (!column || !clean(body.linkedId,100)) return out({error:'Invalid feedback link'},400); await env.DB.prepare(`UPDATE teacher_feedback SET ${column}=?, acknowledged_at=COALESCE(acknowledged_at,?), updated_at=? WHERE id=?`).bind(clean(body.linkedId,100),now,now,id).run(); }
      return out({ok:true});
    }
    if (!account && !owner) return out({error:'Teacher session required'},403);
    if (path === '/api/collab/assignments' && method === 'GET') {
      if (!owner && account?.role !== 'admin') return out({error:'Admin required'},403);
      const assignments = await env.DB.prepare('SELECT x.*,a.username teacher_name,a.collaboration_role teacher_role FROM student_teacher_assignments x JOIN support_accounts a ON a.id=x.teacher_id ORDER BY x.created_at DESC').all(); return out({assignments:assignments.results});
    }
    if (path === '/api/collab/assignments' && method === 'POST') {
      if (!owner && account?.role !== 'admin') return out({error:'Admin required'},403);
      const body = await request.json<{teacherId?:string;role?:string;subject?:string;permissions?:Record<Permission,boolean>}>(); const role = body.role === 'academic_manager' ? 'academic_manager' : body.role === 'subject_teacher' ? 'subject_teacher' : null; const subject=clean(body.subject,30);
      if (!role || !clean(body.teacherId,100) || role === 'subject_teacher' && !subject) return out({error:'Teacher, role, and subject are required'},400);
      const teacher = await env.DB.prepare("SELECT id FROM support_accounts WHERE id=? AND active=1 AND collaboration_role IN ('subject_teacher','academic_manager')").bind(clean(body.teacherId,100)).first(); if (!teacher) return out({error:'Teacher account not found'},404);
      const id=h.randomHex(16); await env.DB.prepare('INSERT INTO student_teacher_assignments(id,student_id,teacher_id,role,subject,permissions_json,created_at) VALUES(?,?,?,?,?,?,?)').bind(id,STUDENT_ID,clean(body.teacherId,100),role,role==='subject_teacher'?subject:null,JSON.stringify(body.permissions ?? {}),new Date().toISOString()).run(); return out({ok:true,id},201);
    }
    if (path === '/api/collab/dashboard' && method === 'GET') {
      if (!account) return out({error:'Teacher session required'},403);
      const role = account.role === 'academic_manager' ? 'academic_manager' : 'subject_teacher'; const assignments = await env.DB.prepare('SELECT * FROM student_teacher_assignments WHERE teacher_id=? AND role=?').bind(account.id,role).all<Assignment>(); const data=await state(env);
      return out({studentId:STUDENT_ID,assignments:assignments.results.map(item=>({...item,permissions:permissions(item.permissions_json)})), summary:data?summary(data):null});
    }
    if (!account) return out({error:'Teacher session required'},403);
    const edit = path.match(/^\/api\/collab\/feedback\/([^/]+)$/);
    if (edit && method === 'PATCH') {
      const previous = await env.DB.prepare('SELECT * FROM teacher_feedback WHERE id=? AND teacher_id=?').bind(edit[1],account.id).first<Record<string,unknown>>();
      if (!previous) return out({error:'Only the author can edit this feedback'},403);
      const body=await request.json<Record<string,unknown>>(), now=new Date().toISOString();
      await env.DB.prepare('INSERT INTO teacher_feedback_audit(id,feedback_id,editor_id,snapshot_json,edited_at) VALUES(?,?,?,?,?)').bind(h.randomHex(16),edit[1],account.id,JSON.stringify(previous),now).run();
      const status=['needs_improvement','normal','stable'].includes(String(body.status))?String(body.status):String(previous.status);
      const progress=['active','achieved','replaced','archived'].includes(String(body.progress))?String(body.progress):String(previous.progress);
      const context=feedbackContext(body);
      await env.DB.prepare('UPDATE teacher_feedback SET title=?,categories_json=?,status=?,progress=?,bottleneck=?,observation=?,action=?,success_criterion=?,comment=?,context_type=?,context_target_id=?,updated_at=? WHERE id=?').bind(clean(body.title,160),JSON.stringify(asArray(body.categories)),status,progress,clean(body.bottleneck),clean(body.observation,2000),clean(body.action,1200),clean(body.successCriterion,1200),clean(body.comment,2000),context.type,context.targetId,now,edit[1]).run();
      return out({ok:true,updatedAt:now});
    }
    const match = path.match(/^\/api\/collab\/students\/([^/]+)(?:\/(data|feedback))?$/); if (!match) return out({error:'Not found'},404);
    const studentId=match[1], section=match[2]; const subjectAssignment=await assignmentFor(env,account,studentId,'subject_teacher'); const managerAssignment=await assignmentFor(env,account,studentId,'academic_manager'); const assignment=managerAssignment ?? subjectAssignment;
    if (!assignment) return out({error:'No assignment for this student'},403);
    if (!section && method === 'GET') return out({studentId,assignment:{role:assignment.role,subject:assignment.subject,permissions:permissions(assignment.permissions_json)},summary:(await state(env))?summary((await state(env))!):null});
    if (section === 'data' && method === 'GET') { const data=await state(env); if (!data) return out({studentId,data:null,teacherView:null}); const teacherView=buildTeacherStudentView(data,assignment); return out({studentId,data:{sessions:teacherView.sessions,scores:teacherView.scores,wrongAnswerDrills:teacherView.wrongAnswerDrills,weeklyCapabilityGoals:teacherView.weeklyGoals,dailyDrills:teacherView.dailyDrills,resources:teacherView.resources,plaire:teacherView.academicInsights},teacherView}); }
    if (section === 'feedback' && method === 'GET') { const rows=await env.DB.prepare('SELECT f.*,a.username AS teacher_name,a.collaboration_role AS teacher_role FROM teacher_feedback f JOIN support_accounts a ON a.id=f.teacher_id WHERE f.student_id=? AND (f.type=? OR ?=1) ORDER BY f.created_at DESC LIMIT 100').bind(studentId,assignment.role==='academic_manager'?'academic_management':'subject',assignment.role==='academic_manager'?1:0).all<Record<string,unknown>>(); return out({feedback:rows.results.filter(row=>assignment.role==='academic_manager'||row.subject===assignment.subject).map(feedbackRow)}); }
    if (section === 'feedback' && method === 'POST') { if (!allowed(assignment,'createFeedback')) return out({error:'Feedback permission required'},403); const body=await request.json<Record<string,unknown>>(); const type=assignment.role==='academic_manager'?'academic_management':'subject', now=new Date().toISOString(), id=h.randomHex(16); const status=['needs_improvement','normal','stable'].includes(String(body.status))?String(body.status):'normal'; const subject=type==='subject'?assignment.subject:null; const context=feedbackContext(body); await env.DB.prepare('INSERT INTO teacher_feedback(id,student_id,teacher_id,type,subject,title,categories_json,status,progress,bottleneck,observation,action,success_criterion,comment,context_type,context_target_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,studentId,account.id,type,subject,clean(body.title,160),JSON.stringify(asArray(body.categories)),status,'active',clean(body.bottleneck),clean(body.observation,2000),clean(body.action,1200),clean(body.successCriterion,1200),clean(body.comment,2000),context.type,context.targetId,now,now).run(); return out({ok:true,id},201); }
    return out({error:'Not found'},404);
  } catch (error) { return out({error:'Collaboration request failed'},503); }
}
