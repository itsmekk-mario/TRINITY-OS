import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, RefreshCw } from 'lucide-react';
import type { AppData, CalendarPlan } from '../types';
import { Empty, PageHeader } from '../components/Ui';
import { formatKoreanDate, formatMinutes, getCurrentStudyDay, toDateKey } from '../lib/date';
import { deriveLearningSignals } from '../lib/learningSignals';
import { parsePlannedMinutes } from '../lib/plannedTime';
import { formatResourceDeadline, normalizeResourceDueDate, sortResourcesByDeadline } from '../lib/resourceDeadline';
import { archiveApi, type ActiveCoreRule } from '../lib/archiveApi';

type ReviewItem={id:string;targetType:'wrong_answer'|'core_rule'|'drill'|'learning_item';title:string;reason:string;scheduledAt:string;priority:number};
type ReviewQueue={overdue:ReviewItem[];today:ReviewItem[];upcoming:ReviewItem[];counts:{overdue:number;today:number;upcoming:number}};

function TodayLearningExecution({review,rules,busy,error,onOpenQueue,onBegin}:{review:ReviewQueue|null;rules:ActiveCoreRule[];busy:boolean;error:string;onOpenQueue:()=>void;onBegin:(rule:ActiveCoreRule)=>void}){
  const due=[...(review?.overdue??[]),...(review?.today??[])].slice(0,3);
  return <div className="today-learning-execution">
    <section className="today-review-card" aria-labelledby="today-review-queue-title">
      <div className="today-section-head"><div><p className="card-label">REVIEW</p><h2 id="today-review-queue-title">오늘 재현할 판단 기준</h2></div><button className="text-button" onClick={onOpenQueue}>Review 전체 보기<ArrowRight size={16}/></button></div>
      <div className="today-review-summary"><span>오늘 <b>{review?.counts.today??'—'}</b></span><span>연체 <b>{review?.counts.overdue??'—'}</b></span><small>대상을 열어 성공·실패와 메모를 남길 수 있습니다.</small></div>
      {due.length?<div className="today-review-list">{due.map(item=><button key={item.id} onClick={onOpenQueue}><span>{item.targetType.replace('_',' ')}</span><b>{item.title}</b><small>{item.reason||'저장한 판단 기준을 먼저 재현하세요.'}</small></button>)}</div>:<p className="today-quiet-copy">오늘 처리할 Review가 없습니다. 아래 Core Rule에서 검증을 시작해 보세요.</p>}
    </section>
    <section className="today-core-rule-card" aria-labelledby="today-core-rule-title">
      <div className="today-section-head"><div><p className="card-label">LEARNING INTELLIGENCE</p><h2 id="today-core-rule-title">지금 다시 검증할 Core Rule</h2></div></div>
      {error&&<p className="team-error" role="alert">{error}</p>}
      {rules.length?<div className="today-rule-list">{rules.map(rule=><article key={rule.id}><span>{rule.status} · 최근 7일 실패 {rule.stats.failures7d}회</span><b>{rule.title}</b><p>{rule.content}</p><button className="text-button" disabled={busy} onClick={()=>onBegin(rule)}><RefreshCw size={14}/>{busy?'Review 추가 중…':'오늘 Review 시작'}</button></article>)}</div>:<p className="today-quiet-copy">우선순위가 높은 Core Rule이 없습니다. 오답과 Evidence를 연결하면 여기에 표시됩니다.</p>}
    </section>
  </div>;
}

