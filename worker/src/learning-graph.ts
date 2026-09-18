export type RuleRelation='derived'|'applied'|'failed'|'reinforced';
export type EvidenceSource='archive'|'wrong_answer'|'drill'|'review';
export type RuleStatus='ACTIVE'|'WATCH'|'MASTERED'|'ARCHIVED';

export type CoreRuleStats={
  evidenceCount:number;
  archiveCount:number;
  wrongAnswerCount:number;
  drillCount:number;
  derivedCount:number;
  appliedCount:number;
  failedCount:number;
  reinforcedCount:number;
  failures7d:number;
  failures30d:number;
  lastOccurrenceAt:string|null;
  lastFailureAt:string|null;
  reviewCount:number;
  reviewSuccessCount:number;
  reviewFailureCount:number;
  masteryRate:number|null;
};

const relations:RuleRelation[]=['derived','applied','failed','reinforced'];
const sourceTypes:EvidenceSource[]=['archive','wrong_answer','drill','review'];
const clean=(v:unknown,n=5000)=>typeof v==='string'?v.trim().slice(0,n):'';
const record=(v:unknown)=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
const rows=(v:unknown)=>Array.isArray(v)?v.map(record).filter(Boolean) as Record<string,unknown>[]:[];
const parse=<T>(value:unknown,fallback:T):T=>{try{return typeof value==='string'?JSON.parse(value) as T:fallback}catch{return fallback}};
const nowIso=()=>new Date().toISOString();

async function batchChunks(db:D1Database, statements:D1PreparedStatement[], size=100){
  for(let i=0;i<statements.length;i+=size)await db.batch(statements.slice(i,i+size));
}

async function ensureRelationColumn(db:D1Database){
  const cols=await db.prepare('PRAGMA table_info(archive_entry_core_rules)').all<{name:string}>();
  if(cols.results.length&&!cols.results.some(col=>col.name==='relation_type')){
    await db.prepare("ALTER TABLE archive_entry_core_rules ADD COLUMN relation_type TEXT NOT NULL DEFAULT 'derived'").run();
  }
}

async function deleteStaleWrongAnswers(db:D1Database,userId:number,current:Set<string>){
  const existing=await db.prepare('SELECT id FROM wrong_answers WHERE user_id=?').bind(userId).all<{id:string}>();
  const stale=existing.results.filter(row=>!current.has(row.id));
  const statements:D1PreparedStatement[]=[];
  for(const row of stale){
    statements.push(
      db.prepare("DELETE FROM core_rule_evidence WHERE user_id=? AND source_type='wrong_answer' AND source_id=?").bind(userId,row.id),
      db.prepare('DELETE FROM core_rule_wrong_answer_links WHERE user_id=? AND wrong_answer_id=?').bind(userId,row.id),
      db.prepare('DELETE FROM archive_wrong_answer_links WHERE user_id=? AND wrong_answer_id=?').bind(userId,row.id),
      db.prepare('DELETE FROM wrong_answers WHERE user_id=? AND id=?').bind(userId,row.id),
    );
  }
  await batchChunks(db,statements);
}

async function deleteStaleDrills(db:D1Database,userId:number,current:Set<string>){
  const existing=await db.prepare('SELECT id FROM learning_drills WHERE user_id=?').bind(userId).all<{id:string}>();
  const stale=existing.results.filter(row=>!current.has(row.id));
  const statements:D1PreparedStatement[]=[];
  for(const row of stale){
    statements.push(
      db.prepare("DELETE FROM core_rule_evidence WHERE user_id=? AND source_type='drill' AND source_id=?").bind(userId,row.id),
      db.prepare('DELETE FROM core_rule_drill_links WHERE user_id=? AND drill_id=?').bind(userId,row.id),
      db.prepare('DELETE FROM learning_drills WHERE user_id=? AND id=?').bind(userId,row.id),
    );
  }
  await batchChunks(db,statements);
}

