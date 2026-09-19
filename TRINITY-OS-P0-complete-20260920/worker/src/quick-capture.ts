import { recordCoreRuleEvidence } from './learning-graph.ts';
import { writeLearningStateAndProjection } from './learning-state.ts';

type Env={DB:D1Database};
type User={id:number}|null;
type Tools={json:(v:unknown,s?:number,o?:string)=>Response;boundedJson:<T>(r:Request,n?:number)=>Promise<T>;randomHex:(n?:number)=>string};
type JsonRecord=Record<string,unknown>;
type Subject='국어'|'수학'|'영어'|'탐구';
type RuleRelation='derived'|'applied'|'failed'|'reinforced';
type CoreInput={mode:'none'|'existing'|'new';id?:string;title?:string;content?:string;tags?:string[]};
type ArchiveInput={mode:'none'|'existing';id?:string};
type ReviewInput={enabled:boolean;scheduledAt?:string;notes?:string};
type DrillInput={enabled:boolean;title?:string;date?:string;estimatedMinutes?:number};
type NormalizedInput={
  subject:Subject;
  wrongAnswer:{date:string;source:string;question:string;wrongJudgment:string;missedCue:string;correction:string;bottleneck:string;nextAction:string};
  coreRule:CoreInput;
  archive:ArchiveInput;
  review:ReviewInput;
  drill:DrillInput;
};
type Stage='validated'|'state_written'|'relations_written'|'completed'|'failed';
type CompletedStage=Exclude<Stage,'completed'|'failed'>|'relations_written';
type Progress={
  stage:Stage;
  lastCompletedStage?:CompletedStage;
  input:NormalizedInput;
  wrongAnswerId:string;
  coreRuleId:string|null;
  archiveEntryId:string|null;
  reviewId:string|null;
  drillId:string|null;
  recovered?:boolean;
};

const clean=(v:unknown,n=1000)=>typeof v==='string'?v.trim().slice(0,n):'';
const rec=(v:unknown):JsonRecord=>v&&typeof v==='object'&&!Array.isArray(v)?v as JsonRecord:{};
const parse=<T>(value:string|null|undefined,fallback:T):T=>{try{return value?JSON.parse(value) as T:fallback}catch{return fallback}};
const subjectCode=(subject:Subject)=>subject==='국어'?'korean':subject==='수학'?'math':subject==='영어'?'english':null;
const validDate=(value:string)=>/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)&&Number.isFinite(Date.parse(value.length===10?`${value}T00:00:00Z`:value));
const safeTags=(value:unknown)=>Array.isArray(value)?value.filter((item):item is string=>typeof item==='string').map(item=>item.trim().slice(0,80)).filter(Boolean).slice(0,30):[];
const addDays=(date:string,days:number)=>{const value=new Date(`${date.slice(0,10)}T12:00:00Z`);value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10)};
const retryPlan=(date:string)=>[3,7,14].map(days=>({id:`${days}d`,label:`${days}일 후 재도전`,dueDate:addDays(date,days)}));

async function stateData(db:D1Database,userId:number){
  const row=await db.prepare('SELECT payload FROM learning_state WHERE user_id=?').bind(userId).first<{payload:string}>();
  if(!row)throw new Error('NO_LEARNING_STATE');
  try{return JSON.parse(row.payload) as JsonRecord}catch{throw new Error('INVALID_LEARNING_STATE')}
}
async function requestRow(db:D1Database,userId:number,requestId:string){
  return db.prepare('SELECT status,result_json FROM quick_capture_requests WHERE user_id=? AND request_id=?')
    .bind(userId,requestId).first<{status:'processing'|'completed'|'failed';result_json:string|null}>();
}
async function saveProgress(db:D1Database,userId:number,requestId:string,status:'processing'|'completed'|'failed',progress:Progress){
  await db.prepare('UPDATE quick_capture_requests SET status=?,result_json=?,updated_at=? WHERE user_id=? AND request_id=?')
    .bind(status,JSON.stringify(progress),new Date().toISOString(),userId,requestId).run();
}

