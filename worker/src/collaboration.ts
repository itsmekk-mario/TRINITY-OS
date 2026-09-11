import type { AppData } from '../../src/types';

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

const summary = (data: AppData) => {
  const week = new Date(); week.setDate(week.getDate() - 7); const since = week.toISOString().slice(0,10);
  const sessions = (data.sessions ?? []).filter(item => item.date >= since);
  const bySubject = sessions.reduce<Record<string, number>>((result,item)=>({ ...result, [item.subject]: (result[item.subject] ?? 0) + item.seconds }),{});
  const plans = Object.values(data.calendar ?? {}).flatMap(day => day.plans ?? []); const done = plans.filter(item=>item.done).length;
  const drills = (data.dailyDrills ?? []).filter(item=>item.date >= since);
  return { totalSeconds:sessions.reduce((total,item)=>total+item.seconds,0), bySubject, executionRate:plans.length ? Math.round(done/plans.length*100) : 0, drills:{done:drills.filter(item=>item.done).length,total:drills.length}, unfinishedPlans:plans.length-done, recentScores:(data.scores??[]).slice(-6).map(item=>({date:item.date,name:item.name,korean:item.korean,math:item.math,english:item.english})), recentBottlenecks:[...new Set((data.wrongAnswerDrills??[]).map(item=>item.bottleneck).filter(Boolean))].slice(0,5) };
};