export async function syncLearningProjection(db:D1Database,userId:number,payload:unknown,sourceUpdatedAt=nowIso()){
  const app=record(payload)??{};
  const wrong=rows(app.wrongAnswerDrills),drills=rows(app.dailyDrills),now=nowIso();
  const wrongIds=new Set<string>(),drillIds=new Set<string>(),wrongStatements:D1PreparedStatement[]=[],drillStatements:D1PreparedStatement[]=[];

  for(const item of wrong){
    const id=clean(item.id,100);if(!id)continue;wrongIds.add(id);
    wrongStatements.push(db.prepare(`INSERT INTO wrong_answers(
      user_id,id,date,subject,source,question,wrong_judgment,missed_cue,correction,transfer,bottleneck,status,
      score_id,capability_goal_id,archive_entry_id,retries_json,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id,id) DO UPDATE SET
      date=excluded.date,subject=excluded.subject,source=excluded.source,question=excluded.question,
      wrong_judgment=excluded.wrong_judgment,missed_cue=excluded.missed_cue,correction=excluded.correction,
      transfer=excluded.transfer,bottleneck=excluded.bottleneck,status=excluded.status,score_id=excluded.score_id,
      capability_goal_id=excluded.capability_goal_id,archive_entry_id=excluded.archive_entry_id,
      retries_json=excluded.retries_json,updated_at=excluded.updated_at`).bind(
        userId,id,clean(item.date,40),clean(item.subject,40),clean(item.source,240),clean(item.question,240),
        clean(item.wrongJudgment,5000),clean(item.missedCue,5000),clean(item.correction,5000),clean(item.transfer,5000),
        clean(item.bottleneck,120)||null,'active',clean(item.scoreId,100)||null,clean(item.capabilityGoalId,100)||null,
        clean(item.archiveEntryId,100)||null,JSON.stringify(Array.isArray(item.retries)?item.retries:[]),now,now
      ));
  }
  await batchChunks(db,wrongStatements);
  await deleteStaleWrongAnswers(db,userId,wrongIds);

  for(const item of drills){
    const id=clean(item.id,100);if(!id)continue;drillIds.add(id);
    drillStatements.push(db.prepare(`INSERT INTO learning_drills(
      user_id,id,date,subject,title,action,success_criterion,minutes,capability_goal_id,feedback_id,done,reflection,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id,id) DO UPDATE SET
      date=excluded.date,subject=excluded.subject,title=excluded.title,action=excluded.action,
      success_criterion=excluded.success_criterion,minutes=excluded.minutes,capability_goal_id=excluded.capability_goal_id,
      feedback_id=excluded.feedback_id,done=excluded.done,reflection=excluded.reflection,updated_at=excluded.updated_at`).bind(
        userId,id,clean(item.date,40),clean(item.subject,40),clean(item.title,240),clean(item.action,5000),
        clean(item.successCriterion,3000),Math.max(0,Math.min(1440,Number(item.minutes)||0)),
        clean(item.capabilityGoalId,100)||null,clean(item.feedbackId,100)||null,item.done===true?1:0,clean(item.reflection,5000),now,now
      ));
  }
  await batchChunks(db,drillStatements);
  await deleteStaleDrills(db,userId,drillIds);

  // Promote legacy Archive -> Wrong Answer relations after the canonical projection exists.
  await db.prepare(`INSERT INTO core_rule_wrong_answer_links(user_id,core_rule_id,wrong_answer_id,relation_type,created_at)
    SELECT w.user_id,l.core_rule_id,w.wrong_answer_id,COALESCE(l.relation_type,'failed'),w.created_at
    FROM archive_wrong_answer_links w
    JOIN archive_entry_core_rules l ON l.archive_entry_id=w.archive_entry_id
    JOIN core_rules r ON r.id=l.core_rule_id AND r.user_id=w.user_id
    JOIN wrong_answers wa ON wa.user_id=w.user_id AND wa.id=w.wrong_answer_id
    WHERE w.user_id=?
    ON CONFLICT(core_rule_id,wrong_answer_id) DO UPDATE SET relation_type=excluded.relation_type`).bind(userId).run();

  await db.prepare(`INSERT INTO learning_graph_user_state(user_id,source_updated_at,projected_at)
    VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET source_updated_at=excluded.source_updated_at,projected_at=excluded.projected_at`)
    .bind(userId,sourceUpdatedAt,now).run();
}