export default function Dashboard({ data, update, navigate }: { data: AppData; update: (fn: (value: AppData) => AppData) => void; navigate: (page: string) => void }) {
  const today = toDateKey();
  const analytics = useMemo(() => deriveLearningSignals(data, new Date(`${today}T12:00:00`)), [data, today]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [review,setReview]=useState<ReviewQueue | null>(null);
  const [activeRules,setActiveRules]=useState<ActiveCoreRule[]>([]);
  const [reviewError,setReviewError]=useState('');
  const [reviewingRuleId,setReviewingRuleId]=useState('');
  const loadLearningExecution=async()=>{
    const [queue,rules]=await Promise.all([
      archiveApi<ReviewQueue>('/api/learning-intelligence/reviews?view=queue'),
      archiveApi<{rules:ActiveCoreRule[]}>('/api/learning-intelligence/active-rules?limit=3'),
    ]);
    setReview(queue);setActiveRules(rules.rules.slice(0,3));
  };
  useEffect(() => {
    let active = true;
    void loadLearningExecution().catch(()=>{if(active){setReview(null);setActiveRules([]);}});
    return () => { active = false; };
  }, []);
  const beginCoreRuleReview=async(rule:ActiveCoreRule)=>{
    if(reviewingRuleId)return;
    setReviewingRuleId(rule.id);setReviewError('');
    try{
      await archiveApi('/api/learning-intelligence/reviews','POST',{targetType:'core_rule',targetId:rule.id,reviewType:'today_core_rule',scheduledAt:`${getCurrentStudyDay()}T06:00:00+09:00`,result:'pending'});
      await loadLearningExecution();
      navigate('insights:review');
    }catch(cause){setReviewError(cause instanceof Error?cause.message:'Core Rule Review를 시작하지 못했습니다.');}
    finally{setReviewingRuleId('');}
  };
  const todayPlans = data.calendar[today]?.plans ?? [];
  const completed = todayPlans.filter((item) => item.done);
  const incomplete = todayPlans.filter((item) => !item.done);
  const next = incomplete[0];
  const targetMinutes = parsePlannedMinutes(next?.quantity);
  const countdown = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.examDate)) return null;
    const days = Math.round((new Date(`${data.examDate}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000);
    return Number.isFinite(days) ? days === 0 ? 'D-DAY' : days > 0 ? `D-${days}` : `D+${Math.abs(days)}` : null;
  }, [data.examDate, today]);
  const togglePlan = (id: string) => update((value) => {
    const entry = value.calendar[today];
    if (!entry) return value;
    return { ...value, calendar: { ...value.calendar, [today]: { ...entry, plans: (entry.plans ?? []).map((item) => item.id === id ? { ...item, done: !item.done } : item) } } };
  });
  const planRow = (item: CalendarPlan) => <div key={item.id} className={item.done ? 'done' : ''}><button className="plan-check" aria-pressed={item.done} aria-label={`${item.title} ${item.done ? '완료 취소' : '완료'}`} onClick={() => togglePlan(item.id)}>{item.done ? <Check size={18} /> : <span aria-hidden="true">○</span>}</button><span className={`subject-badge ${item.subject}`}>{item.subject}</span><span><b>{item.title}</b>{item.detail && <small>{item.detail}</small>}</span><em>{item.quantity}</em></div>;
  const resourceDeadlines=useMemo(()=>sortResourcesByDeadline((data.resources??[]).filter(resource=>!resource.total||resource.done<resource.total).filter(resource=>Boolean(normalizeResourceDueDate(resource.dueDate)))).slice(0,3),[data.resources]);

  return <div className="today-page">
    <TodayLearningExecution review={review} rules={activeRules} busy={Boolean(reviewingRuleId)} error={reviewError} onOpenQueue={()=>navigate('insights:review')} onBegin={rule=>void beginCoreRuleReview(rule)} />
    <PageHeader eyebrow="TODAY" title={formatKoreanDate(new Date(`${today}T12:00:00`))} action={countdown && <span className="exam-indicator" title={data.examDate}>수능 {countdown}</span>} />
    <section className="next-action" aria-labelledby="next-title"><div><p className="eyebrow">NEXT</p><h2 id="next-title">{next?.title ?? (todayPlans.length ? '오늘의 계획을 모두 마쳤습니다' : '첫 학습을 계획하세요')}</h2><p>{next ? `${next.subject} · ${targetMinutes ? `목표 ${targetMinutes}분` : next.quantity || '목표량 미설정'}` : todayPlans.length ? '기록을 돌아보거나 다음 학습을 준비하세요.' : '일정을 추가하면 다음 학습이 여기에 연결됩니다.'}</p></div><button className="button primary" onClick={() => navigate(next ? 'train:timer' : 'plan:calendar')}>{next ? '공부 시작' : '일정 추가'}<ArrowRight size={18} /></button></section>
    <section className="execution-section" aria-label="오늘의 실행"><p className="card-label">TODAY'S EXECUTION</p><dl className="execution-strip"><div><dt>오늘 학습</dt><dd className="metric-number">{formatMinutes(analytics.execution.todayMinutes)}</dd></div><div><dt>계획 실행</dt><dd className="metric-number">{analytics.execution.completionRate === null ? '—' : `${analytics.execution.completionRate}%`}</dd></div><div><dt>일정 완료</dt><dd className="metric-number">{completed.length}<span> / {todayPlans.length}</span></dd></div></dl></section>
    <section className="today-schedule" aria-labelledby="schedule-title"><div className="today-section-head"><div><p className="card-label">TODAY'S SCHEDULE</p><h2 id="schedule-title">오늘 일정</h2></div><button className="text-button" onClick={() => navigate('plan:calendar')}>일정 열기<ArrowRight size={16} /></button></div>{todayPlans.length ? <div className="today-plan-list">{incomplete.map(planRow)}{completed.length > 0 && <><button className="completed-toggle" aria-expanded={showCompleted} onClick={() => setShowCompleted((value) => !value)}>완료 {completed.length}개 {showCompleted ? '접기' : '보기'}</button>{showCompleted && completed.map(planRow)}</>}</div> : <Empty title="오늘 일정이 없습니다." description="첫 학습을 추가하면 Timer와 Today 화면에 자동 연결됩니다." action={<button className="button" onClick={() => navigate('plan:calendar')}>일정 추가</button>} />}</section>
    {resourceDeadlines.length>0&&<section className="today-resource-deadline" aria-labelledby="resource-deadline-title"><div className="today-section-head"><div><p className="card-label">RESOURCE DEADLINE</p><h2 id="resource-deadline-title">가까운 교재 마감</h2></div><button className="text-button" onClick={()=>navigate('train:resources')}>Resources<ArrowRight size={16}/></button></div><div className="today-deadline-list">{resourceDeadlines.map(resource=><article key={resource.id}><div><span className={`subject-badge ${resource.subject}`}>{resource.subject}</span><b>{resource.name}</b></div><span>{formatResourceDeadline(resource)} · {resource.done} / {resource.total}</span></article>)}</div></section>}
    <section className="today-review" aria-labelledby="today-review-title"><div className="today-section-head"><div><p className="card-label">REVIEW</p><h2 id="today-review-title">오늘 재현할 판단 기준</h2></div><button className="text-button" onClick={()=>navigate('insights:review')}>Review 시작<ArrowRight size={16}/></button></div><div className="today-review-summary"><span>오늘 <b>{review?.counts.today??'—'}</b></span><span>연체 <b>{review?.counts.overdue??'—'}</b></span><small>전체 Queue와 재현 결과는 Insights에서 관리합니다.</small></div></section>
    <section className="today-intelligence" aria-labelledby="today-intelligence-title"><div className="today-section-head"><div><p className="card-label">LEARNING INTELLIGENCE</p><h2 id="today-intelligence-title">지금 다시 검증할 Core Rule</h2></div><button className="text-button" onClick={()=>navigate('archive')}>상세 분석<ArrowRight size={16}/></button></div>{activeRules.length?<div className="today-rule-list">{activeRules.map(rule=><article key={rule.id}><span>{rule.status} · 최근 7일 실패 {rule.stats.failures7d}회</span><b>{rule.title}</b><p>{rule.content}</p><button className="text-button" onClick={()=>navigate('insights:review')}><RefreshCw size={14}/>Review</button></article>)}</div>:<p className="today-quiet-copy">우선순위가 높은 Core Rule이 아직 없습니다. 오답과 Evidence를 연결하면 여기에 최대 3개만 표시됩니다.</p>}</section>
  </div>;
}
