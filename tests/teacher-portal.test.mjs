import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,next){try{return next(specifier,context);}catch(error){if(specifier.startsWith('./')||specifier.startsWith('../'))return next(specifier+'.ts',context);throw error;}}});
const { collaboration, outData }=await import('../worker/src/collaboration.ts');
const { mathAnalytics, learningAnalytics, subjectScore }=await import('../src/lib/teacherAnalytics.ts');
const { makeDailyDrill, makeWeeklyGoal }=await import('../src/lib/feedbackDrafts.ts');
const range={start:'2026-09-08',end:'2026-09-14'};
const empty=()=>({calendar:{},sessions:[],scores:[],resources:[],weeklyCapabilityGoals:[],dailyDrills:[],wrongAnswerDrills:[],trinity:[],plaire:{}});
function harness(){
 const db=new DatabaseSync(':memory:');
 db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,password_hash TEXT,salt TEXT,is_admin INTEGER DEFAULT 0,must_change_password INTEGER DEFAULT 0,password_changed_at TEXT,created_at TEXT); CREATE TABLE api_tokens(token_hash TEXT,user_id INTEGER,label TEXT,created_at TEXT,revoked_at TEXT); CREATE TABLE learning_state(user_id INTEGER PRIMARY KEY,payload TEXT,updated_at TEXT); INSERT INTO users(id,username,created_at) VALUES(1,'student-a','2026-09-01'),(2,'student-b','2026-09-01')");
 for(const name of ['0001_support_portal.sql','0002_feedback_collaboration.sql','0003_feedback_context.sql','0008_security_hardening.sql','0010_teacher_signals.sql','0016_feedback_soft_delete.sql'])db.exec(readFileSync(new URL('../worker/migrations/'+name,import.meta.url),'utf8'));
 const student=db.prepare('SELECT arena_public_id FROM users WHERE id=1').get().arena_public_id;
 const add=(id,role,subject,permissions)=>{db.prepare('INSERT INTO support_accounts(id,username,role,collaboration_role,password_hash,salt,created_at) VALUES(?,?,?,?,?,?,?)').run(id,id,role==='subject_teacher'?'tutor':'parent',role,'x','x','x');db.prepare('INSERT INTO student_support_assignments VALUES(?,?,?,?,?,?,?)').run(id+'-as',1,id,role,subject,JSON.stringify(permissions),'x');return {id,username:id,role};};
 const teacher=add('math','subject_teacher','수학',{createFeedback:true,viewSessions:true,viewScores:true,viewCalendar:true,viewWrongAnswers:true,viewWeeklyGoals:true,viewDrills:true});
 const manager=add('manager','academic_manager',null,{});
 const english=add('english','subject_teacher','영어',{createFeedback:true});
 const parent=add('parent','parent',null,{viewSessions:true,viewScores:true});
 const data={...empty(),sessions:[{id:'ms',subject:'수학',date:'2026-09-13',seconds:3600,note:'PRIVATE'},{id:'es',subject:'영어',date:'2026-09-13',seconds:7200,note:'PRIVATE'}],scores:[{id:'score',subject:'국어',date:'2026-09-13',name:'mock',math:84,korean:91,english:88,overallReview:'PRIVATE',reviews:{국어:{observation:'PRIVATE'},수학:{duration:70,score:85}}}],wrongAnswerDrills:[{id:'w',subject:'수학',date:'2026-09-13',question:'21',source:'mock',scoreId:'score',wrongJudgment:'necessary only',missedCue:'sign',correction:'check',transfer:'apply',bottleneck:'전략·판단',retries:[{id:'3d',label:'retry',dueDate:'2026-09-14'}]},{id:'ew',subject:'영어',date:'2026-09-13',question:'PRIVATE',source:'PRIVATE',bottleneck:'기타'}],calendar:{'2026-09-13':{date:'2026-09-13',reflection:'PRIVATE',plans:[{id:'p',subject:'수학',title:'math',quantity:'20분',done:false},{id:'ep',subject:'영어',title:'PRIVATE',done:false}]}},plaire:{'2026-09-13':{date:'2026-09-13',record:'PRIVATE',bottleneck:'PRIVATE',nextAction:'PRIVATE'}}};
 db.prepare('INSERT INTO learning_state VALUES(1,?,?)').run(JSON.stringify(data),'2026-09-14T00:00:00Z');
 const wrap=(stmt,args=[])=>({bind:(...values)=>wrap(stmt,values),first:async()=>stmt.get(...args)??null,run:async()=>stmt.run(...args),all:async()=>({results:stmt.all(...args)})});
 const env={DB:{prepare:sql=>wrap(db.prepare(sql)),batch:async statements=>{db.exec('BEGIN');try{const result=[];for(const stmt of statements)result.push(await stmt.run());db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}}};
 const helpers={json:(value,status=200)=>new Response(JSON.stringify(value),{status}),randomHex:()=>crypto.randomUUID(),boundedJson:async request=>request.json()};
 const call=(actor,suffix,method='GET',body)=>collaboration(new Request('https://test/api/collab/'+suffix,{method,...(body?{body:JSON.stringify(body)}:{})}),env,false,actor,'https://test',helpers);
 return {db,data,student,teacher,manager,english,parent,call};
}
test('A/B/D: diagnosis → manager → confirmed intervention draft → student → teacher review, without raw writes',async()=>{
 const h=harness(),before=h.db.prepare('SELECT payload FROM learning_state WHERE user_id=1').get().payload;
 const created=await h.call(h.teacher,'students/'+h.student+'/feedback','POST',{title:'조건 검증 누락',observation:'동일 오류 반복',bottleneck:'필요조건만 검증',action:'20분 × 3회',successCriterion:'누락 1회 이하',contextType:'wrong_answer',contextTargetId:'w',signal:{sourceRole:'academic_manager',subject:'영어',priority:'high',evidenceRefs:['wrong_answer:w']}});
 assert.equal(created.status,201);const {id}=await created.json();
 const notes=await (await h.call(h.manager,'students/'+h.student+'/feedback')).json();
 assert.equal(notes.feedback[0].signal.sourceRole,'subject_teacher');assert.equal(notes.feedback[0].signal.subject,'수학');assert.equal(notes.feedback[0].signal.targetRole,'academic_manager');
 const patch='students/'+h.student+'/signals/'+id;
 assert.equal((await h.call(h.english,patch,'PATCH',{status:'accepted'})).status,403);
 assert.equal((await h.call(h.teacher,patch,'PATCH',{status:'accepted'})).status,403);
 assert.equal((await h.call(h.parent,patch,'PATCH',{status:'accepted'})).status,403);
 assert.equal((await h.call(h.manager,patch,'PATCH',{dailyDrill:{date:'2026-09-14',title:'검증',minutes:-1}})).status,400);
 assert.equal((await h.call(h.manager,patch,'PATCH',{weeklyGoal:{weekStart:'2026-09-14',subject:'영어',ability:'조건 검증',drillDesign:'3회',evidence:'오답',successCriterion:'0회'}})).status,200);
 assert.equal((await h.call(h.manager,patch,'PATCH',{dailyDrill:{date:'2026-09-14',subject:'영어',title:'검증',action:'조건 확인',minutes:20,successCriterion:'0회'}})).status,200);
 const applied=await (await h.call(h.teacher,'students/'+h.student+'/feedback')).json();
 const goal=makeWeeklyGoal(applied.feedback[0]),drill=makeDailyDrill(applied.feedback[0]);
 assert.equal(goal.subject,'수학');assert.equal(goal.ability,'조건 검증');assert.equal(drill.minutes,20);assert.equal(drill.feedbackId,id);
 assert.equal(h.db.prepare('SELECT payload FROM learning_state WHERE user_id=1').get().payload,before);
 assert.equal(h.db.prepare('SELECT count(*) n FROM teacher_feedback_audit').get().n,2);
 const studentResponse=await collaboration(new Request('https://test/api/collab/student/feedback'),{DB:{prepare:sql=>{const stmt=h.db.prepare(sql);return {bind:(...args)=>({all:async()=>({results:stmt.all(...args)})})};}}},false,null,'',{json:value=>Response.json(value)}, {id:1,is_admin:0});
 assert.equal((await studentResponse.json()).feedback[0].signal.status,'accepted');
});
test('C/D: manager reassessment requests are visible only to their target subject',async()=>{
 const h=harness();
 const response=await h.call(h.manager,'students/'+h.student+'/feedback','POST',{title:'수학 재진단',signal:{subject:'수학',type:'reassessment_request',priority:'high',evidenceRefs:['subject_progress:수학']}});
 assert.equal(response.status,201);
 const math=await(await h.call(h.teacher,'students/'+h.student+'/feedback')).json(),english=await(await h.call(h.english,'students/'+h.student+'/feedback')).json();
 assert.equal(math.feedback[0].signal.type,'reassessment_request');assert.equal(english.feedback.length,0);
 assert.equal((await h.call(h.teacher,'students/unassigned/data')).status,403);
});
test('server projection retains learning evidence, all manager scores, and protects other subjects/private fields',async()=>{
 const h=harness();
 const math=await(await h.call(h.teacher,'students/'+h.student+'/data')).json();
 assert.equal(math.data.scores[0].score,85);assert.equal(math.data.scores[0].subject,'수학');assert.equal(math.data.wrongAnswerDrills[0].wrongJudgment,'necessary only');assert.equal(math.data.plans[0].quantity,'20분');assert.equal(math.data.plaire.length,0);
 assert(!JSON.stringify(math).includes('PRIVATE'));assert(!JSON.stringify(math).includes('english'));
 const manager=await(await h.call(h.manager,'students/'+h.student+'/data')).json();assert.equal(manager.data.scores[0].math,85);assert.equal(manager.data.scores[0].korean,91);
 const parent=await(await h.call(h.parent,'students/'+h.student+'/data')).json();assert.equal(parent.data.wrongAnswerDrills.length,0);assert(!JSON.stringify(parent).includes('wrongJudgment'));
});
test('analytics use inclusive dates, exclude future records, keep projections immutable, and never fabricate missing metrics',()=>{
 const data={...empty(),plans:[]};const before=structuredClone(data);
 const math=mathAnalytics(data,'수학',range);assert.equal(math.average,undefined);assert.equal(math.repeated.length,0);
 const learning=learningAnalytics(data,range);assert.equal(learning.executionRate,undefined);assert(learning.subjects.every(item=>item.effort===undefined&&item.outcome===undefined));
 assert.deepEqual(data,before);
 data.scores=[{id:'future',date:'2026-09-15',name:'future',math:99},{id:'present',date:'2026-09-08',name:'mock',math:84}];
 assert.equal(mathAnalytics(data,'수학',range).average,84);assert.equal(subjectScore({subject:'영어',score:90},'수학'),undefined);
});
test('reassessment requires actual increased study time, completed drills and flat score comparison',()=>{
 const data={...empty(),plans:[],sessions:[{id:'p',date:'2026-09-06',subject:'수학',seconds:3600},{id:'c',date:'2026-09-13',subject:'수학',seconds:7200}],scores:[{id:'p',date:'2026-09-06',name:'a',math:82},{id:'c',date:'2026-09-13',name:'b',math:81}],dailyDrills:[{id:'d',date:'2026-09-13',subject:'수학',done:true}]};
 assert.equal(learningAnalytics(data,range).subjects.find(item=>item.subject==='수학').reassess,true);
 data.dailyDrills[0].done=false;assert.equal(learningAnalytics(data,range).subjects.find(item=>item.subject==='수학').reassess,false);
});

