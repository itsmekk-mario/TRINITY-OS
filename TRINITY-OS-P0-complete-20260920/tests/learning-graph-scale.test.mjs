import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {archive} from '../worker/src/archive.ts';
import {learningIntelligence} from '../worker/src/learning-intelligence.ts';
import {calculateCoreRulePriority, syncLearningProjection} from '../worker/src/learning-graph.ts';

const wrap=(stmt,args=[])=>({
  bind:(...values)=>wrap(stmt,values),
  first:async()=>stmt.get(...args)??null,
  run:async()=>stmt.run(...args),
  all:async()=>({results:stmt.all(...args)}),
});
const helpers={
  json:(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}}),
  randomHex:(size=16)=>Array.from(crypto.getRandomValues(new Uint8Array(size)),value=>value.toString(16).padStart(2,'0')).join(''),
  boundedJson:async request=>request.json(),
};
function env(){
  const raw=new DatabaseSync(':memory:');
  raw.exec(readFileSync(new URL('../worker/schema.sql',import.meta.url),'utf8'));
  const DB={prepare:sql=>wrap(raw.prepare(sql)),batch:async list=>{
    raw.exec('BEGIN');try{const out=[];for(const stmt of list)out.push(await stmt.run());raw.exec('COMMIT');return out}
    catch(error){raw.exec('ROLLBACK');throw error}
  }};
  raw.prepare("INSERT INTO users(id,username,created_at,active) VALUES(1,'a','x',1),(2,'b','x',1)").run();
  raw.prepare("INSERT INTO learning_state(user_id,payload,updated_at) VALUES(1,?,'2026-09-18T00:00:00.000Z'),(2,?,'2026-09-18T00:00:00.000Z')")
    .run(JSON.stringify({wrongAnswerDrills:[],dailyDrills:[]}),JSON.stringify({wrongAnswerDrills:[],dailyDrills:[]}));
  return {raw,DB};
}
const user=id=>({id,is_admin:0});
const callArchive=(DB,userId,path,init={})=>archive(new Request(`https://worker.test${path}`,init),{DB},user(userId),'',helpers);
const callIntel=(DB,userId,path,init={})=>learningIntelligence(new Request(`https://worker.test${path}`,init),{DB},userId?{id:userId}:null,'',helpers);

test('fresh schema contains the complete Learning Graph core tables',()=>{
  const {raw}=env();
  const names=new Set(raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name));
  for(const name of ['archive_entries','archive_annotations','core_rules','archive_entry_core_rules','archive_reviews','archive_wrong_answer_links','wrong_answers','learning_drills','core_rule_drill_links','core_rule_wrong_answer_links','learning_reviews','core_rule_evidence'])
    assert(names.has(name),`missing ${name}`);
});

test('Archive cursor pagination traverses 1000 records without duplicates or gaps',async()=>{
  const {raw,DB}=env(),insert=raw.prepare(`INSERT INTO archive_entries(
    id,user_id,subject,year,month,institution,title,studied_at,mastery_status,memo,created_at,updated_at
  ) VALUES(?,1,'math',2027,9,'KICE',?,?,'input','',?,?)`);
  for(let i=0;i<1000;i++){
    const day=String(1+(i%28)).padStart(2,'0'),stamp=`2026-09-${day}T${String(i%24).padStart(2,'0')}:00:00.000Z`;
    insert.run(`e-${String(i).padStart(4,'0')}`,`entry ${i}`,`2026-09-${day}`,stamp,stamp);
  }
  const seen=[],keys=[];let cursor='';
  do{
    const suffix=`?limit=100${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`;
    const response=await callArchive(DB,1,`/api/archive/entries${suffix}`);
    assert.equal(response.status,200);
    const body=await response.json();
    for(const entry of body.entries){seen.push(entry.id);keys.push([entry.studiedAt,entry.updatedAt,entry.id])}
    cursor=body.nextCursor||'';
    if(!body.hasMore)break;
  }while(cursor);
  assert.equal(seen.length,1000);
  assert.equal(new Set(seen).size,1000);
  for(let i=1;i<keys.length;i++){
    const a=keys[i-1],b=keys[i];
    assert(a[0]>b[0]||(a[0]===b[0]&&(a[1]>b[1]||(a[1]===b[1]&&a[2]>b[2]))));
  }
});

test('Core Rule priority favors recent failures over old inactive evidence',()=>{
  const base={evidenceCount:1,archiveCount:1,wrongAnswerCount:0,drillCount:0,derivedCount:0,appliedCount:0,failedCount:1,reinforcedCount:0,failures7d:0,failures30d:0,lastOccurrenceAt:'2025-01-01T00:00:00.000Z',lastFailureAt:'2025-01-01T00:00:00.000Z',reviewCount:0,reviewSuccessCount:0,reviewFailureCount:0,masteryRate:null};
  const old=calculateCoreRulePriority(base,'understanding',new Date('2026-09-18T00:00:00Z'));
  const recent=calculateCoreRulePriority({...base,failures7d:3,failures30d:3,lastOccurrenceAt:'2026-09-18T00:00:00.000Z',lastFailureAt:'2026-09-18T00:00:00.000Z'},'understanding',new Date('2026-09-18T00:00:00Z'));
  assert(recent.priorityScore>old.priorityScore);
  assert.equal(recent.status,'ACTIVE');
});

test('Learning Graph blocks cross-user wrong-answer links and deduplicates relations',async()=>{
  const {raw,DB}=env(),now='2026-09-18T00:00:00.000Z';
  raw.prepare("INSERT INTO core_rules VALUES('r1',1,'math','rule','content','[]','input',?,?)").run(now,now);
  await syncLearningProjection(DB,1,{wrongAnswerDrills:[{id:'wa1',date:'2026-09-18',subject:'수학',source:'x',question:'1',wrongJudgment:'x',missedCue:'x',correction:'x',transfer:'x'}],dailyDrills:[]},now);
  const body=JSON.stringify({coreRuleId:'r1',wrongAnswerId:'wa1',relationType:'failed'});
  assert.equal((await callIntel(DB,2,'/api/learning-intelligence/wrong-answer-links',{method:'POST',headers:{'Content-Type':'application/json'},body})).status,404);
  assert.equal((await callIntel(DB,1,'/api/learning-intelligence/wrong-answer-links',{method:'POST',headers:{'Content-Type':'application/json'},body})).status,201);
  assert.equal((await callIntel(DB,1,'/api/learning-intelligence/wrong-answer-links',{method:'POST',headers:{'Content-Type':'application/json'},body})).status,201);
  assert.equal(raw.prepare("SELECT COUNT(*) count FROM core_rule_wrong_answer_links WHERE core_rule_id='r1'").get().count,1);
  assert.equal(raw.prepare("SELECT COUNT(*) count FROM core_rule_evidence WHERE core_rule_id='r1' AND source_type='wrong_answer'").get().count,1);
});
