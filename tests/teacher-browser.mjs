// Optional end-to-end verification: npm install --prefix .teacher-test-tools --no-save --package-lock=false playwright
// node --experimental-transform-types tests/teacher-browser.mjs
// Uses the actual Worker handler and an isolated SQLite fixture, never production data.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile, mkdir } from 'node:fs/promises';
import { createHash, pbkdf2Sync } from 'node:crypto';
import { createServer as httpServer } from 'node:http';
import { createServer as viteServer } from 'vite';
import { chromium } from '../.teacher-test-tools/node_modules/playwright/index.mjs';
import worker from '../worker/src/index.ts';
const hash=value=>createHash('sha256').update(value).digest('hex');
if(typeof crypto.subtle.timingSafeEqual!=='function')Object.defineProperty(crypto.subtle,'timingSafeEqual',{value:(a,b)=>Buffer.from(a).equals(Buffer.from(b))});
const db=new DatabaseSync(':memory:');
db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,password_hash TEXT,salt TEXT,is_admin INTEGER DEFAULT 0,must_change_password INTEGER DEFAULT 0,password_changed_at TEXT,created_at TEXT); CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER,expires_at TEXT,created_at TEXT); CREATE TABLE api_tokens(token_hash TEXT PRIMARY KEY,user_id INTEGER,label TEXT,created_at TEXT,revoked_at TEXT); CREATE TABLE learning_state(user_id INTEGER PRIMARY KEY,payload TEXT,updated_at TEXT); CREATE TABLE learning_state_history(id INTEGER PRIMARY KEY,payload TEXT,user_id INTEGER,saved_at TEXT); INSERT INTO users(id,username,created_at) VALUES(1,'TEST 학생','2026-09-01'),(2,'TEST 빈 학생','2026-09-01')");
for(const name of ['0001_support_portal.sql','0002_feedback_collaboration.sql','0003_feedback_context.sql','0008_security_hardening.sql','0010_teacher_signals.sql'])db.exec(await readFile(new URL('../worker/migrations/'+name,import.meta.url),'utf8'));
const student=db.prepare('SELECT arena_public_id FROM users WHERE id=1').get().arena_public_id;
const second=db.prepare('SELECT arena_public_id FROM users WHERE id=2').get().arena_public_id;
const today=new Date().toLocaleDateString('sv-SE'),ago=days=>{const d=new Date();d.setDate(d.getDate()-days);return d.toLocaleDateString('sv-SE');};
const empty={calendar:{},sessions:[],mockSchedule:[],journals:{},scores:[],resources:[],goals:[],weeklyCapabilityGoals:[],wrongAnswerDrills:[],dailyDrills:[],monthlyPlans:[],notionPages:[],routine:[],quotes:[],examDate:'2026-11-19',googleClientId:'',plaire:{},trinity:[]};
const fixture={...empty,
 calendar:{[today]:{date:today,study:'',minutes:0,exam:'',event:'',condition:3,reflection:'PRIVATE',plans:[{id:'p',subject:'수학',title:'조건 Drill',detail:'',quantity:'20분',done:true},{id:'e',subject:'영어',title:'영어 복습',detail:'',quantity:'30분',done:false}]}},
 sessions:[{id:'previous',date:ago(16),subject:'수학',seconds:3600},{id:'now',date:today,subject:'수학',seconds:7200},{id:'english',date:today,subject:'영어',seconds:600}],
 scores:[{id:'old-score',date:ago(16),name:'TEST 이전 실모',subject:'수학',math:82,duration:100,errorType:'전략·판단',cause:'',nextAction:''},{id:'score',date:today,name:'TEST 현재 실모',subject:'수학',math:81,korean:84,english:90,duration:100,errorType:'전략·판단',cause:'',nextAction:''}],
 wrongAnswerDrills:[0,1,2].map((n)=>({id:'w'+n,date:ago(n),subject:'수학',source:'TEST 실모',question:'조건 21번 '+n,wrongJudgment:'필요조건만 확인',missedCue:'극값 부호 변화',correction:'충분조건 확인',transfer:'유사 문항 적용',scoreId:'score',bottleneck:'전략·판단',retries:[{id:'3d',label:'3일 후 재도전',dueDate:today}]})),
 dailyDrills:[{id:'d',date:today,subject:'수학',title:'TEST 기존 Drill',action:'조건 검증',successCriterion:'누락 0회',minutes:20,done:true,reflection:''}],
 resources:[{id:'r',subject:'수학',group:'TEST',name:'TEST 수학 교재',total:10,done:2}],
 trinity:[{id:'t',date:today,subject:'수학',mode:'수학',fields:{'핵심 조건':'경계값 검증'}}]
};
db.prepare('INSERT INTO learning_state VALUES(1,?,?)').run(JSON.stringify(fixture),new Date().toISOString());
db.prepare('INSERT INTO learning_state VALUES(2,?,?)').run(JSON.stringify(empty),new Date().toISOString());
const rawBefore=JSON.stringify(fixture);
for(const [id,role,subject] of [['math','subject_teacher','수학'],['manager','academic_manager',null]]){
 const salt='fixture-salt',password=pbkdf2Sync('test-password-123',salt,310000,32,'sha256').toString('hex');
 db.prepare('INSERT INTO support_accounts(id,username,role,collaboration_role,password_hash,salt,password_iterations,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,id,role==='subject_teacher'?'tutor':'parent',role,password,salt,310000,today);
 for(const studentId of [1,2])db.prepare('INSERT INTO student_support_assignments VALUES(?,?,?,?,?,?,?)').run(id+'-'+studentId,studentId,id,role,subject,JSON.stringify({createFeedback:true,viewSessions:true,viewScores:true,viewWrongAnswers:true,viewCalendar:true,viewWeeklyGoals:true,viewDrills:true,viewAcademicInsights:true}),today);
}
db.prepare('INSERT INTO sessions VALUES(?,1,?,?)').run(hash('fixture-student'),new Date(Date.now()+86400000).toISOString(),new Date().toISOString());
const wrap=(stmt,args=[])=>({bind:(...values)=>wrap(stmt,values),first:async()=>stmt.get(...args)??null,run:async()=>stmt.run(...args),all:async()=>({results:stmt.all(...args)})});
const env={DB:{prepare:sql=>wrap(db.prepare(sql)),batch:async statements=>{db.exec('BEGIN');try{const result=[];for(const stmt of statements)result.push(await stmt.run());db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}},ALLOWED_ORIGIN:'http://127.0.0.1:4173',ENVIRONMENT:'production'};
let failData=false,holdData=false;
const apiServer=httpServer(async(req,res)=>{
 try{
  const parts=[];for await(const chunk of req)parts.push(chunk);
  if(req.url.includes('/data')&&holdData)await new Promise(resolve=>setTimeout(resolve,600));
  if(req.url.includes('/data')&&failData){res.writeHead(503,{'Content-Type':'application/json','Access-Control-Allow-Origin':env.ALLOWED_ORIGIN});res.end(JSON.stringify({error:'TEST 조회 오류'}));return;}
  const request=new Request('http://127.0.0.1:8789'+req.url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(parts)})});
  const response=await worker.fetch(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){res.writeHead(500);res.end(String(error));}
});
await new Promise(resolve=>apiServer.listen(8789,'127.0.0.1',resolve));
const vite=await viteServer({server:{host:'127.0.0.1',port:4173,strictPort:true}});await vite.listen();
await mkdir(new URL('../.teacher-ui-check/',import.meta.url),{recursive:true});
let browser;
const errors=[];
try{
 browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 context.on('page',page=>{page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('503'))errors.push(message.text());});});
 for (const [account,portal,title] of [['manager','manager','Learning Control Center'],['math','teacher','Math Intelligence']]) {
  const loginContext=await browser.newContext(); const entry=await loginContext.newPage();
  await entry.goto('http://127.0.0.1:4173/');
  await entry.getByRole('button',{name:'선생님 로그인',exact:true}).first().click();
  await entry.getByRole('button',{name:'연결 서버 변경'}).click();
  await entry.getByLabel('Worker 주소').fill('http://127.0.0.1:8789');
  await entry.getByLabel('아이디',{exact:true}).fill(account); await entry.getByLabel('비밀번호',{exact:true}).fill('test-password-123');
  await entry.getByRole('button',{name:'선생님 로그인',exact:true}).last().click();
  await entry.waitForURL('**/?portal='+portal); await entry.getByRole('heading',{name:title,exact:true}).waitFor();
  assert(await entry.evaluate(role=>JSON.parse(sessionStorage.getItem('trinity-collab:'+role)).role,account==='manager'?'academic_manager':'subject_teacher'));
  await loginContext.close();
 }
 console.log('PASS Common teacher login: server-authenticated manager/math routing');
 const math=await context.newPage();
 await math.goto('http://127.0.0.1:4173/?portal=teacher');
 await math.getByLabel('Worker 주소').fill('http://127.0.0.1:8789');
 await math.getByLabel('아이디',{exact:true}).fill('math');await math.getByLabel('비밀번호',{exact:true}).fill('test-password-123');
 await math.getByRole('button',{name:'로그인',exact:true}).click();
 await math.getByRole('heading',{name:'지금 먼저 확인할 병목은 ‘전략·판단’입니다.'}).waitFor();
 await math.getByRole('tab',{name:'Bottlenecks',exact:true}).click();
 await math.getByRole('button',{name:/전략·판단/}).click();
 await math.getByRole('button',{name:/조건 21번 0/}).click();
 const inspector=math.getByRole('dialog',{name:'문항 분석'});
 await inspector.getByLabel('제목',{exact:true}).fill('TEST 조건 검증 진단');
 await inspector.getByLabel('Diagnosis · 핵심 병목').fill('필요조건만 확인');
 await inspector.getByLabel('Intervention · 교정 행동 / 제안').fill('20분 Drill × 3회');
 await inspector.getByLabel('성공 기준',{exact:true}).fill('누락 0회');
 await inspector.getByRole('button',{name:'판단 · Signal 전송'}).click();
 await math.getByRole('tab',{name:'Feedback',exact:true}).click();
 await math.getByText('TEST 조건 검증 진단 ·', {exact:false}).first().waitFor();
 assert.equal(db.prepare('SELECT payload FROM learning_state WHERE user_id=1').get().payload,rawBefore);
 console.log('PASS Scenario A: login, student, bottleneck, inspector, diagnosis and manager Signal');
 const manager=await context.newPage();await manager.goto('http://127.0.0.1:4173/?portal=manager');
 await manager.getByLabel('Worker 주소').fill('http://127.0.0.1:8789');await manager.getByLabel('아이디',{exact:true}).fill('manager');await manager.getByLabel('비밀번호',{exact:true}).fill('test-password-123');await manager.getByRole('button',{name:'로그인',exact:true}).click();
 await manager.getByRole('heading',{name:'TEST 조건 검증 진단',exact:true}).waitFor();
 await manager.getByRole('button',{name:'Weekly Goal 반영',exact:true}).click();
 let editor=manager.getByRole('dialog',{name:'Weekly Capability Goal'});
 assert.equal(await editor.getByLabel('능력 목표').inputValue(),'TEST 조건 검증 진단');
 await editor.getByRole('button',{name:'초안 확인 · 학생에게 제안'}).click();
 await manager.getByRole('button',{name:'Daily Drill 제안',exact:true}).click();
 editor=manager.getByRole('dialog',{name:'Daily Drill'});await editor.getByLabel('훈련 시간 · 분').fill('20');await editor.getByRole('button',{name:'초안 확인 · 학생에게 제안'}).click();
 await manager.getByText('Daily Drill 초안 · 학생 확인 대기',{exact:true}).waitFor();
 assert.equal(db.prepare('SELECT payload FROM learning_state WHERE user_id=1').get().payload,rawBefore);
 console.log('PASS Scenario B: subject Signal → prefilled goal/drill editors → confirmed drafts, no raw writes');
 await manager.getByRole('tab',{name:'Execution',exact:true}).click();
 await manager.getByText('HIGH EFFORT + LOW OUTCOME · 병목 진단 필요',{exact:true}).waitFor();
 await manager.getByRole('tab',{name:'Overview',exact:true}).click();
 await manager.getByRole('button',{name:'과목 선생님에게 재진단 요청',exact:true}).first().click();
 let request=manager.getByRole('dialog',{name:'과목 재진단 요청'});
 await request.getByLabel('제목',{exact:true}).fill('TEST 수학 재진단');
 await request.getByRole('button',{name:'판단 · Signal 전송'}).click();
 await request.waitFor({state:'hidden'});
 console.log('PASS Scenario C: increased effort + completed drill + stalled outcome → reassessment');
 await math.getByRole('button',{name:'새로고침',exact:true}).click();await math.getByRole('tab',{name:'Overview',exact:true}).click();
 await math.getByRole('heading',{name:'TEST 수학 재진단',exact:true}).waitFor();
 await math.getByText('근거 · 권장 행동 · 성공 기준',{exact:true}).first().click();
 await math.getByRole('button',{name:/근거 기록 확인 · subject_progress/}).click();
 await math.getByRole('dialog',{name:'문항 분석'}).getByText('학습 시간 · 120분',{exact:true}).waitFor();
 await math.getByRole('dialog',{name:'문항 분석'}).getByLabel('제목',{exact:true}).fill('TEST 재진단 intervention');
 await math.getByRole('dialog',{name:'문항 분석'}).getByRole('button',{name:'판단 · Signal 전송'}).click();
 await math.getByRole('tab',{name:'Overview',exact:true}).waitFor();
 console.log('PASS Scenario D: manager Signal → related math evidence → new intervention');
 await math.getByRole('tab',{name:'Wrong Answers',exact:true}).click();
 await math.getByRole('button',{name:/조건 21번 0/}).click();
 let direct=math.getByRole('dialog',{name:'문항 분석'});
 await direct.getByLabel('제목',{exact:true}).fill('TEST 직접 목표 제안');
 await direct.getByLabel('Intervention · 교정 행동 / 제안').fill('조건 검증 3회');
 await direct.getByRole('button',{name:'Weekly Goal 제안',exact:true}).click();
 let directEditor=math.getByRole('dialog',{name:'Weekly Capability Goal'});
 assert.equal(await directEditor.getByLabel('능력 목표').inputValue(),'TEST 직접 목표 제안');
 await directEditor.getByRole('button',{name:'취소',exact:true}).click();
 assert.equal(db.prepare("SELECT count(*) n FROM teacher_feedback WHERE title='TEST 직접 목표 제안'").get().n,0);
 await direct.getByRole('button',{name:'Weekly Goal 제안',exact:true}).click();
 await math.getByRole('dialog',{name:'Weekly Capability Goal'}).getByRole('button',{name:'초안 확인 · 학생에게 제안'}).click();
 await math.getByRole('tab',{name:'Overview',exact:true}).waitFor();
 const sourceDraft=JSON.parse(db.prepare("SELECT signal_json FROM teacher_feedback WHERE title='TEST 직접 목표 제안'").get().signal_json);
 assert.equal(sourceDraft.status,'open');assert.equal(sourceDraft.weeklyGoal.ability,'TEST 직접 목표 제안');
 console.log('PASS Inspector goal proposal: prefill, cancel without save, explicit confirmed Signal');


 // Check every role-specific tab at all requested widths and inspect mobile/tablet dialogs.
 for(const width of [390,768,1024,1280,1440]){
  for(const [page,role] of [[math,'math'],[manager,'learning']]){
   await page.setViewportSize({width,height:900});
   console.log('CHECK',role,width);
   for(const name of role==='math'?['Overview','Capability','Bottlenecks','Mock Exams','Wrong Answers','Drill','Resources','Feedback']:['Overview','Execution','Subjects','Weekly Goals','Teacher Signals','Schedule / Load','Trends','Resources','ARENA','Feedback']){
    await page.getByRole('tab',{name,exact:true}).click();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),role+' '+width+' '+name+' overflow');
   }
   await page.getByRole('tab',{name:'Overview',exact:true}).click();
   await page.screenshot({path:new URL('../.teacher-ui-check/'+role+'-'+width+'.png',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true,animations:'disabled',timeout:15000});
  }
  console.log('CHECK inspector',width);
  await math.getByRole('tab',{name:'Wrong Answers',exact:true}).click();
  await math.getByRole('button',{name:/조건 21번 0/}).click();
  assert(await math.getByRole('dialog',{name:'문항 분석'}).evaluate(el=>el.scrollWidth<=el.clientWidth),'inspector overflow '+width);
  await math.getByRole('dialog',{name:'문항 분석'}).getByRole('button',{name:'닫기',exact:true}).click();
 }
 console.log('PASS Responsive: every tab and inspector at 390, 768, 1024, 1280, 1440px');
 await math.getByLabel('학생 선택').selectOption(second);await math.getByRole('heading',{name:'현재 수학 병목을 판단할 기록이 부족합니다.'}).waitFor();
 await math.getByLabel('학생 선택').selectOption(student);await math.getByRole('heading',{name:/현재 교사 판단/}).waitFor();
 holdData=true;await math.getByRole('button',{name:'새로고침',exact:true}).click();await math.getByText('학습 근거와 Teacher Signal을 불러오는 중…',{exact:true}).waitFor();holdData=false;
 await math.getByRole('tab',{name:'Overview',exact:true}).waitFor();
 failData=true;await math.getByRole('button',{name:'새로고침',exact:true}).click();await math.getByRole('alert').waitFor();failData=false;await math.getByRole('button',{name:'다시 시도',exact:true}).click();await math.getByRole('tab',{name:'Overview',exact:true}).waitFor();
 console.log('PASS Empty, loading, error, retry and student selection');

 // Student confirms the same teacher drafts through the existing FeedbackInbox and Sync.
 const studentContext=await browser.newContext({viewport:{width:1024,height:900}});
 const storageSource=await readFile(new URL('../src/lib/storage.ts',import.meta.url),'utf8');
 const storageKey=storageSource.match(/const STORAGE_KEY = '([^']+)'/)[1];
 await studentContext.addInitScript(({data,key})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(data));localStorage.setItem('trinity-os:cloudflare-sync:v1',JSON.stringify({url:'http://127.0.0.1:8789',token:'fixture-student',username:'TEST 학생'}));},{data:fixture,key:storageKey});
 const pupil=await studentContext.newPage();pupil.on('pageerror',error=>errors.push(error.message));
 await pupil.goto('http://127.0.0.1:4173/feedback');
 const card=pupil.locator('.feedback-card').filter({has:pupil.getByRole('heading',{name:'TEST 조건 검증 진단',exact:true})});
 await card.getByRole('button',{name:'Weekly Goal 확인 · 생성'}).click();
 await pupil.getByRole('dialog',{name:'Weekly Capability Goal'}).getByRole('button',{name:'확인 후 생성'}).click();
 await card.getByRole('button',{name:'Daily Drill 확인 · 생성'}).click();
 await pupil.getByRole('dialog',{name:'Daily Drill'}).getByRole('button',{name:'확인 후 생성'}).click();
 await card.getByRole('button',{name:'Daily Drill 반영됨'}).waitFor();
 const local=await pupil.evaluate(key=>JSON.parse(localStorage.getItem(key)),storageKey);
 assert.equal(local.weeklyCapabilityGoals.length,1);
 assert.equal(local.dailyDrills.length,2);
 assert.equal(local.dailyDrills[0].capabilityGoalId,local.weeklyCapabilityGoals[0].id);
 await pupil.waitForFunction(async()=>{const response=await fetch('http://127.0.0.1:8789/api/sync',{headers:{Authorization:'Bearer fixture-student'}});const value=await response.json();return value.data.weeklyCapabilityGoals.length===1&&value.data.dailyDrills.length===2;});
 console.log('PASS Student confirmation: goals/drills created and linked, existing student Sync saves execution');
 for(const route of ['/today','/plan?view=calendar','/plan?view=weekly','/train?view=timer','/train?view=drill','/train?view=wrong','/train?view=resources','/test','/insights?view=performance','/insights?view=bottlenecks','/insights?view=review','/workspace']){
  await pupil.goto('http://127.0.0.1:4173'+route);await pupil.locator('main h1').first().waitFor();
  assert(await pupil.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'student regression overflow '+route);
 }
 console.log('PASS Student regressions: Today, Calendar, Weekly, Timer, Drill, Wrong Answer, Resources, Score, Insights, Trinity review, Workspace');
 assert.deepEqual(errors,[],'browser console/page errors');
 console.log('PASS Console errors: 0');
}catch(error){console.error(error);throw error;}finally{apiServer.closeAllConnections();await browser?.close();await vite.close();await new Promise(resolve=>apiServer.close(resolve));db.close();}