test('Signal creation rejects evidence outside the permitted subject or permission scope',async()=>{
 const h=harness();
 const path='students/'+h.student+'/feedback';
 assert.equal((await h.call(h.teacher,path,'POST',{title:'bad',signal:{evidenceRefs:['wrong_answer:ew']}})).status,400);
 assert.equal((await h.call(h.teacher,path,'POST',{title:'bad',signal:{evidenceRefs:['mock_exam:missing']}})).status,400);
 assert.equal(h.db.prepare('SELECT count(*) n FROM teacher_feedback').get().n,0);
});
test('revoked assignment blocks author edits as well as signal handling',async()=>{
 const h=harness();
 const response=await h.call(h.teacher,'students/'+h.student+'/feedback','POST',{title:'feedback'});
 const {id}=await response.json();
 h.db.prepare("DELETE FROM student_support_assignments WHERE support_account_id='math'").run();
 assert.equal((await h.call(h.teacher,'feedback/'+id,'PATCH',{title:'changed'})).status,403);
});
test('weekly goals overlapping the chosen interval remain visible',()=>{
 const data={...empty(),plans:[],weeklyCapabilityGoals:[{id:'g',subject:'수학',weekStart:'2026-09-07',ability:'조건',done:false}]};
 assert.equal(learningAnalytics(data,range).goals.length,1);
 assert.equal(mathAnalytics(data,'수학',range).goals.length,1);
});

