import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {archive} from '../worker/src/archive.ts';
import {learningIntelligence} from '../worker/src/learning-intelligence.ts';

const wrap=(stmt,args=[],sql='')=>({
  _sql:sql,bind:(...values)=>wrap(stmt,values,sql),first:async()=>stmt.get(...args)??null,run:async()=>stmt.run(...args),all:async()=>({results:stmt.all(...args)}),
});
const helpers={json:(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}}),randomHex:(size=16)=>Array.from(crypto.getRandomValues(new Uint8Array(size)),v=>v.toString(16).padStart(2,'0')).join(''),boundedJson:async r=>r.json()};
function env(){
  const raw=new DatabaseSync(':memory:');raw.exec(readFileSync(new URL('../worker/schema.sql',import.meta.url),'utf8'));
  let failQuickRelation=false;
  const DB={prepare:sql=>wrap(raw.prepare(sql),[],sql),batch:async list=>{raw.exec('BEGIN');try{const out=[];for(const stmt of list){if(failQuickRelation&&stmt._sql.includes('VALUES(?,?,?,?,?) ON CONFLICT(core_rule_id,wrong_answer_id)')){failQuickRelation=false;throw new Error('TEST_RELATION_FAILURE')}out.push(await stmt.run())}raw.exec('COMMIT');return out}catch(e){raw.exec('ROLLBACK');throw e}}};
  raw.prepare("INSERT INTO users(id,username,created_at,active) VALUES(1,'a','x',1),(2,'b','x',1)").run();
  raw.prepare("INSERT INTO learning_state(user_id,payload,updated_at) VALUES(1,?,'2026-09-20T00:00:00Z'),(2,?,'2026-09-20T00:00:00Z')").run(JSON.stringify({wrongAnswerDrills:[],dailyDrills:[]}),JSON.stringify({wrongAnswerDrills:[],dailyDrills:[]}));
  return {raw,DB,failNextRelation(){failQuickRelation=true}};
}
const callArchive=(DB,userId,path,init={})=>archive(new Request(`https://worker.test${path}`,init),{DB},userId?{id:userId,is_admin:0}:null,'',helpers);
const call=(DB,userId,path,init={})=>learningIntelligence(new Request(`https://worker.test${path}`,init),{DB},userId?{id:userId}:null,'',helpers);
const post=(value)=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
const quick=(requestId,extra={})=>({requestId,subject:'수학',wrongAnswer:{date:'2026-09-20',source:'TRUSS',question:'15',wrongJudgment:'필요조건만 확인',missedCue:'경계값',correction:'경계값 대입',bottleneck:'완결성 실패',nextAction:'관련 기출 재풀이'},coreRule:{mode:'none'},archive:{mode:'none'},review:{enabled:false},drill:{enabled:false},...extra});

test('Quick Capture writes AppData/projection once and completed retry is idempotent',async()=>{
  const {raw,DB}=env();
  const first=await call(DB,1,'/api/learning-intelligence/quick-capture',post(quick('req-basic')));assert.equal(first.status,201);const body=await first.json();
  assert.equal(raw.prepare('SELECT COUNT(*) c FROM wrong_answers WHERE user_id=1').get().c,1);
  const state=JSON.parse(raw.prepare('SELECT payload FROM learning_state WHERE user_id=1').get().payload);assert.equal(state.wrongAnswerDrills.length,1);assert.equal(state.wrongAnswerDrills[0].retries.length,3);
  const retry=await call(DB,1,'/api/learning-intelligence/quick-capture',post(quick('req-basic')));assert.equal(retry.status,200);assert.equal((await retry.json()).wrongAnswerId,body.wrongAnswerId);assert.equal(raw.prepare('SELECT COUNT(*) c FROM wrong_answers WHERE user_id=1').get().c,1);
});

