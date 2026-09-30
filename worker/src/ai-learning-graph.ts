import { aiService, type AIServiceConfig } from './lib/ai/service.ts';
import { AIProviderError, type ChatMessage } from './lib/ai/types.ts';
import { ensureLearningGraphReady, wrongAnswerDto } from './learning-graph.ts';

type Env={DB:D1Database};
type User={id:number;username:string}|null;
type Tools={
  json:(v:unknown,s?:number,o?:string,extra?:HeadersInit)=>Response;
  boundedJson:<T>(r:Request,n?:number)=>Promise<T>;
  sha256:(v:string)=>Promise<string>;
  randomHex:(n?:number)=>string;
  config:AIServiceConfig;
};

type RawLink={sourceId?:unknown;targetId?:unknown;relationType?:unknown;score?:unknown;rationale?:unknown};
type RawPattern={name?:unknown;evidenceIds?:unknown;explanation?:unknown};
type RawRecommendation={title?:unknown;reason?:unknown;action?:unknown;successCriterion?:unknown;priority?:unknown;wrongAnswerIds?:unknown};
export type AIWrongAnswerAnalysis={
  summary:string;
  patterns:Array<{name:string;evidenceIds:string[];explanation:string}>;
  links:Array<{sourceId:string;targetId:string;relationType:string;score:number;rationale:string}>;
  recommendations:Array<{title:string;reason:string;action:string;successCriterion:string;priority:number;wrongAnswerIds:string[]}>;
};

const relationTypes=['same_bottleneck','same_missed_cue','same_judgment','same_concept','same_correction','transfer'] as const;
const clean=(v:unknown,n=800)=>typeof v==='string'?v.trim().slice(0,n):'';
const obj=(v:unknown):Record<string,unknown>|null=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
const boundedNumber=(v:unknown,min:number,max:number,fallback:number)=>{const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback};
const unique=(values:string[])=>[...new Set(values)];

function parseJsonObject(raw:string):Record<string,unknown>{
  const trimmed=raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try{const value=JSON.parse(trimmed);const record=obj(value);if(record)return record}catch{/* fallback below */}
  const start=trimmed.indexOf('{'),end=trimmed.lastIndexOf('}');
  if(start>=0&&end>start){const value=JSON.parse(trimmed.slice(start,end+1));const record=obj(value);if(record)return record}
  throw new AIProviderError('AI learning graph response was not valid JSON.',502,'AI_INVALID_RESPONSE');
}

export function sanitizeLearningGraphAnalysis(raw:unknown,knownIds:Iterable<string>):AIWrongAnswerAnalysis{
  const value=obj(raw)??{},ids=new Set(knownIds);
  const links:Array<AIWrongAnswerAnalysis['links'][number]> = [];
  const seen=new Set<string>();
  for(const row of Array.isArray(value.links)?value.links as RawLink[]:[]){
    const a=clean(row?.sourceId,100),b=clean(row?.targetId,100),relation=clean(row?.relationType,40);
    if(!a||!b||a===b||!ids.has(a)||!ids.has(b)||!relationTypes.includes(relation as typeof relationTypes[number]))continue;
    const [sourceId,targetId]=a<b?[a,b]:[b,a],key=`${sourceId}:${targetId}`;
    if(seen.has(key))continue;seen.add(key);
    links.push({sourceId,targetId,relationType:relation,score:boundedNumber(row?.score,0,1,0.5),rationale:clean(row?.rationale,500)});
    if(links.length>=80)break;
  }
  const patterns=(Array.isArray(value.patterns)?value.patterns as RawPattern[]:[]).slice(0,8).map(row=>({
    name:clean(row?.name,120),
    evidenceIds:unique((Array.isArray(row?.evidenceIds)?row.evidenceIds:[]).map(id=>clean(id,100)).filter(id=>ids.has(id))).slice(0,12),
    explanation:clean(row?.explanation,600),
  })).filter(row=>row.name&&row.evidenceIds.length);
  const recommendations=(Array.isArray(value.recommendations)?value.recommendations as RawRecommendation[]:[]).slice(0,6).map(row=>({
    title:clean(row?.title,160),reason:clean(row?.reason,700),action:clean(row?.action,700),successCriterion:clean(row?.successCriterion,500),
    priority:Math.round(boundedNumber(row?.priority,0,100,50)),
    wrongAnswerIds:unique((Array.isArray(row?.wrongAnswerIds)?row.wrongAnswerIds:[]).map(id=>clean(id,100)).filter(id=>ids.has(id))).slice(0,12),
  })).filter(row=>row.title&&row.action&&row.wrongAnswerIds.length).sort((a,b)=>b.priority-a.priority);
  return {summary:clean(value.summary,1200),patterns,links,recommendations};
}

