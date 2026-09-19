import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Crosshair, MessageSquareText } from 'lucide-react';
import type { AppData, CalendarPlan } from '../types';
import type { Feedback } from '../lib/feedback';
import { Empty, PageHeader } from '../components/Ui';
import { formatKoreanDate, formatMinutes, toDateKey } from '../lib/date';
import { studentFeedback } from '../lib/feedback';
import { deriveLearningSignals } from '../lib/learningSignals';
import { parsePlannedMinutes } from '../lib/plannedTime';
import type { ActiveCoreRule, ReviewQueueResponse } from '../lib/archiveApi.ts';

export default function Dashboard({ data, update, navigate }: { data: AppData; update: (fn: (value: AppData) => AppData) => void; navigate: (page: string) => void }) {
  const today = toDateKey();
  const analytics = useMemo(() => deriveLearningSignals(data, new Date(`${today}T12:00:00`)), [data, today]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [activeRules,setActiveRules]=useState<ActiveCoreRule[]>([]),[rulesLoading,setRulesLoading]=useState(true),[rulesError,setRulesError]=useState(''),[rulesFetchedAt,setRulesFetchedAt]=useState<string|null>(null);
  const [reviewCounts,setReviewCounts]=useState<ReviewQueueResponse['counts']|null>(null);
  const loadActiveRules=()=>{let active=true;setRulesLoading(true);setRulesError('');void import('../lib/archiveApi.ts').then(({archiveApi})=>archiveApi<{rules:ActiveCoreRule[]}>('/api/learning-intelligence/active-rules?limit=3')).then(value=>{if(active){setActiveRules(value.rules);setRulesFetchedAt(new Date().toISOString());}}).catch(reason=>{if(active)setRulesError(reason instanceof Error?reason.message:'Learning Intelligence를 불러오지 못했습니다.');}).finally(()=>{if(active)setRulesLoading(false);});return()=>{active=false;};};
  useEffect(() => {
    let active = true;
    void studentFeedback().then(({ feedback: items }) => { if (active) setFeedback(items.find((item) => item.progress === 'active' && !item.acknowledgedByStudent) ?? null); }).catch(() => { if (active) setFeedback(null); });
    return () => { active = false; };
  }, []);
  useEffect(()=>loadActiveRules(),[]);
  useEffect(()=>{let active=true;void import('../lib/archiveApi.ts').then(({archiveApi})=>archiveApi<ReviewQueueResponse>('/api/learning-intelligence/reviews?view=queue')).then(value=>{if(active)setReviewCounts(value.counts)}).catch(()=>{if(active)setReviewCounts(null)});return()=>{active=false}},[]);
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
  const action = analytics.recommendedAction;

  return <div className="today-page">
    <PageHeader eyebrow="TODAY" title={formatKoreanDate(new Date(`${today}T12:00:00`))} action={countdown && <span className="exam-indicator" title={data.examDate}>수능 {countdown}</span>} />
    <section className="next-action" aria-labelledby="next-title"><div><p className="eyebrow">NEXT</p><h2 id="next-title">{next?.title ?? (todayPlans.length ? '오늘의 계획을 모두 마쳤습니다' : '첫 학습을 계획하세요')}</h2><p>{next ? `${next.subject} · ${targetMinutes ? `목표 ${targetMinutes}분` : next.quantity || '목표량 미설정'}` : todayPlans.length ? '기록을 돌아보거나 다음 학습을 준비하세요.' : '일정을 추가하면 다음 학습이 여기에 연결됩니다.'}</p></div><button className="button primary" onClick={() => navigate(next ? 'train:timer' : 'plan:calendar')}>{next ? '공부 시작' : '일정 추가'}<ArrowRight size={18} /></button></section>
    <section className="execution-section" aria-label="오늘의 실행"><p className="card-label">TODAY'S EXECUTION</p><dl className="execution-strip"><div><dt>오늘 학습</dt><dd className="metric-number">{formatMinutes(analytics.execution.todayMinutes)}</dd></div><div><dt>계획 실행</dt><dd className="metric-number">{analytics.execution.completionRate === null ? '—' : `${analytics.execution.completionRate}%`}</dd></div><div><dt>일정 완료</dt><dd className="metric-number">{completed.length}<span> / {todayPlans.length}</span></dd></div></dl></section>
    <section className="today-focus" aria-labelledby="focus-title"><div className="today-section-head"><div><p className="card-label">TODAY'S FOCUS</p><h2 id="focus-title">다음 문제에서 바꿀 한 가지</h2></div><button className="text-button" onClick={() => navigate('insights:bottlenecks')}>판단 근거<ArrowRight size={16} /></button></div><div className="focus-surface"><Crosshair size={22} /><div><span>현재 주요 병목</span><h3>{analytics.currentBottleneck?.name ?? '아직 병목 기록이 없습니다'}</h3><p>{action ?? '오답의 놓친 단서와 교정 행동을 기록해 다음 문제에 적용하세요.'}</p></div><button className="text-button" onClick={() => navigate('train:drill')}>교정 연습<ArrowRight size={16} /></button></div></section>
    <section className="today-schedule" aria-labelledby="schedule-title"><div className="today-section-head"><div><p className="card-label">TODAY'S SCHEDULE</p><h2 id="schedule-title">오늘 일정</h2></div><button className="text-button" onClick={() => navigate('plan:calendar')}>일정 열기<ArrowRight size={16} /></button></div>{todayPlans.length ? <div className="today-plan-list">{incomplete.map(planRow)}{completed.length > 0 && <><button className="completed-toggle" aria-expanded={showCompleted} onClick={() => setShowCompleted((value) => !value)}>완료 {completed.length}개 {showCompleted ? '접기' : '보기'}</button>{showCompleted && completed.map(planRow)}</>}</div> : <Empty title="오늘 일정이 없습니다." description="첫 학습을 추가하면 Timer와 Today 화면에 자동 연결됩니다." action={<button className="button" onClick={() => navigate('plan:calendar')}>일정 추가</button>} />}</section>
    {feedback && <section className="today-feedback"><p className="card-label">TEACHER FEEDBACK</p><button className="feedback-action" onClick={() => navigate('feedback')}><MessageSquareText size={22} /><span><small>{feedback.subject ?? '전체'} · 새로운 피드백</small><b>{feedback.title || feedback.bottleneck || '선생님 피드백'}</b><span>{feedback.observation || feedback.action || '확인할 피드백이 있습니다.'}</span></span><ArrowRight size={18} /></button></section>}
    {reviewCounts&&reviewCounts.due>0&&<section className="today-review-due"><div><p className="card-label">REVIEW DUE</p><h2>오늘 확인할 Review {reviewCounts.due}개</h2><p>연체 {reviewCounts.overdue} · 오늘 {reviewCounts.today}</p></div><button className="button" onClick={()=>navigate('insights:review')}>Review Queue<ArrowRight size={16}/></button></section>}
    <section className="today-coach"><p className="card-label">AI COACH</p><div><p>오늘 {formatMinutes(analytics.execution.todayMinutes)} 학습했습니다. {action ? '이번 학습의 교정 행동을 Coach와 구체화하세요.' : '오늘의 기록을 바탕으로 다음 학습 행동을 정리하세요.'}</p><button className="text-button" onClick={() => navigate('coach')}>코칭 보기<ArrowRight size={16} /></button></div></section>
    <section className="today-intelligence" aria-labelledby="intelligence-title"><div className="today-section-head"><div><p className="card-label">LEARNING INTELLIGENCE</p><h2 id="intelligence-title">오늘의 Next Action</h2></div><button className="text-button" onClick={()=>void loadActiveRules()} disabled={rulesLoading}>새로고침</button></div>{rulesLoading?<p>우선순위 규칙을 불러오는 중…</p>:rulesError?<div className="team-error" role="alert">{rulesError} <button className="button small" onClick={()=>void loadActiveRules()}>다시 시도</button></div>:activeRules.length?<div className="today-intelligence-list">{activeRules.map((rule,index)=><article key={rule.id}><span>{index+1}. {rule.subject}</span><h3>{rule.title}</h3><p>Priority {rule.priorityScore} · 최근 7일 실패 {rule.stats.failures7d}회 · 최근 30일 실패 {rule.stats.failures30d}회</p><p>{rule.stats.failures7d>0?'최근 실패가 있어 관련 오답을 먼저 재현하세요.':rule.stats.reviewFailureCount>0?'Review 실패 기록이 있어 다시 검증하세요.':rule.stats.drillCount>0?'연결된 Drill을 완료해 규칙을 검증하세요.':'Archive 근거를 바탕으로 규칙을 Review하세요.'}</p><div><button className="button small" onClick={()=>navigate('train:drill')}>Drill</button><button className="button small" onClick={()=>navigate('archive')}>Evidence</button><button className="button small" onClick={()=>navigate('insights:review')}>Review</button></div></article>)}</div>:<Empty title="우선순위 Core Rule이 없습니다." description="아직 충분한 학습 근거가 없습니다. 오답 또는 Learning Archive를 기록하면 다음 행동을 제안합니다."/>}{rulesFetchedAt&&<small className="today-intelligence-stale">서버 기준 {new Date(rulesFetchedAt).toLocaleTimeString()}</small>}</section>
  </div>;
}
