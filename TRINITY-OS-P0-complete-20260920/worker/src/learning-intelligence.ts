import {
  calculateCoreRulePriority,
  deleteCoreRuleEvidenceForSource,
  drillDto,
  drillExists,
  ensureLearningGraphReady,
  getCoreRuleStats,
  getCoreRuleStatsBatch,
  listActiveCoreRules,
  recordCoreRuleEvidence,
  type RuleRelation,
  wrongAnswerDto,
  wrongAnswerExists,
} from './learning-graph.ts';
import { handleQuickCapture } from './quick-capture.ts';

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

const subjectLabel=(subject:unknown)=>subject==='korean'?'국어':subject==='math'?'수학':subject==='english'?'영어':String(subject??'');
const learningDayKey=(value:Date|string|number=new Date())=>{
  const date=value instanceof Date?value:new Date(value);
  return new Date(date.getTime()+3*3_600_000).toISOString().slice(0,10);
};
const addStudyDays=(key:string,days:number)=>{const date=new Date(`${key}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10)};
const placeholders=(items:string[])=>items.map(()=>'?').join(',');

type ReviewRow=Record<string,unknown>&{id:string;target_type:string;target_id:string;scheduled_at:string|null;reviewed_at:string|null;result:string;previous_result?:string|null};
type ReviewMeta={title:string;subject:string;reason:string;priority:number;detail:Record<string,unknown>};

async function reviewIntervals(db:D1Database,userId:number){
  const row=await db.prepare('SELECT intervals_json FROM archive_review_settings WHERE user_id=?').bind(userId).first<{intervals_json:string}>();
  const values=parse<number[]>(row?.intervals_json??'[3,7,14,30]',[3,7,14,30]).map(Number).filter(value=>Number.isInteger(value)&&value>0&&value<=365).slice(0,10);
  return values.length?values:[3,7,14,30];
}

async function scheduleNextReview(db:D1Database,userId:number,targetType:string,targetId:string,result:string,now:string,h:Tools){
  if(result!=='success'&&result!=='fail')return null;
  const intervals=await reviewIntervals(db,userId);
  let days=intervals[0]??3;
  if(result==='success'){
    const row=await db.prepare("SELECT COUNT(*) count FROM learning_reviews WHERE user_id=? AND target_type=? AND target_id=? AND result='success'").bind(userId,targetType,targetId).first<{count:number}>();
    const successCount=Math.max(1,Number(row?.count??1));
    days=intervals[Math.min(successCount,intervals.length-1)]??intervals.at(-1)??7;
  }
  const scheduledAt=addStudyDays(learningDayKey(now),days),stamp=new Date().toISOString();
  const existing=await db.prepare("SELECT id FROM learning_reviews WHERE user_id=? AND target_type=? AND target_id=? AND result='pending' ORDER BY COALESCE(scheduled_at,created_at) ASC LIMIT 1")
    .bind(userId,targetType,targetId).first<{id:string}>();
  if(existing){await db.prepare('UPDATE learning_reviews SET scheduled_at=?,updated_at=? WHERE id=? AND user_id=?').bind(scheduledAt,stamp,existing.id,userId).run();return {id:existing.id,scheduledAt}}
  const id=h.randomHex(16);
  await db.prepare(`INSERT INTO learning_reviews(id,user_id,target_type,target_id,review_type,scheduled_at,reviewed_at,result,notes,created_at,updated_at)
    VALUES(?,?,?,?,?,?,NULL,'pending','',?,?)`).bind(id,userId,targetType,targetId,'scheduled',scheduledAt,stamp,stamp).run();
  return {id,scheduledAt};
}

async function batchByIds(db:D1Database,sqlPrefix:string,userId:number,ids:string[]){
  const unique=[...new Set(ids.filter(Boolean))];
  if(!unique.length)return [] as Record<string,unknown>[];
  const rows=await db.prepare(`${sqlPrefix} (${placeholders(unique)})`).bind(userId,...unique).all<Record<string,unknown>>();
  return rows.results;
}

async function reviewQueue(db:D1Database,userId:number){
  const intervals=await reviewIntervals(db,userId),firstDays=intervals[0]??3,now=new Date().toISOString();
  // Archive entries linked to Core Rules historically appeared in Review without a dedicated learning_reviews row.
  // Reconcile only items with no review history; completed items are rescheduled by the result endpoint.
  const uncovered=await db.prepare(`SELECT e.id,e.studied_at FROM archive_entries e
    WHERE e.user_id=? AND (e.review_enabled=1 OR EXISTS(SELECT 1 FROM archive_entry_core_rules l WHERE l.archive_entry_id=e.id))
      AND NOT EXISTS(SELECT 1 FROM learning_reviews r WHERE r.user_id=e.user_id AND r.target_type='learning_item' AND r.target_id=e.id)`)
    .bind(userId).all<{id:string;studied_at:string}>();
  if(uncovered.results.length){
    const statements=uncovered.results.map(entry=>db.prepare(`INSERT OR IGNORE INTO learning_reviews(
      id,user_id,target_type,target_id,review_type,scheduled_at,reviewed_at,result,notes,created_at,updated_at
    ) VALUES(lower(hex(randomblob(16))),?,'learning_item',?,'archive',?,NULL,'pending','',?,?)`)
      .bind(userId,entry.id,addStudyDays(String(entry.studied_at).slice(0,10),firstDays),now,now));
    await db.batch(statements);
  }
  const pending=await db.prepare(`SELECT r.*,
    (SELECT p.result FROM learning_reviews p WHERE p.user_id=r.user_id AND p.target_type=r.target_type AND p.target_id=r.target_id
      AND p.id<>r.id AND p.result IN ('success','fail') ORDER BY COALESCE(p.reviewed_at,p.updated_at,p.created_at) DESC LIMIT 1) previous_result
    FROM learning_reviews r WHERE r.user_id=? AND r.result='pending' ORDER BY COALESCE(r.scheduled_at,r.created_at) ASC LIMIT 500`).bind(userId).all<ReviewRow>();
  const rows=pending.results;
  const idsByType={
    core_rule:rows.filter(row=>row.target_type==='core_rule').map(row=>String(row.target_id)),
    wrong_answer:rows.filter(row=>row.target_type==='wrong_answer').map(row=>String(row.target_id)),
    drill:rows.filter(row=>row.target_type==='drill').map(row=>String(row.target_id)),
    learning_item:rows.filter(row=>row.target_type==='learning_item').map(row=>String(row.target_id)),
  };
  const [coreRows,wrongRows,drillRows,itemRows,wrongLinks,drillLinks,itemLinks]=await Promise.all([
    batchByIds(db,'SELECT id,subject,title,content,mastery_status FROM core_rules WHERE user_id=? AND id IN',userId,idsByType.core_rule),
    batchByIds(db,'SELECT id,subject,source,question,wrong_judgment,missed_cue,correction,transfer,bottleneck FROM wrong_answers WHERE user_id=? AND id IN',userId,idsByType.wrong_answer),
    batchByIds(db,'SELECT id,subject,title,action,success_criterion,reflection,done FROM learning_drills WHERE user_id=? AND id IN',userId,idsByType.drill),
    batchByIds(db,'SELECT id,subject,title,exam_name,source_name,question_number,memo,condition_summary,first_thought,bottleneck,transfer,main_idea,structure_summary,key_expression FROM archive_entries WHERE user_id=? AND id IN',userId,idsByType.learning_item),
    batchByIds(db,'SELECT wrong_answer_id id,core_rule_id FROM core_rule_wrong_answer_links WHERE user_id=? AND wrong_answer_id IN',userId,idsByType.wrong_answer),
    batchByIds(db,'SELECT drill_id id,core_rule_id FROM core_rule_drill_links WHERE user_id=? AND drill_id IN',userId,idsByType.drill),
    idsByType.learning_item.length?db.prepare(`SELECT l.archive_entry_id id,l.core_rule_id FROM archive_entry_core_rules l JOIN archive_entries e ON e.id=l.archive_entry_id WHERE e.user_id=? AND l.archive_entry_id IN (${placeholders([...new Set(idsByType.learning_item)])})`).bind(userId,...[...new Set(idsByType.learning_item)]).all<Record<string,unknown>>().then(result=>result.results):Promise.resolve([] as Record<string,unknown>[]),
  ]);
  const relationMap=new Map<string,string[]>();
  for(const [type,links] of [['wrong_answer',wrongLinks],['drill',drillLinks],['learning_item',itemLinks]] as const){
    for(const row of links){const key=`${type}:${String(row.id)}`,current=relationMap.get(key)??[];current.push(String(row.core_rule_id));relationMap.set(key,current)}
  }
  const allRuleIds=[...new Set([...idsByType.core_rule,...[...relationMap.values()].flat()])];
  const ruleMetaRows=allRuleIds.length?await batchByIds(db,'SELECT id,subject,title,content,mastery_status FROM core_rules WHERE user_id=? AND id IN',userId,allRuleIds):[];
  const statsByRule=await getCoreRuleStatsBatch(db,userId,allRuleIds),priorityByRule=new Map<string,number>();
  for(const row of ruleMetaRows){const id=String(row.id),stats=statsByRule.get(id)!;priorityByRule.set(id,calculateCoreRulePriority(stats,String(row.mastery_status??'input')).priorityScore)}
  const priorityFor=(type:string,id:string)=>type==='core_rule'?(priorityByRule.get(id)??0):Math.max(0,...(relationMap.get(`${type}:${id}`)??[]).map(ruleId=>priorityByRule.get(ruleId)??0));
  const meta=new Map<string,ReviewMeta>();
  for(const row of coreRows){const id=String(row.id),stats=statsByRule.get(id),priority=priorityByRule.get(id)??0;meta.set(`core_rule:${id}`,{title:String(row.title??'Core Rule'),subject:subjectLabel(row.subject),reason:'Core Rule 판단 기준 재현',priority,detail:{content:String(row.content??''),failures7d:stats?.failures7d??0,lastFailureAt:stats?.lastFailureAt??null,masteryStatus:row.mastery_status}})}
  for(const row of wrongRows){const id=String(row.id);meta.set(`wrong_answer:${id}`,{title:String(row.question||row.source||'Wrong Answer'),subject:String(row.subject??''),reason:'오답의 교정 행동 재현',priority:priorityFor('wrong_answer',id),detail:{source:row.source,wrongJudgment:row.wrong_judgment,missedCue:row.missed_cue,correction:row.correction,transfer:row.transfer,bottleneck:row.bottleneck}})}
  for(const row of drillRows){const id=String(row.id);meta.set(`drill:${id}`,{title:String(row.title||'Drill'),subject:String(row.subject??''),reason:'교정 Drill 성공 기준 재현',priority:priorityFor('drill',id),detail:{action:row.action,successCriterion:row.success_criterion,reflection:row.reflection,done:Boolean(row.done)}})}
  for(const row of itemRows){const id=String(row.id);meta.set(`learning_item:${id}`,{title:String(row.title||'Learning Archive'),subject:subjectLabel(row.subject),reason:'Archive의 판단 기준 재현',priority:priorityFor('learning_item',id),detail:{examName:row.exam_name,sourceName:row.source_name,questionNumber:row.question_number,memo:row.memo,conditionSummary:row.condition_summary,firstThought:row.first_thought,bottleneck:row.bottleneck,transfer:row.transfer,mainIdea:row.main_idea,structureSummary:row.structure_summary,keyExpression:row.key_expression}})}
  const today=learningDayKey();
  const items=rows.map(row=>{
    const targetType=String(row.target_type),targetId=String(row.target_id),value=meta.get(`${targetType}:${targetId}`)??{title:'삭제되었거나 찾을 수 없는 학습 항목',subject:'',reason:'Review 대상 확인 필요',priority:0,detail:{missing:true}};
    const scheduledAt=row.scheduled_at?String(row.scheduled_at):null,dueKey=scheduledAt?learningDayKey(scheduledAt):today;
    const bucket=dueKey<today?'overdue':dueKey===today?'today':'upcoming';
    return {id:String(row.id),targetType,targetId,reviewType:String(row.review_type??'retry'),scheduledAt,reviewedAt:row.reviewed_at?String(row.reviewed_at):null,result:String(row.result),notes:String(row.notes??''),previousResult:row.previous_result?String(row.previous_result):null,createdAt:String(row.created_at??''),updatedAt:String(row.updated_at??''),bucket,...value};
  });
  const sortDue=(a:any,b:any)=>String(a.scheduledAt??'').localeCompare(String(b.scheduledAt??''))||b.priority-a.priority;
  const sortToday=(a:any,b:any)=>b.priority-a.priority||String(a.scheduledAt??'').localeCompare(String(b.scheduledAt??''));
  const overdue=items.filter(item=>item.bucket==='overdue').sort(sortDue),todayItems=items.filter(item=>item.bucket==='today').sort(sortToday),upcoming=items.filter(item=>item.bucket==='upcoming').sort(sortDue);
  return {studyDay:today,counts:{overdue:overdue.length,today:todayItems.length,upcoming:upcoming.length,due:overdue.length+todayItems.length},overdue,today:todayItems,upcoming};
}

export async function learningIntelligence(request:Request,env:Env,user:User,origin:string,h:Tools):Promise<Response|null>{
  const quickCapture=await handleQuickCapture(request,env,user,origin,h);
  if(quickCapture)return quickCapture;
  const url=new URL(request.url),path=url.pathname;
  if(!path.startsWith('/api/learning-intelligence')&&!path.match(/^\/api\/core-rules\/[^/]+\/intelligence$/))return null;
  const out=(v:unknown,s=200)=>h.json(v,s,origin);
  if(!user)return error(out,'UNAUTHORIZED','Unauthorized',401);

  await ensureLearningGraphReady(env.DB,user.id);

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
      ) ORDER BY CASE WHEN result='pending' THEN 1 ELSE 0 END, COALESCE(reviewed_at,scheduled_at,created_at) DESC`).bind(user.id,id,id).all(),
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
        ORDER BY CASE WHEN result='pending' THEN 1 ELSE 0 END, COALESCE(reviewed_at,scheduled_at,created_at) DESC`).bind(user.id,id).all(),
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
    return out(await reviewQueue(env.DB,user.id));
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
    const nextReview=result==='pending'?null:await scheduleNextReview(env.DB,user.id,type,id,result,reviewed||now,h);
    return out({ok:true,id:reviewId,nextReview},201);
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
      const nextReview=result==='pending'?null:await scheduleNextReview(env.DB,user.id,existing.target_type,existing.target_id,result,reviewed||now,h);
      return out({ok:true,reviewedAt:reviewed,updatedAt:now,nextReview});
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