test('subject teacher can propose confirmed goal/drill drafts with an open handoff',async()=>{
 const h=harness(),before=h.db.prepare('SELECT payload FROM learning_state WHERE user_id=1').get().payload;
 const response=await h.call(h.teacher,'students/'+h.student+'/feedback','POST',{title:'intervention',signal:{type:'intervention',weeklyGoal:{weekStart:'2026-09-14',subject:'영어',ability:'조건 검증',successCriterion:'누락 0회',drillDesign:'3회',evidence:'오답'},dailyDrill:{date:'2026-09-14',title:'검증 Drill',minutes:20},evidenceRefs:['wrong_answer:w']}});
 assert.equal(response.status,201);
 const notes=await(await h.call(h.manager,'students/'+h.student+'/feedback')).json();
 assert.equal(notes.feedback[0].signal.status,'open');assert.equal(notes.feedback[0].signal.type,'intervention');assert.equal(notes.feedback[0].signal.weeklyGoal.subject,'수학');assert.equal(notes.feedback[0].signal.dailyDrill.minutes,20);
 assert.equal(h.db.prepare('SELECT payload FROM learning_state WHERE user_id=1').get().payload,before);
});

test('legacy support data also respects the assigned subject and permission flags',async()=>{
 const h=harness();
 const {support}=await import('../worker/src/support.ts');
 const {createHash}=await import('node:crypto');
 const token='legacy-english';
 h.db.prepare('INSERT INTO support_sessions VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'),'english',new Date(Date.now()+86400000).toISOString());
 const response=await support(new Request('https://test/api/support/data',{headers:{Authorization:'Bearer '+token}}),{DB:{prepare:sql=>{const stmt=h.db.prepare(sql);return {bind:(...args)=>({first:async()=>stmt.get(...args)??null})};}}},false,'',{json:(value,status=200)=>Response.json(value,{status}),sha256:async value=>createHash('sha256').update(value).digest('hex')});
 assert.equal(response.status,200);const value=await response.json();
 assert.deepEqual(value.data.sessions,[]);assert.deepEqual(value.data.scores,[]);assert.deepEqual(value.data.wrong,[]);assert(!JSON.stringify(value).includes('necessary only'));
});

