import {
  calculateCoreRulePriority,
  deleteCoreRuleEvidenceForSource,
  drillDto,
  drillExists,
  ensureLearningGraphReady,
  getCoreRuleStats,
  listActiveCoreRules,
  recordCoreRuleEvidence,
  type CoreRuleStats,
  type RuleRelation,
  wrongAnswerDto,
  wrongAnswerExists,
  syncLearningProjection,
} from './learning-graph.ts';

type Env={DB:D1Database};
type User={id:number}|null;
type Tools={json:(v:unknown,s?:number,o?:string)=>Response;boundedJson:<T>(r:Request,n?:number)=>Promise<T>;randomHex:(n?:number)=>string};

const clean=(v:unknown,n=1000)=>typeof v==='string'?v.trim().slice(0,n):'';
const parse=<T>(v:unknown,f:T):T=>{try{return typeof v==='string'?JSON.parse(v) as T:f}catch{return f}};
const relations:RuleRelation[]=['derived','applied','failed','reinforced'];
const error=(out:(v:unknown,s?:number)=>Response,code:string,message:string,status:number)=>out({error:message,code,message},status);

async function entryOwner(db:D1Database,id:string,userId:number){return db.prepare('SELECT id FROM archive_entries WHERE id=? AND user_id=?').bind(id,userId).first()}
async function ruleOwner(db:D1Database,id:string,userId:number){return db.prepare('SELECT id FROM core_rules WHERE id=? AND user_id=?').bind(id,userId).first()}
async function targetOwned(db:D1Database,userId:number,type:string,id:string){
  if(type==='learning_item')return Boolean(await entryOwner(db,id,userId));
  if(type==='core_rule')return Boolean(await ruleOwner(db,id,userId));
  if(type==='wrong_answer')return wrongAnswerExists(db,userId,id);
  if(type==='drill')return drillExists(db,userId,id);
  return false;
}
const coreRuleDto=(r:Record<string,unknown>)=>({
  id:String(r.id),subject:r.subject,title:r.title,content:r.content,
  tags:parse<string[]>(r.tags_json,[]),masteryStatus:r.mastery_status,
  usageCount:Number(r.usage_count??0),relationType:r.relation_type??undefined,
});
const reviewRelation=(result:string):RuleRelation=>result==='success'?'reinforced':result==='fail'?'failed':'applied';
const studyDayFormatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'});
const studyDayKey=(value:Date|string|number=new Date())=>studyDayFormatter.format(new Date(new Date(value).getTime()-6*60*60*1000));
type QueueMetadata={subject:string;title:string;reason:string;priority:number;detail:Record<string,unknown>};
const inSql=(ids:string[])=>ids.map(()=>'?').join(',');
async function resolveReviewQueueMetadata(db:D1Database,userId:number,reviews:{target_type:string;target_id:string}[]){
  const ids=(type:string)=>[...new Set(reviews.filter(review=>review.target_type===type).map(review=>review.target_id))];
  const ruleIds=ids('core_rule'),wrongIds=ids('wrong_answer'),drillIds=ids('drill'),itemIds=ids('learning_item');
  const now=new Date(),cut7=new Date(now.getTime()-7*86400000).toISOString(),cut30=new Date(now.getTime()-30*86400000).toISOString();
  const [rules,wrong,drills,items]=await Promise.all([
    ruleIds.length?db.prepare(`SELECT r.id,r.subject,r.title,r.content,r.mastery_status,COUNT(e.id) evidence_count,SUM(CASE WHEN e.source_type='archive' THEN 1 ELSE 0 END) archive_count,SUM(CASE WHEN e.source_type='wrong_answer' THEN 1 ELSE 0 END) wrong_answer_count,SUM(CASE WHEN e.source_type='drill' THEN 1 ELSE 0 END) drill_count,SUM(CASE WHEN e.relation_type='derived' THEN 1 ELSE 0 END) derived_count,SUM(CASE WHEN e.relation_type='applied' THEN 1 ELSE 0 END) applied_count,SUM(CASE WHEN e.relation_type='failed' THEN 1 ELSE 0 END) failed_count,SUM(CASE WHEN e.relation_type='reinforced' THEN 1 ELSE 0 END) reinforced_count,SUM(CASE WHEN e.relation_type='failed' AND e.occurred_at>=? THEN 1 ELSE 0 END) failures_7d,SUM(CASE WHEN e.relation_type='failed' AND e.occurred_at>=? THEN 1 ELSE 0 END) failures_30d,MAX(e.occurred_at) last_occurrence_at,MAX(CASE WHEN e.relation_type='failed' THEN e.occurred_at END) last_failure_at,COUNT(DISTINCT CASE WHEN e.source_type='review' THEN e.source_id END) review_count,COUNT(DISTINCT CASE WHEN e.source_type='review' AND e.relation_type='reinforced' THEN e.source_id END) review_success_count,COUNT(DISTINCT CASE WHEN e.source_type='review' AND e.relation_type='failed' THEN e.source_id END) review_failure_count FROM core_rules r LEFT JOIN core_rule_evidence e ON e.user_id=r.user_id AND e.core_rule_id=r.id WHERE r.user_id=? AND r.id IN (${inSql(ruleIds)}) GROUP BY r.id`).bind(cut7,cut30,userId,...ruleIds).all<Record<string,unknown>>():Promise.resolve({results:[] as Record<string,unknown>[]}),
    wrongIds.length?db.prepare(`SELECT id,subject,source,question,wrong_judgment,missed_cue,correction,transfer,bottleneck FROM wrong_answers WHERE user_id=? AND id IN (${inSql(wrongIds)})`).bind(userId,...wrongIds).all<Record<string,unknown>>():Promise.resolve({results:[] as Record<string,unknown>[]}),
    drillIds.length?db.prepare(`SELECT id,subject,title,action,success_criterion FROM learning_drills WHERE user_id=? AND id IN (${inSql(drillIds)})`).bind(userId,...drillIds).all<Record<string,unknown>>():Promise.resolve({results:[] as Record<string,unknown>[]}),
    itemIds.length?db.prepare(`SELECT id,subject,title,question_number,memo,solution_flow,bottleneck FROM archive_entries WHERE user_id=? AND id IN (${inSql(itemIds)})`).bind(userId,...itemIds).all<Record<string,unknown>>():Promise.resolve({results:[] as Record<string,unknown>[]}),
  ]);
  const output=new Map<string,QueueMetadata>();
  for(const row of rules.results){const stats:CoreRuleStats={evidenceCount:Number(row.evidence_count??0),archiveCount:Number(row.archive_count??0),wrongAnswerCount:Number(row.wrong_answer_count??0),drillCount:Number(row.drill_count??0),derivedCount:Number(row.derived_count??0),appliedCount:Number(row.applied_count??0),failedCount:Number(row.failed_count??0),reinforcedCount:Number(row.reinforced_count??0),failures7d:Number(row.failures_7d??0),failures30d:Number(row.failures_30d??0),lastOccurrenceAt:row.last_occurrence_at?String(row.last_occurrence_at):null,lastFailureAt:row.last_failure_at?String(row.last_failure_at):null,reviewCount:Number(row.review_count??0),reviewSuccessCount:Number(row.review_success_count??0),reviewFailureCount:Number(row.review_failure_count??0),masteryRate:Number(row.review_count??0)?Number(row.review_success_count??0)/Number(row.review_count??0):null};output.set(`core_rule:${row.id}`,{subject:String(row.subject),title:String(row.title),reason:String(row.content),priority:calculateCoreRulePriority(stats,String(row.mastery_status??'input')).priorityScore,detail:{content:row.content,stats}})}
  for(const row of wrong.results)output.set(`wrong_answer:${row.id}`,{subject:String(row.subject),title:String(row.question||row.source||'Wrong Answer'),reason:String(row.correction||row.wrong_judgment||''),priority:0,detail:{source:row.source,question:row.question,wrongJudgment:row.wrong_judgment,missedCue:row.missed_cue,correction:row.correction}});
  for(const row of drills.results)output.set(`drill:${row.id}`,{subject:String(row.subject),title:String(row.title||'Drill'),reason:String(row.action||''),priority:0,detail:{action:row.action,successCriterion:row.success_criterion}});
  for(const row of items.results)output.set(`learning_item:${row.id}`,{subject:String(row.subject),title:String(row.title||'Learning Archive'),reason:String(row.bottleneck||row.memo||''),priority:0,detail:{questionNumber:row.question_number,memo:row.memo,solutionFlow:row.solution_flow,bottleneck:row.bottleneck}});
  return output;
}

