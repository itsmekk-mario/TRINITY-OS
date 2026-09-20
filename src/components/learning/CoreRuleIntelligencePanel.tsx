import { useEffect,useMemo,useRef,useState } from 'react';
import { Activity,AlertTriangle,BookOpen,CheckCircle2,Clock3,FileSearch,RefreshCw,Target } from 'lucide-react';
import { Card,Empty } from '../Ui';
import {
  archiveApi,
  type ActiveCoreRule,
  type ArchiveSubject,
  type CoreRule,
  type CoreRuleEvidence,
  type CoreRuleIntelligence,
  type CoreRuleStatus,
  type RuleRelation,
} from '../../lib/archiveApi';
import { getCurrentStudyDay } from '../../lib/date';

const subjects:{id:''|ArchiveSubject;label:string}[]=[
  {id:'',label:'전체'},
  {id:'korean',label:'국어'},
  {id:'math',label:'수학'},
  {id:'english',label:'영어'},
];
const statusCopy:Record<CoreRuleStatus,string>={ACTIVE:'우선 교정',WATCH:'관찰',MASTERED:'체화',ARCHIVED:'낮은 우선순위'};
const relationLabel:Record<RuleRelation,string>={derived:'도출',applied:'적용',failed:'적용 실패',reinforced:'강화'};
const sourceLabel:Record<CoreRuleEvidence['sourceType'],string>={archive:'Archive',wrong_answer:'Wrong Answer',drill:'Drill',review:'Review'};
const subjectLabel:Record<ArchiveSubject,string>={korean:'국어',math:'수학',english:'영어'};

const formatDate=(value:string|null|undefined)=>{
  if(!value)return '—';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return value.slice(0,10);
  return date.toLocaleDateString('ko-KR',{month:'numeric',day:'numeric',timeZone:'Asia/Seoul'});
};
const pct=(value:number|null)=>value===null?'—':`${Math.round(value*100)}%`;

type ActionPanel='wrongAnswers'|'drills'|null;