test('Quick Capture validates ownership and orchestrates Core Rule, Archive, Review and Drill',async()=>{
  const {raw,DB}=env(),now='2026-09-20T00:00:00Z';
  raw.prepare("INSERT INTO core_rules VALUES('rule1',1,'math','경계값 검증','끝점을 직접 대입한다','[]','input',?,?)").run(now,now);
  raw.prepare("INSERT INTO core_rules VALUES('other',2,'math','x','x','[]','input',?,?)").run(now,now);
  raw.prepare("INSERT INTO archive_entries(id,user_id,subject,year,month,institution,title,studied_at,mastery_status,created_at,updated_at) VALUES('entry1',1,'math',2027,9,'KICE','문항', '2026-09-20','input',?,?)").run(now,now);
  const invalid=await call(DB,1,'/api/learning-intelligence/quick-capture',post(quick('bad',{coreRule:{mode:'existing',id:'other'}})));assert.equal(invalid.status,400);assert.equal(raw.prepare("SELECT COUNT(*) c FROM quick_capture_requests WHERE request_id='bad'").get().c,0);
  const response=await call(DB,1,'/api/learning-intelligence/quick-capture',post(quick('all',{coreRule:{mode:'existing',id:'rule1'},archive:{mode:'existing',id:'entry1'},review:{enabled:true,scheduledAt:'2026-09-21',notes:'재현'},drill:{enabled:true,title:'경계값 Drill',date:'2026-09-20',estimatedMinutes:12}})));assert.equal(response.status,201);const body=await response.json();
  assert.equal(raw.prepare('SELECT COUNT(*) c FROM core_rule_wrong_answer_links WHERE core_rule_id=? AND wrong_answer_id=?').get('rule1',body.wrongAnswerId).c,1);
  assert.equal(raw.prepare('SELECT COUNT(*) c FROM archive_wrong_answer_links WHERE archive_entry_id=?').get('entry1').c,1);
  assert.equal(raw.prepare('SELECT COUNT(*) c FROM learning_reviews WHERE id=?').get(body.reviewId).c,1);
  assert.equal(raw.prepare('SELECT COUNT(*) c FROM core_rule_drill_links WHERE core_rule_id=? AND drill_id=?').get('rule1',body.drillId).c,1);
  assert.equal(raw.prepare("SELECT COUNT(*) c FROM core_rule_evidence WHERE core_rule_id='rule1' AND source_type='wrong_answer'").get().c,1);
});


test('Quick Capture creates a new Core Rule and rejects cross-owner or cross-subject Archive targets',async()=>{
  const {raw,DB}=env(),now='2026-09-20T00:00:00Z';
  raw.prepare("INSERT INTO archive_entries(id,user_id,subject,year,month,institution,title,studied_at,mastery_status,created_at,updated_at) VALUES('other-entry',2,'math',2027,9,'KICE','다른 사용자','2026-09-20','input',?,?)").run(now,now);
  raw.prepare("INSERT INTO archive_entries(id,user_id,subject,year,month,institution,title,studied_at,mastery_status,created_at,updated_at) VALUES('english-entry',1,'english',2027,9,'KICE','영어 문항','2026-09-20','input',?,?)").run(now,now);
  assert.equal((await call(DB,1,'/api/learning-intelligence/quick-capture',post(quick('bad-owner',{archive:{mode:'existing',id:'other-entry'}})))).status,400);
  assert.equal((await call(DB,1,'/api/learning-intelligence/quick-capture',post(quick('bad-subject',{archive:{mode:'existing',id:'english-entry'}})))).status,400);
  const created=await call(DB,1,'/api/learning-intelligence/quick-capture',post(quick('new-rule',{coreRule:{mode:'new',title:'경계값 최종 검증',content:'답 확정 전 끝점을 직접 대입한다',tags:['완결성']}})));assert.equal(created.status,201);const body=await created.json();
  const rule=raw.prepare('SELECT title,subject FROM core_rules WHERE id=? AND user_id=1').get(body.coreRuleId);assert.equal(rule.title,'경계값 최종 검증');assert.equal(rule.subject,'math');
  assert.equal(raw.prepare('SELECT COUNT(*) c FROM core_rule_wrong_answer_links WHERE core_rule_id=? AND wrong_answer_id=?').get(body.coreRuleId,body.wrongAnswerId).c,1);
});
test('Quick Capture resumes after a relation failure without duplicating Wrong Answer',async()=>{
  const {raw,DB,failNextRelation}=env(),now='2026-09-20T00:00:00Z';raw.prepare("INSERT INTO core_rules VALUES('rule1',1,'math','r','c','[]','input',?,?)").run(now,now);failNextRelation();
  await assert.rejects(()=>call(DB,1,'/api/learning-intelligence/quick-capture',post(quick('recover',{coreRule:{mode:'existing',id:'rule1'}}))),/TEST_RELATION_FAILURE/);
  assert.equal(raw.prepare('SELECT COUNT(*) c FROM wrong_answers WHERE user_id=1').get().c,1);assert.equal(raw.prepare("SELECT status FROM quick_capture_requests WHERE request_id='recover'").get().status,'failed');
  const retry=await call(DB,1,'/api/learning-intelligence/quick-capture',post(quick('recover',{coreRule:{mode:'existing',id:'rule1'}})));assert.equal(retry.status,200);assert.equal(raw.prepare('SELECT COUNT(*) c FROM wrong_answers WHERE user_id=1').get().c,1);assert.equal(raw.prepare("SELECT COUNT(*) c FROM core_rule_wrong_answer_links WHERE core_rule_id='rule1'").get().c,1);
});