function normalizeInput(body:JsonRecord):NormalizedInput{
  const subject=clean(body.subject,40) as Subject,wrong=rec(body.wrongAnswer),core=rec(body.coreRule),archive=rec(body.archive),review=rec(body.review),drill=rec(body.drill);
  if(!['국어','수학','영어','탐구'].includes(subject))throw new Error('INVALID_INPUT');
  const date=clean(wrong.date,40),source=clean(wrong.source,240),question=clean(wrong.question,240);
  if(!validDate(date)||(!source&&!question))throw new Error('INVALID_INPUT');
  const coreMode=(clean(core.mode,20)||'none') as CoreInput['mode'];
  if(!['none','existing','new'].includes(coreMode))throw new Error('INVALID_INPUT');
  const archiveMode=(clean(archive.mode,20)||'none') as ArchiveInput['mode'];
  if(!['none','existing'].includes(archiveMode))throw new Error('INVALID_INPUT');
  const reviewEnabled=review.enabled===true,scheduledAt=clean(review.scheduledAt,40);
  if(reviewEnabled&&(!scheduledAt||!validDate(scheduledAt)))throw new Error('INVALID_INPUT');
  const drillEnabled=drill.enabled===true,drillDate=clean(drill.date,40)||date;
  const minutes=Number(drill.estimatedMinutes);
  if(drillEnabled&&(!validDate(drillDate)||(drill.estimatedMinutes!==undefined&&(!Number.isFinite(minutes)||minutes<0||minutes>1440))))throw new Error('INVALID_INPUT');
  return {
    subject,
    wrongAnswer:{
      date,source,question,
      wrongJudgment:clean(wrong.wrongJudgment,5000),missedCue:clean(wrong.missedCue,5000),
      correction:clean(wrong.correction,5000),bottleneck:clean(wrong.bottleneck,120),nextAction:clean(wrong.nextAction,5000),
    },
    coreRule:{mode:coreMode,id:clean(core.id,100)||undefined,title:clean(core.title,240)||undefined,content:clean(core.content,5000)||undefined,tags:safeTags(core.tags)},
    archive:{mode:archiveMode,id:clean(archive.id,100)||undefined},
    review:{enabled:reviewEnabled,scheduledAt:scheduledAt||undefined,notes:clean(review.notes,3000)||undefined},
    drill:{enabled:drillEnabled,title:clean(drill.title,240)||undefined,date:drillDate,estimatedMinutes:drillEnabled?Math.round(minutes||0):0},
  };
}

async function validateRelations(db:D1Database,userId:number,input:NormalizedInput){
  const code=subjectCode(input.subject);
  if(input.coreRule.mode==='existing'){
    if(!input.coreRule.id||!code)throw new Error('INVALID_CORE_RULE');
    const row=await db.prepare('SELECT subject FROM core_rules WHERE id=? AND user_id=?').bind(input.coreRule.id,userId).first<{subject:string}>();
    if(!row||row.subject!==code)throw new Error('INVALID_CORE_RULE');
  }
  if(input.coreRule.mode==='new'&&(!code||!input.coreRule.title||!input.coreRule.content))throw new Error('INVALID_CORE_RULE');
  if(input.archive.mode==='existing'){
    if(!input.archive.id||!code)throw new Error('INVALID_ARCHIVE');
    const row=await db.prepare('SELECT subject FROM archive_entries WHERE id=? AND user_id=?').bind(input.archive.id,userId).first<{subject:string}>();
    if(!row||row.subject!==code)throw new Error('INVALID_ARCHIVE');
  }
}

const wrongAnswerRecord=(input:NormalizedInput,id:string)=>({
  id,date:input.wrongAnswer.date.slice(0,10),subject:input.subject,source:input.wrongAnswer.source,question:input.wrongAnswer.question,
  wrongJudgment:input.wrongAnswer.wrongJudgment,missedCue:input.wrongAnswer.missedCue,correction:input.wrongAnswer.correction,
  transfer:input.wrongAnswer.nextAction,bottleneck:input.wrongAnswer.bottleneck||undefined,retries:retryPlan(input.wrongAnswer.date),
});
const drillRecord=(input:NormalizedInput,id:string)=>({
  id,date:(input.drill.date||input.wrongAnswer.date).slice(0,10),subject:input.subject,
  title:input.drill.title||input.wrongAnswer.nextAction||input.wrongAnswer.correction||'교정 Drill',
  action:input.wrongAnswer.correction||input.wrongAnswer.nextAction,
  successCriterion:input.wrongAnswer.nextAction||'다음 문제에서 교정 행동을 재현한다.',
  minutes:input.drill.estimatedMinutes||0,done:false,reflection:'',
});

function responseBody(progress:Progress,requestId:string,data:JsonRecord,recovered:boolean){
  return {
    ok:true,requestId,wrongAnswerId:progress.wrongAnswerId,coreRuleId:progress.coreRuleId,archiveEntryId:progress.archiveEntryId,
    reviewId:progress.reviewId,drillId:progress.drillId,recovered,data,
  };
}