export default function CoreRuleIntelligencePanel({onEditRule,onOpenReviewQueue}:{onEditRule:(rule:CoreRule)=>void;onOpenReviewQueue:()=>void}){
  const [subject,setSubject]=useState<''|ArchiveSubject>('');
  const [rules,setRules]=useState<ActiveCoreRule[]>([]);
  const [selectedId,setSelectedId]=useState('');
  const [detail,setDetail]=useState<CoreRuleIntelligence|null>(null);
  const [loading,setLoading]=useState(false);
  const [detailLoading,setDetailLoading]=useState(false);
  const [error,setError]=useState('');
  const [actionPanel,setActionPanel]=useState<ActionPanel>(null);
  const [reviewBusy,setReviewBusy]=useState(false);
  const evidenceRef=useRef<HTMLDivElement>(null);

  const load=async()=>{
    setLoading(true);setError('');
    try{
      const params=new URLSearchParams({limit:'10'});
      if(subject)params.set('subject',subject);
      const response=await archiveApi<{rules:ActiveCoreRule[]}>(`/api/learning-intelligence/active-rules?${params.toString()}`);
      setRules(response.rules);
      setSelectedId(current=>response.rules.some(rule=>rule.id===current)?current:(response.rules[0]?.id??''));
    }catch(cause){
      setError(cause instanceof Error?cause.message:'Learning Intelligence를 불러오지 못했습니다.');
    }finally{setLoading(false)}
  };

  useEffect(()=>{void load()},[subject]);
  useEffect(()=>{
    if(!selectedId){setDetail(null);return}
    let active=true;setDetailLoading(true);setError('');
    archiveApi<CoreRuleIntelligence>(`/api/core-rules/${encodeURIComponent(selectedId)}/intelligence`)
      .then(value=>{if(active){setDetail(value);setActionPanel(null)}})
      .catch(cause=>{if(active)setError(cause instanceof Error?cause.message:'Core Rule 상세 정보를 불러오지 못했습니다.')})
      .finally(()=>{if(active)setDetailLoading(false)});
    return()=>{active=false};
  },[selectedId]);

  const activeCount=useMemo(()=>rules.filter(rule=>rule.status==='ACTIVE').length,[rules]);
  const watchCount=useMemo(()=>rules.filter(rule=>rule.status==='WATCH').length,[rules]);
  const openReview=async()=>{
    if(!detail?.coreRule||reviewBusy)return;
    const alreadyQueued=detail.reviews.some(review=>review.result==='pending');
    if(alreadyQueued){onOpenReviewQueue();return}
    setReviewBusy(true);setError('');
    try{
      await archiveApi('/api/learning-intelligence/reviews','POST',{
        targetType:'core_rule',targetId:detail.coreRule.id,reviewType:'active_rule',scheduledAt:`${getCurrentStudyDay()}T06:00:00+09:00`,result:'pending',
      });
      onOpenReviewQueue();
    }catch(cause){setError(cause instanceof Error?cause.message:'Review Queue에 추가하지 못했습니다.')}finally{setReviewBusy(false)}
  };

  return <div className="intelligence-workspace">
    <section className="intelligence-overview">
      <div className="intelligence-hero">
        <div>
          <span className="eyebrow">LEARNING INTELLIGENCE</span>
          <h2>Active Core Rules</h2>
          <p>최근 실패와 반복 오답을 기준으로 지금 먼저 교정할 판단 기준을 보여줍니다.</p>
        </div>
        <button className="button" disabled={loading} onClick={()=>void load()}><RefreshCw size={14}/>새로고침</button>
      </div>
      <div className="intelligence-summary">
        <span><Target size={15}/><b>{rules.length}</b>표시 규칙</span>
        <span><AlertTriangle size={15}/><b>{activeCount}</b>ACTIVE</span>
        <span><Clock3 size={15}/><b>{watchCount}</b>WATCH</span>
      </div>
      <div className="intelligence-subjects" role="tablist" aria-label="Core Rule 과목 필터">
        {subjects.map(item=><button key={item.id||'all'} className={subject===item.id?'active':''} onClick={()=>setSubject(item.id)}>{item.label}</button>)}
      </div>
      {error&&<p className="team-error" role="alert">{error}</p>}
      {loading&&!rules.length?<p className="archive-empty-copy">분석 중…</p>:rules.length?<div className="active-rule-list">
        {rules.map(rule=><button key={rule.id} className={`active-rule-card ${selectedId===rule.id?'selected':''}`} onClick={()=>setSelectedId(rule.id)}>
          <span className={`priority-status ${rule.status.toLowerCase()}`}>{rule.status} · {rule.priorityScore}</span>
          <span className="active-rule-subject">{subjectLabel[rule.subject]} · {statusCopy[rule.status]}</span>
          <b>{rule.title}</b>
          <p>{rule.content}</p>
          <span className="active-rule-metrics">7일 실패 {rule.stats.failures7d} · 오답 {rule.stats.wrongAnswerCount} · Review 실패 {rule.stats.reviewFailureCount}</span>
        </button>)}
      </div>:<Empty title="분석할 Core Rule이 없습니다." description="Archive나 Wrong Answer에서 Core Rule을 연결하면 우선순위를 계산합니다."/>}
    </section>

    <section className="intelligence-detail">
      {!selectedId?<Empty title="Core Rule을 선택하세요." description="왼쪽에서 규칙을 선택하면 근거와 우선순위를 확인할 수 있습니다."/>:
      detailLoading&&!detail?<p className="archive-empty-copy">상세 분석 중…</p>:detail?.coreRule?<>
        <header className="intelligence-detail-head">
          <div>
            <span className={`priority-status ${detail.status.toLowerCase()}`}>{detail.status} · {detail.priorityScore}</span>
            <h2>{detail.coreRule.title}</h2>
            <p>{detail.coreRule.content}</p>
          </div>
          <div className="intelligence-head-actions"><button className="button" onClick={()=>detail.coreRule&&onEditRule(detail.coreRule)}>규칙 수정</button></div>
        </header>
        <section className="intelligence-actions" aria-label="Core Rule 행동">
          <div><span className="eyebrow">NEXT ACTION</span><p>지식 객체인 Rule 자체를 완료 처리하지 않고, 관련 기록과 재현 행동으로 검증합니다.</p></div>
          <div className="intelligence-action-buttons">
            <button className="button" onClick={()=>setActionPanel(current=>current==='wrongAnswers'?null:'wrongAnswers')}><FileSearch size={14}/>관련 오답 보기 · {detail.wrongAnswers.length}</button>
            <button className="button primary" disabled={reviewBusy} onClick={()=>void openReview()}><RefreshCw size={14}/>{detail.reviews.some(review=>review.result==='pending')?'Review 열기':'Review'}</button>
            <button className="button" onClick={()=>setActionPanel(current=>current==='drills'?null:'drills')}><Target size={14}/>Drill · {detail.drills.length}</button>
            <button className="button" onClick={()=>evidenceRef.current?.scrollIntoView({behavior:'smooth',block:'start'})}><BookOpen size={14}/>Evidence</button>
          </div>
        </section>
        {actionPanel==='wrongAnswers'&&<section className="intelligence-linked-records"><div className="section-title"><h3>관련 Wrong Answer</h3><span>{detail.wrongAnswers.length}개</span></div>{detail.wrongAnswers.length?<div className="linked-record-list">{detail.wrongAnswers.map(item=><article key={item.id}><span>{item.date} · {item.source}</span><b>{item.question||'문항 미입력'}</b><p><strong>잘못된 판단</strong> {item.wrongJudgment||'미기록'}</p><p><strong>놓친 단서</strong> {item.missedCue||'미기록'}</p><p><strong>교정 행동</strong> {item.correction||'미기록'}</p></article>)}</div>:<p className="archive-empty-copy">이 Rule에 연결된 Wrong Answer가 없습니다.</p>}</section>}
        {actionPanel==='drills'&&<section className="intelligence-linked-records"><div className="section-title"><h3>관련 Drill</h3><span>{detail.drills.length}개</span></div>{detail.drills.length?<div className="linked-record-list">{detail.drills.map(item=><article key={item.id}><span>{item.date} · {item.minutes}분 · {item.done?'실행 완료':'미완료'}</span><b>{item.title||'Drill'}</b><p><strong>교정 행동</strong> {item.action||'미기록'}</p><p><strong>성공 기준</strong> {item.successCriterion||'미기록'}</p></article>)}</div>:<p className="archive-empty-copy">이 Rule에 연결된 Drill이 없습니다.</p>}</section>}
        <div className="intelligence-stat-grid">
          <Card><span>최근 7일 실패</span><b>{detail.stats.failures7d}</b></Card>
          <Card><span>최근 30일 실패</span><b>{detail.stats.failures30d}</b></Card>
          <Card><span>Wrong Answer</span><b>{detail.stats.wrongAnswerCount}</b></Card>
          <Card><span>Drill</span><b>{detail.stats.drillCount}</b></Card>
          <Card><span>Review 성공</span><b>{detail.stats.reviewSuccessCount}</b></Card>
          <Card><span>Review 실패</span><b>{detail.stats.reviewFailureCount}</b></Card>
          <Card><span>Mastery Rate</span><b>{pct(detail.stats.masteryRate)}</b></Card>
          <Card><span>Evidence</span><b>{detail.stats.evidenceCount}</b></Card>
        </div>
        <div className="intelligence-evidence" ref={evidenceRef}>
          <div className="section-title"><div><span className="eyebrow">TRACE</span><h3>Evidence Timeline</h3></div><span>{detail.evidence.length} events</span></div>
          {detail.evidence.length?<div className="evidence-list">{detail.evidence.map((event,index)=><article key={`${event.sourceType}-${event.sourceId}-${event.relationType}-${index}`}>
            <span className={`evidence-icon ${event.relationType}`}>{event.relationType==='failed'?<AlertTriangle size={14}/>:event.relationType==='reinforced'?<CheckCircle2 size={14}/>:event.sourceType==='archive'?<BookOpen size={14}/>:<Activity size={14}/>}</span>
            <div><b>{sourceLabel[event.sourceType]} · {relationLabel[event.relationType]}</b><small>{formatDate(event.occurredAt)}</small></div>
          </article>)}</div>:<p className="archive-empty-copy">아직 Evidence가 없습니다.</p>}
        </div>
      </>:<Empty title="상세 정보를 불러오지 못했습니다." description="잠시 후 다시 시도해 주세요."/>}
    </section>
  </div>;
}
