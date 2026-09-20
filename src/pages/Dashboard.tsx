import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import type { AppData, CalendarPlan } from '../types';
import { Empty, PageHeader } from '../components/Ui';
import { formatKoreanDate, formatMinutes, getCurrentStudyDay, toDateKey } from '../lib/date';
import { deriveLearningSignals } from '../lib/learningSignals';
import { parsePlannedMinutes } from '../lib/plannedTime';
import { formatResourceDeadline, normalizeResourceDueDate, sortResourcesByDeadline } from '../lib/resourceDeadline';
import { archiveApi, type ActiveCoreRule } from '../lib/archiveApi';

type ReviewItem={id:string;targetType:'wrong_answer'|'core_rule'|'drill'|'learning_item';title:string;reason:string;scheduledAt:string;priority:number};
type ReviewQueue={overdue:ReviewItem[];today:ReviewItem[];upcoming:ReviewItem[];counts:{overdue:number;today:number;upcoming:number}};

function TodayLearningExecution({
  review,
  rules,
  busy,
  reviewError,
  ruleError,
  onOpenQueue,
  onBegin,
  onReload,
}:{
  review:ReviewQueue|null;
  rules:ActiveCoreRule[];
  busy:boolean;
  reviewError:string;
  ruleError:string;
  onOpenQueue:()=>void;
  onBegin:(rule:ActiveCoreRule)=>void;
  onReload:()=>void;
}){
  const reviewItem=review?.overdue[0]??review?.today[0];
  const rule=rules[0];
  const dueCount=(review?.counts.overdue??0)+(review?.counts.today??0);

  return <section className="today-learning-compact" aria-label="오늘의 Review와 Core Rule">
    <button
      className="today-learning-compact-row"
      onClick={reviewError?onReload:onOpenQueue}
    >
      <span>REVIEW</span>
      <b>{reviewError?'Review 불러오기 실패':reviewItem?.title??'오늘 Review 없음'}</b>
      {!reviewError&&dueCount>0&&<em>{dueCount}개</em>}
      <ArrowRight size={15}/>
    </button>

    <button
      className="today-learning-compact-row"
      disabled={busy}
      onClick={ruleError?onReload:rule?()=>onBegin(rule):onOpenQueue}
    >
      <span>CORE RULE</span>
      <b>{ruleError?'Core Rule 불러오기 실패':rule?.title??'우선 Core Rule 없음'}</b>
      <ArrowRight size={15}/>
    </button>
  </section>;
}

