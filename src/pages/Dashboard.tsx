import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Crosshair, MessageSquareText, RotateCw } from 'lucide-react';
import type { AppData, CalendarPlan } from '../types';
import type { Feedback } from '../lib/feedback';
import { Empty, PageHeader } from '../components/Ui';
import { formatKoreanDate, formatMinutes, toDateKey } from '../lib/date';
import { studentFeedback } from '../lib/feedback';
import { deriveLearningSignals } from '../lib/learningSignals';
import { parsePlannedMinutes } from '../lib/plannedTime';
import type { ActiveCoreRule, ReviewQueueResponse } from '../lib/archiveApi.ts';

const subjectLabel: Record<string, string> = { korean: '국어', math: '수학', english: '영어' };
const priorityLabel = (score: number) => score >= 40 ? '집중 교정' : score >= 15 ? '우선 확인' : score >= 5 ? '관찰' : '안정';

export default function Dashboard({ data, update, navigate }: { data: AppData; update: (fn: (value: AppData) => AppData) => void; navigate: (page: string) => void }) {
  const today = toDateKey();
  const analytics = useMemo(() => deriveLearningSignals(data, new Date(`${today}T12:00:00`)), [data, today]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [activeRules,setActiveRules]=useState<ActiveCoreRule[]>([]),[rulesLoading,setRulesLoading]=useState(true),[rulesError,setRulesError]=useState('');
  const [reviewCounts,setReviewCounts]=useState<ReviewQueueResponse['counts']|null>(null);
  const loadActiveRules=()=>{let active=true;setRulesLoading(true);setRulesError('');void import('../lib/archiveApi.ts').then(({archiveApi})=>archiveApi<{rules:ActiveCoreRule[]}>('/api/learning-intelligence/active-rules?limit=3')).then(value=>{if(active)setActiveRules(value.rules)}).catch(reason=>{if(active)setRulesError(reason instanceof Error?reason.message:'Learning Intelligence를 불러오지 못했습니다.');}).finally(()=>{if(active)setRulesLoading(false);});return()=>{active=false;};};
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

  return <div className="today-page today-dashboard-v2">
    <PageHeader eyebrow="TODAY" title={formatKoreanDate(new Date(`${today}T12:00:00`))} action={countdown && <span className="exam-indicator" title={data.examDate}>수능 {countdown}</span>} />

    <section className="today-command-grid" aria-label="오늘의 핵심 실행">
      <div className="today-next-card">
        <div><p className="eyebrow">NEXT ACTION</p><h2>{next?.title ?? (todayPlans.length ? '오늘의 계획을 모두 마쳤습니다' : '첫 학습을 계획하세요')}</h2><p>{next ? `${next.subject} · ${targetMinutes ? `목표 ${targetMinutes}분` : next.quantity || '목표량 미설정'}` : todayPlans.length ? 'Review와 학습 기록을 정리할 시간입니다.' : '일정을 추가하면 다음 학습이 여기에 연결됩니다.'}</p></div>
        <button className="button primary today-primary-action" onClick={() => navigate(next ? 'train:timer' : 'plan:calendar')}>{next ? '공부 시작' : '일정 추가'}<ArrowRight size={18} /></button>
      </div>
      <div className="today-execution-card">
        <span className="card-label">TODAY'S EXECUTION</span>
        <dl><div><dt>순공</dt><dd>{formatMinutes(analytics.execution.todayMinutes)}</dd></div><div><dt>계획 실행</dt><dd>{analytics.execution.completionRate === null ? '—' : `${analytics.execution.completionRate}%`}</dd></div><div><dt>완료</dt><dd>{completed.length}<small> / {todayPlans.length}</small></dd></div></dl>
      </div>
    </section>

    <section className="today-intelligence today-intelligence-v2" aria-labelledby="intelligence-title">
      <div className="today-section-head"><div><p className="card-label">LEARNING FOCUS</p><h2 id="intelligence-title">오늘 우선 교정할 사고</h2><p className="today-section-copy">실패 빈도와 최근 근거를 기준으로 다음 행동만 남겼습니다.</p></div><button className="button subtle" onClick={()=>void loadActiveRules()} disabled={rulesLoading}><RotateCw size={15}/>새로고침</button></div>
      {rulesLoading?<p className="today-loading">우선순위 Core Rule을 계산하는 중…</p>:rulesError?<div className="team-error" role="alert">{rulesError} <button className="button small" onClick={()=>void loadActiveRules()}>다시 시도</button></div>:activeRules.length?<div className="today-focus-rules">{activeRules.map((rule,index)=>{
        const nextCopy=rule.stats.failures7d>0?'관련 오답을 해설 없이 먼저 재현하세요.':rule.stats.reviewFailureCount>0?'최근 Review 실패 근거를 다시 검증하세요.':rule.stats.drillCount>0?'연결된 Drill로 규칙을 재현하세요.':'Archive 근거를 보고 규칙을 가볍게 Review하세요.';
        return <article key={rule.id} className={index===0?'focus-rule focus-rule-primary':'focus-rule'}>
          <div className="focus-rule-head"><div><span className="focus-subject">{subjectLabel[rule.subject] ?? rule.subject}</span><span className={`focus-priority priority-${rule.status.toLowerCase()}`}>{priorityLabel(rule.priorityScore)}</span></div><span className="focus-score">P{rule.priorityScore}</span></div>
          <h3>{rule.title}</h3>
          <div className="focus-rule-metrics"><span><b>{rule.stats.failures7d}</b>최근 7일 실패</span><span><b>{rule.stats.wrongAnswerCount}</b>오답 근거</span><span><b>{rule.stats.reviewCount}</b>Review</span></div>
          <div className="focus-rule-next"><small>NEXT ACTION</small><p>{nextCopy}</p></div>
          <div className="focus-rule-actions"><button className="button primary" onClick={()=>navigate(rule.stats.failures7d>0?'train:wrong':rule.stats.drillCount>0?'train:drill':'insights:review')}>{rule.stats.failures7d>0?'오답 재현':rule.stats.drillCount>0?'Drill 시작':'Review 시작'}<ArrowRight size={15}/></button><button className="text-button" onClick={()=>navigate('archive')}>근거 보기</button></div>
        </article>})}</div>:<Empty title="우선 교정할 Core Rule이 없습니다." description="오답이나 Learning Archive가 쌓이면 지금 먼저 바꿔야 할 사고를 보여줍니다."/>}
    </section>

    <div className="today-lower-grid">
      <div className="today-main-column">
        <section className="today-focus" aria-labelledby="focus-title"><div className="today-section-head"><div><p className="card-label">CURRENT BOTTLENECK</p><h2 id="focus-title">다음 문제에서 바꿀 한 가지</h2></div><button className="text-button" onClick={() => navigate('insights:bottlenecks')}>판단 근거<ArrowRight size={16} /></button></div><div className="focus-surface"><Crosshair size={22} /><div><span>현재 주요 병목</span><h3>{analytics.currentBottleneck?.name ?? '아직 병목 기록이 없습니다'}</h3><p>{action ?? '오답의 놓친 단서와 교정 행동을 기록해 다음 문제에 적용하세요.'}</p></div><button className="text-button" onClick={() => navigate('train:drill')}>교정 연습<ArrowRight size={16} /></button></div></section>
        <section className="today-schedule" aria-labelledby="schedule-title"><div className="today-section-head"><div><p className="card-label">TODAY'S SCHEDULE</p><h2 id="schedule-title">오늘 일정</h2></div><button className="text-button" onClick={() => navigate('plan:calendar')}>일정 열기<ArrowRight size={16} /></button></div>{todayPlans.length ? <div className="today-plan-list">{incomplete.map(planRow)}{completed.length > 0 && <><button className="completed-toggle" aria-expanded={showCompleted} onClick={() => setShowCompleted((value) => !value)}>완료 {completed.length}개 {showCompleted ? '접기' : '보기'}</button>{showCompleted && completed.map(planRow)}</>}</div> : <Empty title="오늘 일정이 없습니다." description="첫 학습을 추가하면 Timer와 Today 화면에 자동 연결됩니다." action={<button className="button" onClick={() => navigate('plan:calendar')}>일정 추가</button>} />}</section>
      </div>
      <aside className="today-side-column">
        {reviewCounts&&<button className="today-side-card review" onClick={()=>navigate('insights:review')}><span className="card-label">REVIEW</span><strong>{reviewCounts.due}</strong><p>오늘 확인할 항목</p><small>연체 {reviewCounts.overdue} · 오늘 {reviewCounts.today}</small><ArrowRight size={17}/></button>}
        {feedback&&<button className="today-side-card feedback" onClick={() => navigate('feedback')}><MessageSquareText size={20}/><span className="card-label">TEACHER FEEDBACK</span><b>{feedback.title || feedback.bottleneck || '새로운 피드백'}</b><p>{feedback.observation || feedback.action || '확인할 피드백이 있습니다.'}</p><ArrowRight size={17}/></button>}
        <button className="today-side-card coach" onClick={() => navigate('coach')}><span className="card-label">AI COACH</span><b>{action ? '교정 행동 구체화' : '다음 학습 정리'}</b><p>오늘 {formatMinutes(analytics.execution.todayMinutes)}의 기록을 다음 행동으로 연결합니다.</p><ArrowRight size={17}/></button>
      </aside>
    </div>
  </div>;
}