async function ruleIdsForTarget(db:D1Database,userId:number,type:string,id:string){
  if(type==='core_rule')return [id];
  if(type==='wrong_answer'){
    const rows=await db.prepare('SELECT core_rule_id FROM core_rule_wrong_answer_links WHERE user_id=? AND wrong_answer_id=?').bind(userId,id).all<{core_rule_id:string}>();
    return rows.results.map(row=>row.core_rule_id);
  }
  if(type==='drill'){
    const rows=await db.prepare('SELECT core_rule_id FROM core_rule_drill_links WHERE user_id=? AND drill_id=?').bind(userId,id).all<{core_rule_id:string}>();
    return rows.results.map(row=>row.core_rule_id);
  }
  if(type==='learning_item'){
    const rows=await db.prepare(`SELECT l.core_rule_id FROM archive_entry_core_rules l
      JOIN core_rules r ON r.id=l.core_rule_id WHERE l.archive_entry_id=? AND r.user_id=?`).bind(id,userId).all<{core_rule_id:string}>();
    return rows.results.map(row=>row.core_rule_id);
  }
  return [];
}

async function recordReviewEvidence(db:D1Database,userId:number,reviewId:string,targetType:string,targetId:string,result:string,occurredAt:string){
  const ids=await ruleIdsForTarget(db,userId,targetType,targetId),relation=reviewRelation(result);
  for(const ruleId of ids)await recordCoreRuleEvidence(db,userId,ruleId,'review',reviewId,relation,occurredAt);
}