export default function Dashboard({ data, update, navigate }: { data: AppData; update: (fn: (value: AppData) => AppData) => void; navigate: (page: string) => void }) {
  const today = toDateKey();
  const analytics = useMemo(() => deriveLearningSignals(data, new Date(`${today}T12:00:00`)), [data, today]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [review,setReview]=useState<ReviewQueue | null>(null);
  const [activeRules,setActiveRules]=useState<ActiveCoreRule[]>([]);
  const [reviewError,setReviewError]=useState('');
  const [ruleError,setRuleError]=useState('');
  const [reviewingRuleId,setReviewingRuleId]=useState('');
  const loadLearningExecution=async()=>{
    setReviewError('');setRuleError('');
    const [queueResult,rulesResult]=await Promise.allSettled([
      archiveApi<ReviewQueue>('/api/learning-intelligence/reviews?view=queue'),
      archiveApi<{rules:ActiveCoreRule[]}>('/api/learning-intelligence/active-rules?limit=3'),
    ]);
    if(queueResult.status==='fulfilled')setReview(queueResult.value);
    else{setReview(null);setReviewError(queueResult.reason instanceof Error?queueResult.reason.message:'Review Queue를 불러오지 못했습니다.');}
    if(rulesResult.status==='fulfilled')setActiveRules(rulesResult.value.rules.slice(0,3));
    else{setActiveRules([]);setRuleError(rulesResult.reason instanceof Error?rulesResult.reason.message:'Core Rule을 불러오지 못했습니다.');}
  };
  useEffect(() => { void loadLearningExecution(); }, []);
  const beginCoreRuleReview=async(rule:ActiveCoreRule)=>{
    if(reviewingRuleId)return;
    setReviewingRuleId(rule.id);setRuleError('');
    try{
      await archiveApi('/api/learning-intelligence/reviews','POST',{targetType:'core_rule',targetId:rule.id,reviewType:'today_core_rule',scheduledAt:`${getCurrentStudyDay()}T06:00:00+09:00`,result:'pending'});
      await loadLearningExecution();
      navigate('insights:review');
    }catch(cause){setRuleError(cause instanceof Error?cause.message:'Core Rule Review를 시작하지 못했습니다.');}
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
    <PageHeader eyebrow="TODAY" title={formatKoreanDate(new Date(`${today}T12:00:00`))} action={countdown && <span className="exam-indicator" title={data.examDate}>수능 {countdown}</span>} />
    <section className="next-action" aria-labelledby="next-title"><div><p className="eyebrow">NEXT</p><h2 id="next-title">{next?.title ?? (todayPlans.length ? '오늘의 계획을 모두 마쳤습니다' : '첫 학습을 계획하세요')}</h2><p>{next ? `${next.subject} · ${targetMinutes ? `목표 ${targetMinutes}분` : next.quantity || '목표량 미설정'}` : todayPlans.length ? '기록을 돌아보거나 다음 학습을 준비하세요.' : '일정을 추가하면 다음 학습이 여기에 연결됩니다.'}</p></div><button className="button primary" onClick={() => navigate(next ? 'train:timer' : 'plan:calendar')}>{next ? '공부 시작' : '일정 추가'}<ArrowRight size={18} /></button></section>
    <section className="execution-section" aria-label="오늘의 실행"><p className="card-label">TODAY'S EXECUTION</p><dl className="execution-strip"><div><dt>오늘 학습</dt><dd className="metric-number">{formatMinutes(analytics.execution.todayMinutes)}</dd></div><div><dt>계획 실행</dt><dd className="metric-number">{analytics.execution.completionRate === null ? '—' : `${analytics.execution.completionRate}%`}</dd></div><div><dt>일정 완료</dt><dd className="metric-number">{completed.length}<span> / {todayPlans.length}</span></dd></div></dl></section>
    <TodayLearningExecution review={review} rules={activeRules} busy={Boolean(reviewingRuleId)} reviewError={reviewError} ruleError={ruleError} onOpenQueue={()=>navigate('insights:review')} onBegin={rule=>void beginCoreRuleReview(rule)} onReload={()=>void loadLearningExecution()} />
    <section className="today-schedule" aria-labelledby="schedule-title"><div className="today-section-head"><div><p className="card-label">TODAY'S SCHEDULE</p><h2 id="schedule-title">오늘 일정</h2></div><button className="text-button" onClick={() => navigate('plan:calendar')}>일정 열기<ArrowRight size={16} /></button></div>{todayPlans.length ? <div className="today-plan-list">{incomplete.map(planRow)}{completed.length > 0 && <><button className="completed-toggle" aria-expanded={showCompleted} onClick={() => setShowCompleted((value) => !value)}>완료 {completed.length}개 {showCompleted ? '접기' : '보기'}</button>{showCompleted && completed.map(planRow)}</>}</div> : <Empty title="오늘 일정이 없습니다." description="첫 학습을 추가하면 Timer와 Today 화면에 자동 연결됩니다." action={<button className="button" onClick={() => navigate('plan:calendar')}>일정 추가</button>} />}</section>
    {resourceDeadlines.length>0&&<section className="today-resource-deadline" aria-labelledby="resource-deadline-title"><div className="today-section-head"><div><p className="card-label">RESOURCE DEADLINE</p><h2 id="resource-deadline-title">가까운 교재 마감</h2></div><button className="text-button" onClick={()=>navigate('train:resources')}>Resources<ArrowRight size={16}/></button></div><div className="today-deadline-list">{resourceDeadlines.map(resource=><article key={resource.id}><div><span className={`subject-badge ${resource.subject}`}>{resource.subject}</span><b>{resource.name}</b></div><span>{formatResourceDeadline(resource)} · {resource.done} / {resource.total}</span></article>)}</div></section>}

  </div>;
}