async function forceProjectionFromState(db:D1Database,userId:number){
  const state=await db.prepare('SELECT payload,updated_at FROM learning_state WHERE user_id=?').bind(userId).first<{payload:string;updated_at:string}>();
  if(!state)return;
  await syncLearningProjection(db,userId,parse<Record<string,unknown>>(state.payload,{}),state.updated_at);
}

export async function wrongAnswerExists(db:D1Database,userId:number,id:string){
  let row=await db.prepare('SELECT id FROM wrong_answers WHERE user_id=? AND id=?').bind(userId,id).first();
  if(row)return true;
  await forceProjectionFromState(db,userId);
  row=await db.prepare('SELECT id FROM wrong_answers WHERE user_id=? AND id=?').bind(userId,id).first();
  return Boolean(row);
}

export async function drillExists(db:D1Database,userId:number,id:string){
  let row=await db.prepare('SELECT id FROM learning_drills WHERE user_id=? AND id=?').bind(userId,id).first();
  if(row)return true;
  await forceProjectionFromState(db,userId);
  row=await db.prepare('SELECT id FROM learning_drills WHERE user_id=? AND id=?').bind(userId,id).first();
  return Boolean(row);
}

export async function recordCoreRuleEvidence(
  db:D1Database,userId:number,coreRuleId:string,sourceType:EvidenceSource,sourceId:string,
  relationType:RuleRelation,occurredAt=nowIso()
){
  if(!relations.includes(relationType)||!sourceTypes.includes(sourceType))throw new Error('INVALID_EVIDENCE');
  const createdAt=nowIso();
  await db.prepare(`INSERT INTO core_rule_evidence(
    id,user_id,core_rule_id,source_type,source_id,relation_type,occurred_at,created_at
  ) VALUES(lower(hex(randomblob(16))),?,?,?,?,?,?,?)
  ON CONFLICT(user_id,core_rule_id,source_type,source_id,relation_type)
  DO UPDATE SET occurred_at=CASE WHEN excluded.occurred_at>core_rule_evidence.occurred_at THEN excluded.occurred_at ELSE core_rule_evidence.occurred_at END`)
  .bind(userId,coreRuleId,sourceType,sourceId,relationType,occurredAt,createdAt).run();
}

export async function deleteCoreRuleEvidenceForSource(db:D1Database,userId:number,coreRuleId:string,sourceType:EvidenceSource,sourceId:string){
  await db.prepare('DELETE FROM core_rule_evidence WHERE user_id=? AND core_rule_id=? AND source_type=? AND source_id=?')
    .bind(userId,coreRuleId,sourceType,sourceId).run();
}

export async function rebuildLegacyEvidence(db:D1Database,userId:number){
  const now=nowIso();
  await db.prepare(`INSERT OR IGNORE INTO core_rule_evidence(id,user_id,core_rule_id,source_type,source_id,relation_type,occurred_at,created_at)
    SELECT lower(hex(randomblob(16))),r.user_id,l.core_rule_id,'archive',l.archive_entry_id,COALESCE(l.relation_type,'derived'),l.created_at,?
    FROM archive_entry_core_rules l JOIN core_rules r ON r.id=l.core_rule_id WHERE r.user_id=?`).bind(now,userId).run();
  await db.prepare(`INSERT OR IGNORE INTO core_rule_evidence(id,user_id,core_rule_id,source_type,source_id,relation_type,occurred_at,created_at)
    SELECT lower(hex(randomblob(16))),l.user_id,l.core_rule_id,'wrong_answer',l.wrong_answer_id,l.relation_type,l.created_at,?
    FROM core_rule_wrong_answer_links l
    JOIN wrong_answers w ON w.user_id=l.user_id AND w.id=l.wrong_answer_id
    WHERE l.user_id=?`).bind(now,userId).run();
  await db.prepare(`INSERT OR IGNORE INTO core_rule_evidence(id,user_id,core_rule_id,source_type,source_id,relation_type,occurred_at,created_at)
    SELECT lower(hex(randomblob(16))),l.user_id,l.core_rule_id,'drill',l.drill_id,'applied',l.created_at,?
    FROM core_rule_drill_links l
    JOIN learning_drills d ON d.user_id=l.user_id AND d.id=l.drill_id
    WHERE l.user_id=?`).bind(now,userId).run();
  await db.prepare(`INSERT OR IGNORE INTO core_rule_evidence(id,user_id,core_rule_id,source_type,source_id,relation_type,occurred_at,created_at)
    SELECT lower(hex(randomblob(16))),r.user_id,r.target_id,'review',r.id,
      CASE WHEN r.result='success' THEN 'reinforced' WHEN r.result='fail' THEN 'failed' ELSE 'applied' END,
      COALESCE(r.reviewed_at,r.scheduled_at,r.created_at),?
    FROM learning_reviews r JOIN core_rules c ON c.id=r.target_id AND c.user_id=r.user_id
    WHERE r.user_id=? AND r.target_type='core_rule'`).bind(now,userId).run();
  await db.prepare(`INSERT INTO learning_graph_user_state(user_id,source_updated_at,projected_at,legacy_evidence_backfilled)
    VALUES(?,COALESCE((SELECT updated_at FROM learning_state WHERE user_id=?),''),?,1)
    ON CONFLICT(user_id) DO UPDATE SET legacy_evidence_backfilled=1`).bind(userId,userId,now).run();
}