export async function handleQuickCapture(request:Request,env:Env,user:User,origin:string,h:Tools):Promise<Response|null>{
  if(request.method!=='POST'||new URL(request.url).pathname!=='/api/learning-intelligence/quick-capture')return null;
  if(!user)return h.json({error:'Unauthorized'},401,origin);
  const body=await h.boundedJson<JsonRecord>(request),requestId=clean(body.requestId,100);
  if(!requestId)return h.json({error:'Invalid quick capture'},400,origin);

  const existing=await requestRow(env.DB,user.id,requestId);
  if(existing?.status==='completed'){
    const progress=parse<Progress|null>(existing.result_json,null);
    if(progress?.wrongAnswerId){
      const data=await stateData(env.DB,user.id);
      return h.json(responseBody(progress,requestId,data,true),200,origin);
    }
  }

  let progress=parse<Progress|null>(existing?.result_json,null),incoming:NormalizedInput|null=null;
  if(!progress?.wrongAnswerId){
    try{incoming=normalizeInput(body);await validateRelations(env.DB,user.id,incoming)}
    catch(cause){
      const message=cause instanceof Error&&cause.message==='INVALID_CORE_RULE'?'Core Rule을 확인해 주세요.':cause instanceof Error&&cause.message==='INVALID_ARCHIVE'?'Learning Archive 연결을 확인해 주세요.':'빠른 오답 기록 형식이 올바르지 않습니다.';
      return h.json({error:message},400,origin);
    }
    progress={
      stage:'validated',lastCompletedStage:'validated',input:incoming,wrongAnswerId:h.randomHex(16),
      coreRuleId:incoming.coreRule.mode==='existing'?incoming.coreRule.id!:incoming.coreRule.mode==='new'?h.randomHex(16):null,
      archiveEntryId:incoming.archive.mode==='existing'?incoming.archive.id!:null,
      reviewId:incoming.review.enabled?h.randomHex(16):null,
      drillId:incoming.drill.enabled?h.randomHex(16):null,
    };
    const now=new Date().toISOString();
    await env.DB.prepare(`INSERT INTO quick_capture_requests(user_id,request_id,status,result_json,created_at,updated_at)
      VALUES(?,?,'processing',?,?,?) ON CONFLICT(user_id,request_id) DO NOTHING`).bind(user.id,requestId,JSON.stringify(progress),now,now).run();
    const stored=await requestRow(env.DB,user.id,requestId);
    if(stored?.status==='completed'){
      const completed=parse<Progress|null>(stored.result_json,null);
      if(completed){const data=await stateData(env.DB,user.id);return h.json(responseBody(completed,requestId,data,true),200,origin)}
    }
    progress=parse<Progress|null>(stored?.result_json,progress)??progress;
    if(!stored?.result_json)await saveProgress(env.DB,user.id,requestId,'processing',progress);
  }

  const input=progress.input;
  try{
    await validateRelations(env.DB,user.id,input);
    let app=await stateData(env.DB,user.id);
    const wrongRows=Array.isArray(app.wrongAnswerDrills)?app.wrongAnswerDrills as JsonRecord[]:[];
    const drillRows=Array.isArray(app.dailyDrills)?app.dailyDrills as JsonRecord[]:[];
    const hasWrong=wrongRows.some(item=>clean(item.id,100)===progress.wrongAnswerId);
    const hasDrill=!progress.drillId||drillRows.some(item=>clean(item.id,100)===progress.drillId);
    if(!hasWrong||!hasDrill){
      app={...app,
        wrongAnswerDrills:hasWrong?wrongRows:[...wrongRows,wrongAnswerRecord(input,progress.wrongAnswerId)],
        dailyDrills:hasDrill?drillRows:[...drillRows,drillRecord(input,progress.drillId!)],
      };
      await writeLearningStateAndProjection(env.DB,user.id,app,new Date().toISOString());
    }
    progress={...progress,stage:'state_written',lastCompletedStage:'state_written',recovered:Boolean(existing)};
    await saveProgress(env.DB,user.id,requestId,'processing',progress);

    const statements:D1PreparedStatement[]=[],now=new Date().toISOString(),code=subjectCode(input.subject);
    if(progress.coreRuleId&&input.coreRule.mode==='new'){
      statements.push(env.DB.prepare(`INSERT OR IGNORE INTO core_rules(id,user_id,subject,title,content,tags_json,mastery_status,created_at,updated_at)
        VALUES(?,?,?,?,?,?,'input',?,?)`).bind(progress.coreRuleId,user.id,code,input.coreRule.title,input.coreRule.content,JSON.stringify(input.coreRule.tags??[]),now,now));
    }
    if(progress.coreRuleId){
      statements.push(env.DB.prepare(`INSERT INTO core_rule_wrong_answer_links(user_id,core_rule_id,wrong_answer_id,relation_type,created_at)
        VALUES(?,?,?,?,?) ON CONFLICT(core_rule_id,wrong_answer_id) DO UPDATE SET relation_type=excluded.relation_type`)
        .bind(user.id,progress.coreRuleId,progress.wrongAnswerId,'failed',now));
    }
    if(progress.archiveEntryId){
      statements.push(env.DB.prepare(`INSERT INTO archive_wrong_answer_links(archive_entry_id,user_id,wrong_answer_id,created_at)
        VALUES(?,?,?,?) ON CONFLICT(archive_entry_id) DO UPDATE SET wrong_answer_id=excluded.wrong_answer_id,created_at=excluded.created_at`)
        .bind(progress.archiveEntryId,user.id,progress.wrongAnswerId,now));
      statements.push(env.DB.prepare(`INSERT INTO core_rule_wrong_answer_links(user_id,core_rule_id,wrong_answer_id,relation_type,created_at)
        SELECT ?,l.core_rule_id,?,COALESCE(l.relation_type,'failed'),?
        FROM archive_entry_core_rules l JOIN core_rules r ON r.id=l.core_rule_id
        WHERE l.archive_entry_id=? AND r.user_id=?
        ON CONFLICT(core_rule_id,wrong_answer_id) DO UPDATE SET relation_type=excluded.relation_type`)
        .bind(user.id,progress.wrongAnswerId,now,progress.archiveEntryId,user.id));
    }
    if(progress.drillId&&progress.coreRuleId){
      statements.push(env.DB.prepare('INSERT OR IGNORE INTO core_rule_drill_links(user_id,core_rule_id,drill_id,created_at) VALUES(?,?,?,?)')
        .bind(user.id,progress.coreRuleId,progress.drillId,now));
    }
    if(progress.reviewId){
      const targetType=progress.coreRuleId?'core_rule':'wrong_answer',targetId=progress.coreRuleId??progress.wrongAnswerId;
      statements.push(env.DB.prepare(`INSERT OR IGNORE INTO learning_reviews(
        id,user_id,target_type,target_id,review_type,scheduled_at,reviewed_at,result,notes,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,NULL,'pending',?,?,?)`).bind(progress.reviewId,user.id,targetType,targetId,'retry',input.review.scheduledAt??null,input.review.notes??'',now,now));
    }
    if(statements.length)await env.DB.batch(statements);

    if(progress.coreRuleId)await recordCoreRuleEvidence(env.DB,user.id,progress.coreRuleId,'wrong_answer',progress.wrongAnswerId,'failed',now);
    if(progress.drillId&&progress.coreRuleId)await recordCoreRuleEvidence(env.DB,user.id,progress.coreRuleId,'drill',progress.drillId,'applied',now);
    if(progress.archiveEntryId){
      const linked=await env.DB.prepare(`SELECT l.core_rule_id,COALESCE(l.relation_type,'failed') relation_type
        FROM archive_entry_core_rules l JOIN core_rules r ON r.id=l.core_rule_id
        WHERE l.archive_entry_id=? AND r.user_id=?`).bind(progress.archiveEntryId,user.id).all<{core_rule_id:string;relation_type:RuleRelation}>();
      for(const row of linked.results)await recordCoreRuleEvidence(env.DB,user.id,row.core_rule_id,'wrong_answer',progress.wrongAnswerId,row.relation_type,now);
    }
    if(progress.reviewId){
      const ruleIds=progress.coreRuleId?[progress.coreRuleId]:(await env.DB.prepare('SELECT core_rule_id FROM core_rule_wrong_answer_links WHERE user_id=? AND wrong_answer_id=?').bind(user.id,progress.wrongAnswerId).all<{core_rule_id:string}>()).results.map(row=>row.core_rule_id);
      for(const ruleId of ruleIds)await recordCoreRuleEvidence(env.DB,user.id,ruleId,'review',progress.reviewId,'applied',input.review.scheduledAt??now);
    }

    progress={...progress,stage:'relations_written',lastCompletedStage:'relations_written'};
    await saveProgress(env.DB,user.id,requestId,'processing',progress);
    progress={...progress,stage:'completed'};
    await saveProgress(env.DB,user.id,requestId,'completed',progress);
    const data=await stateData(env.DB,user.id);
    return h.json(responseBody(progress,requestId,data,Boolean(existing)),existing?200:201,origin);
  }catch(cause){
    const lastCompletedStage=progress.lastCompletedStage;
    progress={...progress,stage:'failed',lastCompletedStage,recovered:Boolean(existing)};
    try{await saveProgress(env.DB,user.id,requestId,'failed',progress)}catch{/* preserve the original failure */}
    if(cause instanceof Error&&cause.message==='NO_LEARNING_STATE')return h.json({error:'학습 데이터가 아직 서버에 동기화되지 않았습니다. 잠시 후 다시 시도해 주세요.'},409,origin);
    if(cause instanceof Error&&cause.message==='INVALID_LEARNING_STATE')return h.json({error:'학습 데이터 형식이 올바르지 않습니다.'},409,origin);
    throw cause;
  }
}