export async function learningIntelligence(request:Request,env:Env,user:User,origin:string,h:Tools):Promise<Response|null>{
  const url=new URL(request.url),path=url.pathname;
  if(!path.startsWith('/api/learning-intelligence')&&!path.match(/^\/api\/core-rules\/[^/]+\/intelligence$/))return null;
  const out=(v:unknown,s=200)=>h.json(v,s,origin);
  if(!user)return error(out,'UNAUTHORIZED','Unauthorized',401);

  await ensureLearningGraphReady(env.DB,user.id);

  if(path==='/api/learning-intelligence/quick-capture'&&request.method==='POST'){
    const body=await h.boundedJson<Record<string,unknown>>(request),requestId=clean(body.requestId,100),subject=clean(body.subject,20),wrong=(body.wrongAnswer&&typeof body.wrongAnswer==='object'?body.wrongAnswer:{}) as Record<string,unknown>;
    if(!requestId||!['국어','수학','영어','탐구'].includes(subject)||!clean(wrong.source,240)||!clean(wrong.question,240)||!clean(wrong.wrongJudgment,5000)||!clean(wrong.missedCue,5000)||!clean(wrong.correction,5000))return error(out,'INVALID_QUICK_CAPTURE','빠른 오답 기록의 필수 항목을 확인해 주세요.',400);
    const now=new Date().toISOString(),existing=await env.DB.prepare('SELECT status,result_json FROM quick_capture_requests WHERE user_id=? AND request_id=?').bind(user.id,requestId).first<{status:string;result_json:string|null}>();
    let result=parse<Record<string,unknown>|null>(existing?.result_json,null);
    if(existing?.status==='completed'&&result)return out({...result,recovered:true});
    if(!result){const coreRuleId=clean(body.coreRuleId,100)||null;if(coreRuleId&&!await ruleOwner(env.DB,coreRuleId,user.id))return error(out,'INVALID_CORE_RULE','Core Rule을 찾을 수 없습니다.',404);const id=h.randomHex(16),date=clean(wrong.date,20)||studyDayKey();result={ok:true,requestId,wrongAnswerId:id,coreRuleId,data:null,wrongAnswer:{id,date,subject,source:clean(wrong.source,240),question:clean(wrong.question,240),wrongJudgment:clean(wrong.wrongJudgment,5000),missedCue:clean(wrong.missedCue,5000),correction:clean(wrong.correction,5000),transfer:clean(wrong.nextAction,5000),bottleneck:clean(wrong.bottleneck,120),retries:[3,7,14].map(days=>{const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return{id:`${days}d`,label:`${days}일 후 재도전`,dueDate:d.toISOString().slice(0,10)}})}};await env.DB.prepare("INSERT INTO quick_capture_requests(user_id,request_id,status,result_json,created_at,updated_at) VALUES(?,?, 'processing',?,?,?)").bind(user.id,requestId,JSON.stringify(result),now,now).run();}
    const state=await env.DB.prepare('SELECT payload FROM learning_state WHERE user_id=?').bind(user.id).first<{payload:string}>();if(!state)return error(out,'STATE_REQUIRED','학습 데이터를 먼저 동기화해 주세요.',409);const app=parse<Record<string,unknown>>(state.payload,{}),rows=Array.isArray(app.wrongAnswerDrills)?app.wrongAnswerDrills as Record<string,unknown>[]:[],record=result.wrongAnswer as Record<string,unknown>;
    if(!rows.some(item=>item.id===record.id)){app.wrongAnswerDrills=[record,...rows];await env.DB.prepare('INSERT INTO learning_state_history(user_id,payload,saved_at) VALUES(?,?,?)').bind(user.id,state.payload,now).run();await env.DB.prepare('UPDATE learning_state SET payload=?,updated_at=? WHERE user_id=?').bind(JSON.stringify(app),now,user.id).run();await syncLearningProjection(env.DB,user.id,app,now);}
    if(result.coreRuleId){await env.DB.prepare("INSERT INTO core_rule_wrong_answer_links(user_id,core_rule_id,wrong_answer_id,relation_type,created_at) VALUES(?,?,?,?,?) ON CONFLICT(core_rule_id,wrong_answer_id) DO NOTHING").bind(user.id,result.coreRuleId,record.id,'failed',now).run();await recordCoreRuleEvidence(env.DB,user.id,String(result.coreRuleId),'wrong_answer',String(record.id),'failed',now);}
    result.data=app;await env.DB.prepare("UPDATE quick_capture_requests SET status='completed',result_json=?,updated_at=? WHERE user_id=? AND request_id=?").bind(JSON.stringify(result),now,user.id,requestId).run();return out(result,existing?200:201);
  }

  if(path==='/api/learning-intelligence'&&request.method==='GET'){
    const [items,rules,wrong,drills,reviews]=await Promise.all([
      env.DB.prepare('SELECT COUNT(*) count FROM archive_entries WHERE user_id=?').bind(user.id).first<{count:number}>(),
      env.DB.prepare('SELECT COUNT(*) count FROM core_rules WHERE user_id=?').bind(user.id).first<{count:number}>(),
      env.DB.prepare('SELECT COUNT(*) count FROM wrong_answers WHERE user_id=?').bind(user.id).first<{count:number}>(),
      env.DB.prepare('SELECT COUNT(*) count FROM learning_drills WHERE user_id=?').bind(user.id).first<{count:number}>(),
      env.DB.prepare("SELECT COUNT(*) count,SUM(result='success') successes,SUM(result='fail') failures FROM learning_reviews WHERE user_id=?").bind(user.id).first<{count:number;successes:number;failures:number}>(),
    ]);
    return out({
      items:Number(items?.count||0),coreRules:Number(rules?.count||0),wrongAnswers:Number(wrong?.count||0),drills:Number(drills?.count||0),
      reviews:{count:Number(reviews?.count||0),successes:Number(reviews?.successes||0),failures:Number(reviews?.failures||0)},
    });
  }

  if(path==='/api/learning-intelligence/active-rules'&&request.method==='GET'){
    const subject=clean(url.searchParams.get('subject'),20)||undefined;
    if(subject&&!['korean','math','english'].includes(subject))return error(out,'INVALID_SUBJECT','지원하지 않는 과목입니다.',400);
    const raw=Number(url.searchParams.get('limit')||10),limit=Math.max(1,Math.min(30,Number.isFinite(raw)?Math.floor(raw):10));
    return out({rules:await listActiveCoreRules(env.DB,user.id,subject,limit)});
  }

  const item=path.match(/^\/api\/learning-intelligence\/items\/([^/]+)$/);
  if(item&&request.method==='GET'){
    const id=decodeURIComponent(item[1]);
    if(!await entryOwner(env.DB,id,user.id))return error(out,'NOT_FOUND','Learning Archive Entry를 찾을 수 없습니다.',404);
    const [archive,annotations,rules,reviews,wrongAnswers,drills]=await Promise.all([
      env.DB.prepare('SELECT * FROM archive_entries WHERE id=? AND user_id=?').bind(id,user.id).first(),
      env.DB.prepare('SELECT * FROM archive_annotations WHERE archive_entry_id=? ORDER BY sort_order').bind(id).all(),
      env.DB.prepare(`SELECT r.*,l.relation_type FROM core_rules r JOIN archive_entry_core_rules l ON l.core_rule_id=r.id
        WHERE l.archive_entry_id=? AND r.user_id=?`).bind(id,user.id).all<Record<string,unknown>>(),
      env.DB.prepare(`SELECT * FROM learning_reviews WHERE user_id=? AND (
        (target_type='learning_item' AND target_id=?) OR
        (target_type='core_rule' AND target_id IN(SELECT core_rule_id FROM archive_entry_core_rules WHERE archive_entry_id=?))
      ) ORDER BY COALESCE(reviewed_at,scheduled_at,created_at) DESC`).bind(user.id,id,id).all(),
      env.DB.prepare(`SELECT w.* FROM wrong_answers w JOIN archive_wrong_answer_links l
        ON l.user_id=w.user_id AND l.wrong_answer_id=w.id WHERE l.archive_entry_id=? AND w.user_id=?`).bind(id,user.id).all<Record<string,unknown>>(),
      env.DB.prepare(`SELECT d.* FROM learning_drills d JOIN core_rule_drill_links l
        ON l.user_id=d.user_id AND l.drill_id=d.id JOIN archive_entry_core_rules a ON a.core_rule_id=l.core_rule_id
        WHERE a.archive_entry_id=? AND d.user_id=? GROUP BY d.id`).bind(id,user.id).all<Record<string,unknown>>(),
    ]);
    return out({
      item:archive,archive:{...archive,annotations:annotations.results},coreRules:rules.results,
      wrongAnswers:wrongAnswers.results.map(wrongAnswerDto),drills:drills.results.map(drillDto),reviews:reviews.results,
    });
  }

  const wrong=path.match(/^\/api\/learning-intelligence\/wrong-answers\/([^/]+)$/);
  if(wrong&&request.method==='GET'){
    const id=decodeURIComponent(wrong[1]);
    if(!await wrongAnswerExists(env.DB,user.id,id))return error(out,'NOT_FOUND','Wrong Answer를 찾을 수 없습니다.',404);
    const [wrongAnswer,linked]=await Promise.all([
      env.DB.prepare('SELECT * FROM wrong_answers WHERE user_id=? AND id=?').bind(user.id,id).first<Record<string,unknown>>(),
      env.DB.prepare(`SELECT r.*,l.relation_type FROM core_rule_wrong_answer_links l JOIN core_rules r ON r.id=l.core_rule_id
        WHERE l.user_id=? AND l.wrong_answer_id=? AND r.user_id=? ORDER BY r.updated_at DESC`).bind(user.id,id,user.id).all<Record<string,unknown>>(),
    ]);
    return out({wrongAnswer:wrongAnswer?wrongAnswerDto(wrongAnswer):null,coreRules:linked.results.map(coreRuleDto)});
  }

  const rule=path.match(/^\/api\/core-rules\/([^/]+)\/intelligence$/);
  if(rule&&request.method==='GET'){
    const id=decodeURIComponent(rule[1]);
    if(!await ruleOwner(env.DB,id,user.id))return error(out,'NOT_FOUND','Core Rule을 찾을 수 없습니다.',404);
    const [coreRule,linkedItems,wrongAnswers,drills,reviews,evidence,stats]=await Promise.all([
      env.DB.prepare('SELECT * FROM core_rules WHERE id=? AND user_id=?').bind(id,user.id).first<Record<string,unknown>>(),
      env.DB.prepare(`SELECT e.*,l.relation_type FROM archive_entries e JOIN archive_entry_core_rules l ON l.archive_entry_id=e.id
        WHERE l.core_rule_id=? AND e.user_id=? ORDER BY e.studied_at DESC,e.updated_at DESC,e.id DESC`).bind(id,user.id).all(),
      env.DB.prepare(`SELECT w.*,l.relation_type FROM wrong_answers w JOIN core_rule_wrong_answer_links l
        ON l.user_id=w.user_id AND l.wrong_answer_id=w.id WHERE l.core_rule_id=? AND w.user_id=? ORDER BY w.updated_at DESC`).bind(id,user.id).all<Record<string,unknown>>(),
      env.DB.prepare(`SELECT d.* FROM learning_drills d JOIN core_rule_drill_links l
        ON l.user_id=d.user_id AND l.drill_id=d.id WHERE l.core_rule_id=? AND d.user_id=? ORDER BY d.updated_at DESC`).bind(id,user.id).all<Record<string,unknown>>(),
      env.DB.prepare(`SELECT * FROM learning_reviews WHERE user_id=? AND target_type='core_rule' AND target_id=?
        ORDER BY COALESCE(reviewed_at,scheduled_at,created_at) DESC`).bind(user.id,id).all(),
      env.DB.prepare(`SELECT source_type,source_id,relation_type,occurred_at,created_at FROM core_rule_evidence
        WHERE user_id=? AND core_rule_id=? ORDER BY occurred_at DESC,created_at DESC LIMIT 100`).bind(user.id,id).all<Record<string,unknown>>(),
      getCoreRuleStats(env.DB,user.id,id),
    ]);
    const priority=calculateCoreRulePriority(stats,String(coreRule?.mastery_status??'input'));
    return out({
      coreRule:coreRule?coreRuleDto(coreRule):null,linkedItems:linkedItems.results,
      wrongAnswers:wrongAnswers.results.map(row=>({...wrongAnswerDto(row),relationType:row.relation_type})),
      drills:drills.results.map(drillDto),reviews:reviews.results,
      evidence:evidence.results.map(row=>({sourceType:row.source_type,sourceId:row.source_id,relationType:row.relation_type,occurredAt:row.occurred_at,createdAt:row.created_at})),
      stats:{...stats,linkedItems:linkedItems.results.length,...priority},
      priorityScore:priority.priorityScore,status:priority.status,
    });
  }

  if(path==='/api/learning-intelligence/wrong-answer-links'&&request.method==='POST'){
    const b=await h.boundedJson<Record<string,unknown>>(request),ruleId=clean(b.coreRuleId,80),wrongId=clean(b.wrongAnswerId,100),relation=(clean(b.relationType,20)||'failed') as RuleRelation;
    if(!relations.includes(relation))return error(out,'INVALID_RELATION','지원하지 않는 관계 유형입니다.',400);
    if(!await ruleOwner(env.DB,ruleId,user.id)||!await wrongAnswerExists(env.DB,user.id,wrongId))return error(out,'NOT_FOUND','연결 대상을 찾을 수 없습니다.',404);
    const now=new Date().toISOString();
    await env.DB.prepare(`INSERT INTO core_rule_wrong_answer_links(user_id,core_rule_id,wrong_answer_id,relation_type,created_at)
      VALUES(?,?,?,?,?) ON CONFLICT(core_rule_id,wrong_answer_id) DO UPDATE SET relation_type=excluded.relation_type`)
      .bind(user.id,ruleId,wrongId,relation,now).run();
    await recordCoreRuleEvidence(env.DB,user.id,ruleId,'wrong_answer',wrongId,relation,now);
    return out({ok:true},201);
  }

  const wrongRuleLink=path.match(/^\/api\/learning-intelligence\/wrong-answer-links\/([^/]+)\/([^/]+)$/);
  if(wrongRuleLink&&request.method==='DELETE'){
    const ruleId=decodeURIComponent(wrongRuleLink[1]),wrongId=decodeURIComponent(wrongRuleLink[2]);
    if(!await ruleOwner(env.DB,ruleId,user.id))return error(out,'NOT_FOUND','Core Rule을 찾을 수 없습니다.',404);
    await env.DB.prepare('DELETE FROM core_rule_wrong_answer_links WHERE user_id=? AND core_rule_id=? AND wrong_answer_id=?').bind(user.id,ruleId,wrongId).run();
    await deleteCoreRuleEvidenceForSource(env.DB,user.id,ruleId,'wrong_answer',wrongId);
    return out({ok:true});
  }

  if(path==='/api/learning-intelligence/drill-links'&&request.method==='POST'){
    const b=await h.boundedJson<Record<string,unknown>>(request),ruleId=clean(b.coreRuleId,80),drillId=clean(b.drillId,100),relation=(clean(b.relationType,20)||'applied') as RuleRelation;
    if(!relations.includes(relation))return error(out,'INVALID_RELATION','지원하지 않는 관계 유형입니다.',400);
    if(!await ruleOwner(env.DB,ruleId,user.id)||!await drillExists(env.DB,user.id,drillId))return error(out,'NOT_FOUND','연결 대상을 찾을 수 없습니다.',404);
    const now=new Date().toISOString();
    await env.DB.prepare('INSERT OR IGNORE INTO core_rule_drill_links(user_id,core_rule_id,drill_id,created_at) VALUES(?,?,?,?)').bind(user.id,ruleId,drillId,now).run();
    await recordCoreRuleEvidence(env.DB,user.id,ruleId,'drill',drillId,relation,now);
    return out({ok:true},201);
  }

  const drillLink=path.match(/^\/api\/learning-intelligence\/drill-links\/([^/]+)\/([^/]+)$/);
  if(drillLink&&request.method==='DELETE'){
    const ruleId=decodeURIComponent(drillLink[1]),drillId=decodeURIComponent(drillLink[2]);
    if(!await ruleOwner(env.DB,ruleId,user.id))return error(out,'NOT_FOUND','Core Rule을 찾을 수 없습니다.',404);
    await env.DB.prepare('DELETE FROM core_rule_drill_links WHERE user_id=? AND core_rule_id=? AND drill_id=?').bind(user.id,ruleId,drillId).run();
    await deleteCoreRuleEvidenceForSource(env.DB,user.id,ruleId,'drill',drillId);
    return out({ok:true});
  }

  if(path==='/api/learning-intelligence/reviews'&&request.method==='GET'&&url.searchParams.get('view')==='queue'){
    const rawLimit=Number(url.searchParams.get('limit')||200),limit=Math.max(1,Math.min(500,Number.isFinite(rawLimit)?Math.floor(rawLimit):200));
    const rows=await env.DB.prepare(`SELECT id,target_type,target_id,scheduled_at,reviewed_at,result,notes FROM learning_reviews WHERE user_id=? AND result='pending' AND scheduled_at IS NOT NULL ORDER BY scheduled_at ASC,id ASC LIMIT ?`).bind(user.id,limit).all<Record<string,unknown>>();
    const metadata=await resolveReviewQueueMetadata(env.DB,user.id,rows.results as {target_type:string;target_id:string}[]),today=studyDayKey();
    const item=(row:Record<string,unknown>)=>{const meta=metadata.get(`${row.target_type}:${row.target_id}`)??{subject:'',title:'Unavailable target',reason:'',priority:0,detail:{}};return {id:String(row.id),targetType:String(row.target_type),targetId:String(row.target_id),subject:meta.subject,title:meta.title,reason:meta.reason,scheduledAt:String(row.scheduled_at),reviewedAt:row.reviewed_at??null,result:String(row.result),priority:meta.priority,notes:String(row.notes??''),detail:meta.detail}};
    const queue={overdue:[] as ReturnType<typeof item>[],today:[] as ReturnType<typeof item>[],upcoming:[] as ReturnType<typeof item>[]};
    for(const row of rows.results){const review=item(row),day=studyDayKey(review.scheduledAt);if(day<today)queue.overdue.push(review);else if(day===today)queue.today.push(review);else queue.upcoming.push(review);}
    for(const bucket of Object.values(queue))bucket.sort((a,b)=>b.priority-a.priority||a.scheduledAt.localeCompare(b.scheduledAt)||a.id.localeCompare(b.id));
    return out({...queue,counts:{overdue:queue.overdue.length,today:queue.today.length,upcoming:queue.upcoming.length,due:queue.overdue.length+queue.today.length}});
  }

  if(path==='/api/learning-intelligence/reviews'&&request.method==='POST'){
    const b=await h.boundedJson<Record<string,unknown>>(request),type=clean(b.targetType,30),id=clean(b.targetId,100),result=clean(b.result,20)||'pending';
    if(!['wrong_answer','core_rule','drill','learning_item'].includes(type)||!['pending','success','fail'].includes(result)||!await targetOwned(env.DB,user.id,type,id))
      return error(out,'INVALID_REVIEW_TARGET','올바른 Review 대상이 아닙니다.',400);
    const now=new Date().toISOString(),reviewed=result==='pending'?null:now,reviewId=h.randomHex(16);
    await env.DB.prepare(`INSERT INTO learning_reviews(
      id,user_id,target_type,target_id,review_type,scheduled_at,reviewed_at,result,notes,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(
      reviewId,user.id,type,id,clean(b.reviewType,40)||'retry',clean(b.scheduledAt,40)||null,reviewed,result,clean(b.notes,3000),now,now
    ).run();
    await recordReviewEvidence(env.DB,user.id,reviewId,type,id,result,reviewed||clean(b.scheduledAt,40)||now);
    return out({ok:true,id:reviewId},201);
  }

  const review=path.match(/^\/api\/learning-intelligence\/reviews\/([^/]+)$/);
  if(review){
    const reviewId=decodeURIComponent(review[1]);
    const existing=await env.DB.prepare('SELECT id,target_type,target_id FROM learning_reviews WHERE id=? AND user_id=?').bind(reviewId,user.id).first<{id:string;target_type:string;target_id:string}>();
    if(!existing)return error(out,'NOT_FOUND','Review를 찾을 수 없습니다.',404);
    if(request.method==='PATCH'){
      const b=await h.boundedJson<Record<string,unknown>>(request),result=clean(b.result,20);
      if(!['pending','success','fail'].includes(result))return error(out,'INVALID_REVIEW_RESULT','올바른 Review 결과가 아닙니다.',400);
      const now=new Date().toISOString(),reviewed=result==='pending'?null:clean(b.reviewedAt,40)||now;
      await env.DB.prepare(`UPDATE learning_reviews SET result=?,notes=?,scheduled_at=COALESCE(?,scheduled_at),reviewed_at=?,updated_at=?
        WHERE id=? AND user_id=?`).bind(result,clean(b.notes,3000),clean(b.scheduledAt,40)||null,reviewed,now,reviewId,user.id).run();
      await env.DB.prepare("DELETE FROM core_rule_evidence WHERE user_id=? AND source_type='review' AND source_id=?").bind(user.id,reviewId).run();
      await recordReviewEvidence(env.DB,user.id,reviewId,existing.target_type,existing.target_id,result,reviewed||now);
      return out({ok:true,reviewedAt:reviewed,updatedAt:now});
    }
    if(request.method==='DELETE'){
      await env.DB.batch([
        env.DB.prepare("DELETE FROM core_rule_evidence WHERE user_id=? AND source_type='review' AND source_id=?").bind(user.id,reviewId),
        env.DB.prepare('DELETE FROM learning_reviews WHERE id=? AND user_id=?').bind(reviewId,user.id),
      ]);
      return out({ok:true});
    }
  }

  return error(out,'NOT_FOUND','요청한 Learning Intelligence API를 찾을 수 없습니다.',404);
}