export async function ensureLearningGraphReady(db:D1Database,userId:number){
  await ensureRelationColumn(db);
  const [state,projection]=await Promise.all([
    db.prepare('SELECT payload,updated_at FROM learning_state WHERE user_id=?').bind(userId).first<{payload:string;updated_at:string}>(),
    db.prepare('SELECT source_updated_at,legacy_evidence_backfilled FROM learning_graph_user_state WHERE user_id=?').bind(userId).first<{source_updated_at:string;legacy_evidence_backfilled:number}>(),
  ]);
  if(state&&projection?.source_updated_at!==state.updated_at){
    await syncLearningProjection(db,userId,parse<Record<string,unknown>>(state.payload,{}),state.updated_at);
  }else if(state&&!projection){
    await syncLearningProjection(db,userId,parse<Record<string,unknown>>(state.payload,{}),state.updated_at);
  }
  const after=await db.prepare('SELECT legacy_evidence_backfilled FROM learning_graph_user_state WHERE user_id=?').bind(userId).first<{legacy_evidence_backfilled:number}>();
  if(!after?.legacy_evidence_backfilled)await rebuildLegacyEvidence(db,userId);
}

export const wrongAnswerDto=(r:Record<string,unknown>)=>({
  id:String(r.id),date:String(r.date??''),subject:String(r.subject??''),source:String(r.source??''),question:String(r.question??''),
  wrongJudgment:String(r.wrong_judgment??''),missedCue:String(r.missed_cue??''),correction:String(r.correction??''),
  transfer:String(r.transfer??''),bottleneck:r.bottleneck??undefined,scoreId:r.score_id??undefined,
  capabilityGoalId:r.capability_goal_id??undefined,archiveEntryId:r.archive_entry_id??undefined,
  retries:parse<unknown[]>(r.retries_json,[]),
});

export const drillDto=(r:Record<string,unknown>)=>({
  id:String(r.id),date:String(r.date??''),subject:String(r.subject??''),title:String(r.title??''),action:String(r.action??''),
  successCriterion:String(r.success_criterion??''),minutes:Number(r.minutes??0),capabilityGoalId:r.capability_goal_id??undefined,
  feedbackId:r.feedback_id??undefined,done:Boolean(r.done),reflection:String(r.reflection??''),
});