async function ensureTables(db:D1Database){
  await db.prepare(`CREATE TABLE IF NOT EXISTS ai_wrong_answer_runs(
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope_subject TEXT NOT NULL DEFAULT '',
    source_hash TEXT NOT NULL,
    model TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS ai_wrong_answer_runs_user_created ON ai_wrong_answer_runs(user_id,scope_subject,created_at DESC)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS ai_wrong_answer_runs_source ON ai_wrong_answer_runs(user_id,scope_subject,source_hash)').run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS ai_wrong_answer_links(
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_wrong_answer_id TEXT NOT NULL,
    target_wrong_answer_id TEXT NOT NULL,
    relation_type TEXT NOT NULL CHECK(relation_type IN ('same_bottleneck','same_missed_cue','same_judgment','same_concept','same_correction','transfer')),
    score REAL NOT NULL DEFAULT 0 CHECK(score>=0 AND score<=1),
    rationale TEXT NOT NULL DEFAULT '',
    run_id TEXT NOT NULL REFERENCES ai_wrong_answer_runs(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY(user_id,source_wrong_answer_id,target_wrong_answer_id),
    FOREIGN KEY(user_id,source_wrong_answer_id) REFERENCES wrong_answers(user_id,id) ON DELETE CASCADE,
    FOREIGN KEY(user_id,target_wrong_answer_id) REFERENCES wrong_answers(user_id,id) ON DELETE CASCADE
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS ai_wrong_answer_links_source ON ai_wrong_answer_links(user_id,source_wrong_answer_id,score DESC)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS ai_wrong_answer_links_target ON ai_wrong_answer_links(user_id,target_wrong_answer_id,score DESC)').run();
}

function providerError(cause:unknown,h:Tools,origin:string){
  const error=cause instanceof AIProviderError?cause:new AIProviderError('Unhandled AI learning graph error.',502,'AI_REQUEST_FAILED');
  const messages:Record<string,string>={
    AI_NOT_CONFIGURED:'AI 코치가 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.',
    AI_AUTHENTICATION_FAILED:'AI 연결 인증에 실패했습니다. 관리자에게 설정 확인을 요청해 주세요.',
    AI_ACCESS_DENIED:'현재 AI 모델 접근 권한이 없습니다. 관리자에게 모델 설정 확인을 요청해 주세요.',
    AI_RATE_LIMITED:'AI 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.',
    AI_TIMEOUT:'AI 오답 연결 분석 시간이 초과되었습니다. 다시 시도해 주세요.',
    AI_PROVIDER_UNAVAILABLE:'AI 서버가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해 주세요.',
    AI_INVALID_RESPONSE:'AI가 반환한 오답 연결 결과를 검증하지 못했습니다. 다시 분석해 주세요.',
  };
  return h.json({error:messages[error.code]??'AI 오답 연결 분석 중 오류가 발생했습니다.',code:error.code,requestId:h.randomHex(8)},error.status,origin,error.retryAfterSeconds?{'Retry-After':String(error.retryAfterSeconds)}:{});
}

async function latestRun(db:D1Database,userId:number,subject:string){
  return db.prepare('SELECT id,model,result_json,created_at,source_hash FROM ai_wrong_answer_runs WHERE user_id=? AND scope_subject=? ORDER BY created_at DESC LIMIT 1')
    .bind(userId,subject).first<{id:string;model:string;result_json:string;created_at:string;source_hash:string}>();
}

async function connectedWrongAnswers(db:D1Database,userId:number,id:string){
  const links=await db.prepare(`SELECT source_wrong_answer_id,target_wrong_answer_id,relation_type,score,rationale,run_id,created_at
    FROM ai_wrong_answer_links WHERE user_id=? AND (source_wrong_answer_id=? OR target_wrong_answer_id=?) ORDER BY score DESC,created_at DESC LIMIT 20`)
    .bind(userId,id,id).all<Record<string,unknown>>();
  const out=[];
  const seen=new Set<string>();
  for(const link of links.results){
    const other=String(link.source_wrong_answer_id)===id?String(link.target_wrong_answer_id):String(link.source_wrong_answer_id);
    if(seen.has(other))continue;seen.add(other);
    const row=await db.prepare('SELECT * FROM wrong_answers WHERE user_id=? AND id=?').bind(userId,other).first<Record<string,unknown>>();
    if(!row)continue;
    out.push({relationType:String(link.relation_type),score:Number(link.score),rationale:String(link.rationale??''),runId:String(link.run_id),wrongAnswer:wrongAnswerDto(row)});
  }
  return out;
}

export async function aiLearningGraph(request:Request,env:Env,user:User,origin:string,h:Tools):Promise<Response|null>{
  const url=new URL(request.url),path=url.pathname;
  if(!path.startsWith('/api/ai/learning-graph'))return null;
  if(!user)return h.json({error:'Unauthorized'},401,origin);
  await ensureLearningGraphReady(env.DB,user.id);
  await ensureTables(env.DB);

  const detail=path.match(/^\/api\/ai\/learning-graph\/wrong-answers\/([^/]+)$/);
  if(detail&&request.method==='GET'){
    const id=decodeURIComponent(detail[1]);
    const exists=await env.DB.prepare('SELECT id FROM wrong_answers WHERE user_id=? AND id=?').bind(user.id,id).first();
    if(!exists)return h.json({error:'Wrong Answer를 찾을 수 없습니다.'},404,origin);
    return h.json({wrongAnswerId:id,connections:await connectedWrongAnswers(env.DB,user.id,id)},200,origin);
  }

  if(path==='/api/ai/learning-graph'&&request.method==='GET'){
    const subject=clean(url.searchParams.get('subject'),20);
    const run=await latestRun(env.DB,user.id,subject);
    if(!run)return h.json({analysis:null,runId:null,analyzedAt:null,model:null},200,origin);
    return h.json({analysis:JSON.parse(run.result_json) as AIWrongAnswerAnalysis,runId:run.id,analyzedAt:run.created_at,model:run.model},200,origin);
  }

  if(path==='/api/ai/learning-graph/analyze'&&request.method==='POST'){
    const body=obj(await h.boundedJson<unknown>(request))??{},subject=clean(body.subject,20),force=body.force===true;
    if(subject&&!['국어','수학','영어','탐구'].includes(subject))return h.json({error:'지원하지 않는 과목입니다.'},400,origin);
    const rows=await env.DB.prepare(`SELECT * FROM wrong_answers WHERE user_id=? ${subject?'AND subject=?':''} ORDER BY date DESC,updated_at DESC,id DESC LIMIT 40`)
      .bind(...(subject?[user.id,subject]:[user.id])).all<Record<string,unknown>>();
    if(rows.results.length<2)return h.json({analysis:{summary:'서로 연결해 분석하려면 오답이 2개 이상 필요합니다.',patterns:[],links:[],recommendations:[]},runId:null,analyzedAt:null,model:h.config.model??'nvidia/nemotron-3-ultra-550b-a55b',cached:true},200,origin);

    const ruleRows=await env.DB.prepare(`SELECT l.wrong_answer_id,r.id,r.title,r.content,l.relation_type FROM core_rule_wrong_answer_links l
      JOIN core_rules r ON r.id=l.core_rule_id AND r.user_id=l.user_id WHERE l.user_id=?`).bind(user.id).all<Record<string,unknown>>();
    const rules=new Map<string,Array<Record<string,string>>>();
    for(const row of ruleRows.results){const id=String(row.wrong_answer_id),list=rules.get(id)??[];list.push({id:String(row.id),title:clean(row.title,160),content:clean(row.content,300),relationType:String(row.relation_type)});rules.set(id,list)}
    const items=rows.results.map(row=>({
      id:String(row.id),date:String(row.date??''),subject:String(row.subject??''),source:clean(row.source,180),question:clean(row.question,180),
      wrongJudgment:clean(row.wrong_judgment,420),missedCue:clean(row.missed_cue,420),correction:clean(row.correction,420),transfer:clean(row.transfer,420),bottleneck:clean(row.bottleneck,120),
      coreRules:(rules.get(String(row.id))??[]).slice(0,5),
    }));
    const sourceHash=await h.sha256(JSON.stringify(items)),currentModel=h.config.model??'nvidia/nemotron-3-ultra-550b-a55b';
    if(!force){
      const existing=await env.DB.prepare('SELECT id,model,result_json,created_at FROM ai_wrong_answer_runs WHERE user_id=? AND scope_subject=? AND source_hash=? AND model=? ORDER BY created_at DESC LIMIT 1').bind(user.id,subject,sourceHash,currentModel).first<{id:string;model:string;result_json:string;created_at:string}>();
      if(existing)return h.json({analysis:JSON.parse(existing.result_json),runId:existing.id,analyzedAt:existing.created_at,model:existing.model,cached:true},200,origin);
    }

    const system=`너는 TRINITY OS의 백엔드 Learning Graph 분석기다. 제공된 오답 기록만 사용한다. 원본 오답을 수정하지 말고, 존재하지 않는 문항/원인/성적을 만들지 않는다.\n\n반드시 JSON 객체만 출력한다. 형식:\n{\n  "summary":"전체 반복 패턴 요약",\n  "patterns":[{"name":"패턴명","evidenceIds":["실제 오답 id"],"explanation":"근거"}],\n  "links":[{"sourceId":"실제 id","targetId":"실제 id","relationType":"same_bottleneck|same_missed_cue|same_judgment|same_concept|same_correction|transfer","score":0.0,"rationale":"두 오답을 연결한 구체적 근거"}],\n  "recommendations":[{"title":"추천 제목","reason":"왜 지금 필요한지","action":"다음 학습 행동 1개","successCriterion":"검증 기준","priority":0,"wrongAnswerIds":["근거 id"]}]\n}\n\n규칙: links는 근거가 분명한 관계만 최대 80개, patterns는 최대 8개, recommendations는 최대 6개. priority는 0~100. 같은 문제끼리 연결하지 않는다. 서로 다른 과목이어도 판단 습관이 실제로 같으면 연결할 수 있다. 추천은 문제 수 늘리기보다 반복 병목 교정과 재검증을 우선한다.`;
    const messages:ChatMessage[]=[{role:'system',content:system},{role:'user',content:JSON.stringify({wrongAnswers:items})}];
    try{
      const result=await aiService.complete({db:env.DB,userId:user.id,user:user.username,operation:'wrong-answer-graph',cacheKey:force?`${sourceHash}:${h.randomHex(4)}`:sourceHash,messages,maxTokens:1800,config:h.config});
      const analysis=sanitizeLearningGraphAnalysis(parseJsonObject(result.content),items.map(item=>item.id));
      const now=new Date().toISOString(),runId=h.randomHex(16),model=currentModel;
      if(subject){
        await env.DB.prepare(`DELETE FROM ai_wrong_answer_links WHERE user_id=? AND (
          source_wrong_answer_id IN (SELECT id FROM wrong_answers WHERE user_id=? AND subject=?) OR
          target_wrong_answer_id IN (SELECT id FROM wrong_answers WHERE user_id=? AND subject=?))`).bind(user.id,user.id,subject,user.id,subject).run();
      }else await env.DB.prepare('DELETE FROM ai_wrong_answer_links WHERE user_id=?').bind(user.id).run();
      await env.DB.prepare('INSERT INTO ai_wrong_answer_runs(id,user_id,scope_subject,source_hash,model,result_json,created_at) VALUES(?,?,?,?,?,?,?)')
        .bind(runId,user.id,subject,sourceHash,model,JSON.stringify(analysis),now).run();
      const statements=analysis.links.map(link=>env.DB.prepare(`INSERT INTO ai_wrong_answer_links(user_id,source_wrong_answer_id,target_wrong_answer_id,relation_type,score,rationale,run_id,created_at)
        VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,source_wrong_answer_id,target_wrong_answer_id) DO UPDATE SET relation_type=excluded.relation_type,score=excluded.score,rationale=excluded.rationale,run_id=excluded.run_id,created_at=excluded.created_at`)
        .bind(user.id,link.sourceId,link.targetId,link.relationType,link.score,link.rationale,runId,now));
      for(let i=0;i<statements.length;i+=100)await env.DB.batch(statements.slice(i,i+100));
      return h.json({analysis,runId,analyzedAt:now,model,cached:result.cached},200,origin);
    }catch(cause){return providerError(cause,h,origin)}
  }

  return h.json({error:'Not found'},404,origin);
}