const outData = (data: AppData, assignment: Assignment) => {
  const manager = assignment.role === 'academic_manager' || assignment.role === 'admin';
  const parent = assignment.role === 'parent';
  const subject = assignment.subject;
  const p = permissions(assignment.permissions_json);
  const isSubject = <T extends { subject?: string }>(item: T) => manager || parent || !subject || item.subject === subject;
  const sessions = allowed(assignment,'viewSessions') ? (data.sessions??[]).filter(isSubject).slice(-80).map(({id,subject,date,seconds})=>({id,subject,date,seconds})) : [];
  const scores = allowed(assignment,'viewScores') ? (data.scores??[]).map(score=>parent
    ? {id:score.id,date:score.date,name:score.name,korean:score.korean,math:score.math,english:score.english}
    : {id:score.id,date:score.date,name:score.name,subject:score.subject,score:subject==='수학'?score.math:subject==='국어'?score.korean:subject==='영어'?score.english:undefined})
    .filter(score=>manager||parent||score.subject===subject||score.score!==undefined).slice(-20) : [];
  const plans = allowed(assignment,'viewCalendar') ? Object.values(data.calendar??{}).flatMap(day=>(day.plans??[]).filter(isSubject).map(plan=>({date:day.date,subject:plan.subject,title:plan.title,done:plan.done}))).slice(-100) : [];
  const wrongAnswerDrills = allowed(assignment,'viewWrongAnswers') && !parent ? (data.wrongAnswerDrills??[]).filter(isSubject).slice(-30).map(({id,date,subject,source,question,bottleneck,correction})=>({id,date,subject,source,question,bottleneck,correction})) : [];
  const weeklyCapabilityGoals = allowed(assignment,'viewWeeklyGoals') ? (data.weeklyCapabilityGoals??[]).filter(isSubject).slice(-30).map(({id,weekStart,subject,ability,successCriterion,done})=>({id,weekStart,subject,ability,successCriterion:parent?undefined:successCriterion,done})) : [];
  const dailyDrills = allowed(assignment,'viewDrills') ? (data.dailyDrills??[]).filter(isSubject).slice(-40).map(({id,date,subject,title,done,minutes})=>({id,date,subject,title,done,minutes})) : [];
  const resources = (data.resources??[]).filter(isSubject).map(({id,subject,name,total,done})=>({id,subject,name,total,done}));
  const plaire = !parent && (p.viewPlaire || p.viewAcademicInsights || manager) ? Object.values(data.plaire??{}).slice(-7).map(({date,bottleneck,nextAction})=>({date,bottleneck,nextAction})) : [];
  return { sessions,scores,plans,wrongAnswerDrills,weeklyCapabilityGoals,dailyDrills,resources,plaire };
};

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
const feedbackRow = (row: Record<string, unknown>) => ({ ...row, categories: (()=>{ try{return JSON.parse(String(row.categories_json ?? '[]'));}catch{return[];} })(), acknowledgedByStudent:Boolean(row.acknowledged_at) });
const feedbackContext = (body: Record<string, unknown>) => ({ type: ['general','mock_exam','wrong_answer','drill','weekly_goal','subject_progress','statistics','resource','weekly_plan'].includes(String(body.contextType)) ? String(body.contextType) : 'general', targetId: clean(body.contextTargetId,100) || null });

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
      const sql=account.role==='admin' ? `SELECT 'admin-'||u.id id,u.id student_user_id,? support_account_id,'admin' role,NULL subject,'{}' permissions_json,'' created_at,u.arena_public_id student_id,u.username student_name FROM users u WHERE u.active=1` : `SELECT x.*,u.arena_public_id student_id,u.username student_name FROM student_support_assignments x JOIN users u ON u.id=x.student_user_id WHERE x.support_account_id=? AND x.role=? AND u.active=1`;
      const assignments=await env.DB.prepare(sql).bind(account.id,...(account.role==='admin'?[]:[account.role])).all(); return out({assignments:assignments.results.map((item:any)=>({...item,permissions:permissions(item.permissions_json)}))});
    }
    const edit=path.match(/^\/api\/collab\/feedback\/([^/]+)$/);
    if(edit&&method==='PATCH'){
      const previous=await env.DB.prepare('SELECT * FROM teacher_feedback WHERE id=? AND teacher_id=?').bind(edit[1],account.id).first<Record<string,unknown>>(); if(!previous)return out({error:'Only the author can edit this feedback'},403);
      const body=await h.boundedJson<Record<string,unknown>>(request),now=new Date().toISOString(),context=feedbackContext(body); await env.DB.prepare('INSERT INTO teacher_feedback_audit(id,feedback_id,editor_id,snapshot_json,edited_at) VALUES(?,?,?,?,?)').bind(h.randomHex(16),edit[1],account.id,JSON.stringify(previous),now).run(); await env.DB.prepare('UPDATE teacher_feedback SET title=?,categories_json=?,status=?,progress=?,bottleneck=?,observation=?,action=?,success_criterion=?,comment=?,context_type=?,context_target_id=?,updated_at=? WHERE id=? AND teacher_id=?').bind(clean(body.title,160),JSON.stringify(asArray(body.categories)),['needs_improvement','normal','stable'].includes(String(body.status))?String(body.status):String(previous.status),['active','achieved','replaced','archived'].includes(String(body.progress))?String(body.progress):String(previous.progress),clean(body.bottleneck),clean(body.observation,2000),clean(body.action,1200),clean(body.successCriterion,1200),clean(body.comment,2000),context.type,context.targetId,now,edit[1],account.id).run(); return out({ok:true,updatedAt:now});
    }
    const match=path.match(/^\/api\/collab\/students\/([^/]+)(?:\/(data|feedback))?$/); if(!match)return out({error:'Not found'},404);
    const access=await assignmentFor(env,account,match[1]); if(!access)return out({error:'No assignment for this student'},403); const {assignment,student}=access; const data=await state(env,student.id);
    if(!match[2]&&method==='GET')return out({studentId:student.arena_public_id,assignment:{role:assignment.role,subject:assignment.subject,permissions:permissions(assignment.permissions_json)},summary:data?summary(data):null});
    if(match[2]==='data'&&method==='GET'){
      if(!data)return out({studentId:student.arena_public_id,data:null,teacherView:null}); const view=outData(data,assignment); const teacherView={student:{id:student.arena_public_id,displayName:student.username},progress:{weeklyStudyMinutes:Math.round(view.sessions.reduce((total,item)=>total+item.seconds,0)/60),executionRate:summary(data).executionRate,subjectProgress:summary(data).bySubject},sessions:view.sessions,mockExams:view.scores,scores:view.scores,wrongAnswerDrills:view.wrongAnswerDrills,weeklyGoals:view.weeklyCapabilityGoals,dailyDrills:view.dailyDrills,resources:view.resources,academicInsights:view.plaire}; return out({studentId:student.arena_public_id,data:{sessions:view.sessions,scores:view.scores,wrongAnswerDrills:view.wrongAnswerDrills,weeklyCapabilityGoals:view.weeklyCapabilityGoals,dailyDrills:view.dailyDrills,resources:view.resources,plaire:view.plaire},teacherView});
    }
    if(match[2]==='feedback'&&method==='GET'){
      const rows=await env.DB.prepare('SELECT f.*,a.username AS teacher_name,a.collaboration_role AS teacher_role FROM teacher_feedback f JOIN support_accounts a ON a.id=f.teacher_id WHERE f.student_user_id=? ORDER BY f.created_at DESC LIMIT 100').bind(student.id).all<Record<string,unknown>>(); return out({feedback:rows.results.filter(row=>assignment.role==='academic_manager'||assignment.role==='admin'||assignment.role==='parent'||row.subject===assignment.subject).map(feedbackRow)});
    }
    if(match[2]==='feedback'&&method==='POST'){
      if(!allowed(assignment,'createFeedback')||assignment.role==='parent')return out({error:'Feedback permission required'},403); const body=await h.boundedJson<Record<string,unknown>>(request),type=assignment.role==='academic_manager'||assignment.role==='admin'?'academic_management':'subject',now=new Date().toISOString(),id=h.randomHex(16),context=feedbackContext(body); await env.DB.prepare('INSERT INTO teacher_feedback(id,student_id,student_user_id,teacher_id,type,subject,title,categories_json,status,progress,bottleneck,observation,action,success_criterion,comment,context_type,context_target_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,student.arena_public_id,student.id,account.id,type,type==='subject'?assignment.subject:null,clean(body.title,160),JSON.stringify(asArray(body.categories)),['needs_improvement','normal','stable'].includes(String(body.status))?String(body.status):'normal','active',clean(body.bottleneck),clean(body.observation,2000),clean(body.action,1200),clean(body.successCriterion,1200),clean(body.comment,2000),context.type,context.targetId,now,now).run(); return out({ok:true,id},201);
    }
    return out({error:'Not found'},404);
  } catch(error) { const status=typeof error==='object'&&error&&'status' in error?Number((error as {status:number}).status):503; return out({error:status===413?'요청 본문이 너무 큽니다.':'요청 처리 중 오류가 발생했습니다.'},status); }
}