export async function getCoreRuleStats(db:D1Database,userId:number,coreRuleId:string):Promise<CoreRuleStats>{
  const now=Date.now(),cut7=new Date(now-7*86400000).toISOString(),cut30=new Date(now-30*86400000).toISOString();
  const row=await db.prepare(`SELECT
    COUNT(*) evidence_count,
    COUNT(DISTINCT CASE WHEN source_type='archive' THEN source_id END) archive_count,
    COUNT(DISTINCT CASE WHEN source_type='wrong_answer' THEN source_id END) wrong_answer_count,
    COUNT(DISTINCT CASE WHEN source_type='drill' THEN source_id END) drill_count,
    SUM(CASE WHEN relation_type='derived' THEN 1 ELSE 0 END) derived_count,
    SUM(CASE WHEN relation_type='applied' THEN 1 ELSE 0 END) applied_count,
    SUM(CASE WHEN relation_type='failed' THEN 1 ELSE 0 END) failed_count,
    SUM(CASE WHEN relation_type='reinforced' THEN 1 ELSE 0 END) reinforced_count,
    SUM(CASE WHEN relation_type='failed' AND occurred_at>=? THEN 1 ELSE 0 END) failures_7d,
    SUM(CASE WHEN relation_type='failed' AND occurred_at>=? THEN 1 ELSE 0 END) failures_30d,
    MAX(occurred_at) last_occurrence_at,
    MAX(CASE WHEN relation_type='failed' THEN occurred_at END) last_failure_at,
    COUNT(DISTINCT CASE WHEN source_type='review' THEN source_id END) review_count,
    COUNT(DISTINCT CASE WHEN source_type='review' AND relation_type='reinforced' THEN source_id END) review_success_count,
    COUNT(DISTINCT CASE WHEN source_type='review' AND relation_type='failed' THEN source_id END) review_failure_count
    FROM core_rule_evidence WHERE user_id=? AND core_rule_id=?`).bind(cut7,cut30,userId,coreRuleId).first<Record<string,unknown>>();
  const reviewCount=Number(row?.review_count??0),reviewSuccessCount=Number(row?.review_success_count??0);
  return {
    evidenceCount:Number(row?.evidence_count??0),archiveCount:Number(row?.archive_count??0),
    wrongAnswerCount:Number(row?.wrong_answer_count??0),drillCount:Number(row?.drill_count??0),
    derivedCount:Number(row?.derived_count??0),appliedCount:Number(row?.applied_count??0),
    failedCount:Number(row?.failed_count??0),reinforcedCount:Number(row?.reinforced_count??0),
    failures7d:Number(row?.failures_7d??0),failures30d:Number(row?.failures_30d??0),
    lastOccurrenceAt:row?.last_occurrence_at?String(row.last_occurrence_at):null,
    lastFailureAt:row?.last_failure_at?String(row.last_failure_at):null,
    reviewCount,reviewSuccessCount,reviewFailureCount:Number(row?.review_failure_count??0),
    masteryRate:reviewCount?reviewSuccessCount/reviewCount:null,
  };
}

export function calculateCoreRulePriority(stats:CoreRuleStats,masteryStatus:string,now=new Date()){
  let recencyWeight=0;
  if(stats.lastOccurrenceAt){
    const age=(now.getTime()-Date.parse(stats.lastOccurrenceAt))/86400000;
    recencyWeight=age<=1?10:age<=7?6:age<=30?3:0;
  }
  const raw=
    stats.failures7d*5+
    stats.failures30d*2+
    stats.wrongAnswerCount+
    stats.reviewFailureCount*2+
    recencyWeight-
    stats.reviewSuccessCount*0.5-
    (masteryStatus==='automated'?5:0);
  const priorityScore=Math.max(0,Math.round(raw));
  const status:RuleStatus=
    masteryStatus==='automated'&&stats.failures30d===0&&stats.reviewFailureCount===0&&stats.reviewSuccessCount>=2
      ?'MASTERED'
      :priorityScore>=15?'ACTIVE'
      :priorityScore>=5?'WATCH'
      :'ARCHIVED';
  return {priorityScore,status};
}

export async function listActiveCoreRules(db:D1Database,userId:number,subject:string|undefined,limit:number){
  const rows=await db.prepare(`SELECT id,subject,title,content,tags_json,mastery_status
    FROM core_rules WHERE user_id=? ${subject?'AND subject=?':''}`).bind(...(subject?[userId,subject]:[userId])).all<Record<string,unknown>>();
  const enriched=await Promise.all(rows.results.map(async rule=>{
    const stats=await getCoreRuleStats(db,userId,String(rule.id));
    const priority=calculateCoreRulePriority(stats,String(rule.mastery_status??'input'));
    return {
      id:String(rule.id),title:String(rule.title??''),subject:String(rule.subject??''),content:String(rule.content??''),
      tags:parse<string[]>(rule.tags_json,[]),masteryStatus:String(rule.mastery_status??'input'),...priority,stats,
    };
  }));
  return enriched.sort((a,b)=>b.priorityScore-a.priorityScore||String(a.id).localeCompare(String(b.id))).slice(0,limit);
}