test('common teacher entry routes the authenticated role and rejects other roles',async()=>{
 const {teacherEntry}=await import('../src/lib/teacherEntry.ts');
 assert.equal(teacherEntry('academic_manager').portal,'manager');
 assert.equal(teacherEntry('academic_manager').key,'trinity-collab:academic_manager');
 assert.equal(teacherEntry('subject_teacher').portal,'teacher');
 assert.throws(()=>teacherEntry('parent'));
});
test('teacher ARENA projection is manager-only, student-scoped and omits private metadata',async()=>{
 const {teacherArena}=await import('../worker/src/collaboration.ts'); const h=harness();
 h.db.exec("CREATE TABLE arena_seasons(id TEXT,name TEXT); CREATE TABLE arena_score_snapshots(id TEXT,user_id INTEGER,season_id TEXT,week_start TEXT,score INTEGER,execution INTEGER,problem_solving INTEGER,consistency INTEGER,growth INTEGER,calculated_at TEXT,metrics TEXT); CREATE TABLE arena_achievements(id TEXT,user_id INTEGER,title TEXT,description TEXT,awarded_at TEXT); CREATE TABLE arena_groups(id TEXT,name TEXT,type TEXT,invite_code TEXT); CREATE TABLE arena_group_members(group_id TEXT,user_id INTEGER); INSERT INTO arena_seasons VALUES('s','Season'); INSERT INTO arena_score_snapshots VALUES('own',1,'s','2026-09-07',50,10,20,10,10,'2026-09-13','PRIVATE'),('other',2,'s','2026-09-07',99,30,30,30,9,'2026-09-13','PRIVATE'); INSERT INTO arena_groups VALUES('g','Group','custom','PRIVATE'); INSERT INTO arena_group_members VALUES('g',1)");
 const wrap=(stmt,args=[])=>({bind:(...v)=>wrap(stmt,v),all:async()=>({results:stmt.all(...args)})}); const env={DB:{prepare:sql=>wrap(h.db.prepare(sql))}};
 assert.equal(await teacherArena(env,1,'subject_teacher'),undefined);
 const view=await teacherArena(env,1,'academic_manager'); assert.equal(view.snapshots.length,1);assert.equal(view.snapshots[0].id,'own');assert.equal(view.groups[0].name,'Group');assert(!JSON.stringify(view).includes('PRIVATE'));h.db.close();
});