test('Unified Review Queue resolves all target types and PATCH schedules the next review',async()=>{
  const {raw,DB}=env(),now='2026-09-20T00:00:00Z';
  raw.prepare("INSERT INTO core_rules VALUES('rule1',1,'math','경계값','내용','[]','input',?,?)").run(now,now);
  raw.prepare("INSERT INTO archive_entries(id,user_id,subject,year,month,institution,title,studied_at,mastery_status,created_at,updated_at) VALUES('entry1',1,'math',2027,9,'KICE','Archive 문항','2026-09-20','input',?,?)").run(now,now);
  raw.prepare("INSERT INTO wrong_answers(user_id,id,date,subject,source,question,created_at,updated_at) VALUES(1,'wa1','2026-09-20','수학','TRUSS','15',?,?)").run(now,now);
  raw.prepare("INSERT INTO learning_drills(user_id,id,date,subject,title,created_at,updated_at) VALUES(1,'d1','2026-09-20','수학','교정 Drill',?,?)").run(now,now);
  const today=new Date(Date.now()+3*3600000).toISOString().slice(0,10),past=new Date(Date.now()+3*3600000-86400000).toISOString().slice(0,10),future=new Date(Date.now()+3*3600000+86400000).toISOString().slice(0,10);
  const insert=raw.prepare("INSERT INTO learning_reviews(id,user_id,target_type,target_id,review_type,scheduled_at,result,notes,created_at,updated_at) VALUES(?,1,?,?, 'retry',?,'pending','',?,?)");
  insert.run('r-core','core_rule','rule1',today,now,now);insert.run('r-wa','wrong_answer','wa1',past,now,now);insert.run('r-drill','drill','d1',future,now,now);insert.run('r-entry','learning_item','entry1',today,now,now);
  const queueRes=await call(DB,1,'/api/learning-intelligence/reviews?view=queue');assert.equal(queueRes.status,200);const queue=await queueRes.json();assert.equal(queue.counts.due,3);assert.equal(queue.overdue[0].targetType,'wrong_answer');assert.equal(new Set([...queue.today,...queue.upcoming,...queue.overdue].map(i=>i.targetType)).size,4);
  const patch=await call(DB,1,'/api/learning-intelligence/reviews/r-core',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({result:'success',notes:'재현 완료'})});assert.equal(patch.status,200);const result=await patch.json();assert(result.nextReview?.id);assert.equal(raw.prepare("SELECT result FROM learning_reviews WHERE id='r-core'").get().result,'success');assert.equal(raw.prepare("SELECT COUNT(*) c FROM learning_reviews WHERE target_type='core_rule' AND target_id='rule1' AND result='pending'").get().c,1);assert.equal(raw.prepare("SELECT COUNT(*) c FROM core_rule_evidence WHERE core_rule_id='rule1' AND source_type='review' AND relation_type='reinforced'").get().c,1);
});


test('legacy Archive backup restore also restores learning_reviews and a pending next review',async()=>{
  const {raw,DB}=env();
  const payload={entries:[{id:'entry-old',subject:'math',year:2027,month:9,institution:'KICE',examName:'',sourceName:'',questionNumber:'15',category:'',subcategory:'',title:'옛 Archive',studiedAt:'2026-09-10',masteryStatus:'input',memo:'m',reviewEnabled:true}],annotations:[],coreRules:[],ruleLinks:[],reviews:[{id:'legacy-r1',archiveEntryId:'entry-old',reviewedAt:'2026-09-12T00:00:00.000Z',success:true,coreRuleRevealed:false,nextDueAt:'2026-09-19T00:00:00.000Z',createdAt:'2026-09-12T00:00:00.000Z'}],wrongAnswerLinks:[],reviewSettings:{intervals:[3,7,14,30]}};
  const response=await callArchive(DB,1,'/api/archive/import',post(payload));assert.equal(response.status,200);
  assert.equal(raw.prepare("SELECT COUNT(*) c FROM learning_reviews WHERE user_id=1 AND target_type='learning_item' AND target_id='entry-old' AND result='success'").get().c,1);
  assert.equal(raw.prepare("SELECT COUNT(*) c FROM learning_reviews WHERE user_id=1 AND target_type='learning_item' AND target_id='entry-old' AND result='pending'").get().c,1);
});

test('student UI uses Quick Capture and the unified Review Queue instead of the legacy Archive review writer',()=>{
  const train=readFileSync(new URL('../src/pages/TrainHub.tsx',import.meta.url),'utf8'),archiveUi=readFileSync(new URL('../src/pages/LearningArchive.tsx',import.meta.url),'utf8'),insights=readFileSync(new URL('../src/pages/InsightsHub.tsx',import.meta.url),'utf8'),dashboard=readFileSync(new URL('../src/pages/Dashboard.tsx',import.meta.url),'utf8');
  assert.match(train,/QuickCaptureSheet/);assert.match(train,/빠른 오답 기록/);assert.match(archiveUi,/UnifiedReviewQueue/);assert.doesNotMatch(archiveUi,/\/api\/archive\/reviews/);assert.match(insights,/ReviewWorkspace/);assert.match(dashboard,/insights:review/);assert.match(dashboard,/learning-intelligence\/reviews\?view=queue/);assert.match(readFileSync(new URL('../src/components/learning/QuickCaptureSheet.tsx',import.meta.url),'utf8'),/uploadCloudflareData/);
});
