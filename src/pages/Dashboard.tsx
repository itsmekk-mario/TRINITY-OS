import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Clock3, Crosshair, MessageSquareText, Sparkles } from 'lucide-react';
import type { AppData, CalendarPlan } from '../types';
import type { Feedback } from '../lib/feedback';
import { Card, Empty, PageHeader } from '../components/Ui';
import { formatKoreanDate, formatMinutes, toDateKey } from '../lib/date';
import { studentFeedback } from '../lib/feedback';
import { deriveLearningSignals } from '../lib/learningSignals';
import LearningSignalCards from '../components/insights/LearningSignalCards';
import DailyCoachCard from '../components/DailyCoachCard';

export default function Dashboard({ data, update, navigate }: { data: AppData; update: (fn: (value: AppData) => AppData) => void; navigate: (page: string) => void }) {
  const now = new Date(); const today = toDateKey(now); const todayPlans = data.calendar[today]?.plans ?? [];
  const analytics = useMemo(() => deriveLearningSignals(data, now), [data]);
  const [feedback, setFeedback] = useState<Feedback | null>(null); const [showCompleted, setShowCompleted] = useState(false);
  useEffect(() => { void studentFeedback().then(({ feedback: items }) => setFeedback(items.find((item) => item.progress === 'active' && !item.acknowledgedByStudent) ?? null)).catch(() => setFeedback(null)); }, []);
  const completed = todayPlans.filter((item) => item.done); const incomplete = todayPlans.filter((item) => !item.done); const next = incomplete[0];
  const togglePlan = (id: string) => update((value) => { const entry = value.calendar[today]; if (!entry) return value; return { ...value, calendar: { ...value.calendar, [today]: { ...entry, plans: (entry.plans ?? []).map((item) => item.id === id ? { ...item, done: !item.done } : item) } } }; });
  const planRow = (item: CalendarPlan) => <div key={item.id} className={item.done ? 'done' : ''}><button className="plan-check" aria-label={`${item.title} 완료 상태 변경`} onClick={() => togglePlan(item.id)}>{item.done ? <Check size={14} /> : '○'}</button><span className={`subject-badge ${item.subject}`}>{item.subject}</span><span><b>{item.title}</b>{item.detail && <small>{item.detail}</small>}</span><em>{item.quantity}</em></div>;

  return <div className="today-page"><PageHeader eyebrow="TODAY" title="오늘의 학습" description={formatKoreanDate(now)} />
    <section className="today-hero" aria-label="오늘 핵심 현황"><div className="today-primary"><span>오늘 공부시간</span><strong className="metric-number">{formatMinutes(analytics.execution.todayMinutes)}</strong><small>{analytics.execution.plannedMinutes ? `계획 ${formatMinutes(analytics.execution.plannedMinutes)}` : '시간 계획이 아직 없습니다.'}</small></div><div className="today-primary"><span>계획 대비 실행</span><strong className="metric-number">{analytics.execution.completionRate ?? 0}%</strong><small>{analytics.execution.planItemRate === null ? '오늘 계획 없음' : `항목 완료율 ${analytics.execution.planItemRate}%`}</small></div><div className="today-next"><span>NEXT</span><strong>{next?.title ?? '오늘 계획 완료'}</strong><small>{next ? `${next.subject} · ${next.quantity || '목표량 미설정'}` : '다음 학습을 계획해도 좋습니다.'}</small><button onClick={() => navigate(next ? 'train:timer' : 'plan:calendar')}>{next ? 'Timer 시작' : '계획 추가'} <ArrowRight size={16} /></button></div></section>
    <div className="today-section-head"><div><span className="card-label">LEARNING SIGNALS</span><h2>지금 알아야 할 변화</h2></div><button className="text-button" onClick={() => navigate('insights:overview')}>전체 Insights <ArrowRight size={15} /></button></div>
    <LearningSignalCards signals={analytics.signals.filter((signal) => signal.type !== 'time')} limit={3} />
    <div className="today-decision-grid"><Card className="decision-card bottleneck"><div><Crosshair /><span>CURRENT BOTTLENECK</span></div><h2>{analytics.currentBottleneck?.name ?? '병목 기록 대기'}</h2><p>{analytics.currentBottleneck ? `최근 14일 ${analytics.currentBottleneck.current}회 · 이전 14일 ${analytics.currentBottleneck.previous}회` : 'Wrong Answer Drill에서 원인을 분류하면 반복 병목을 찾습니다.'}</p><button className="text-button" onClick={() => navigate('insights:bottlenecks')}>근거 보기 <ArrowRight /></button></Card><Card className="decision-card action"><div><Sparkles /><span>RECOMMENDED ACTION</span></div><h2>{analytics.recommendedAction ?? '오늘의 교정 행동을 정하세요.'}</h2><p>다음 문제에서 실행 가능한 한 가지 행동으로 시작합니다.</p><button className="text-button" onClick={() => navigate('train:drill')}>Drill로 이동 <ArrowRight /></button></Card></div>
    <div className="today-content-grid"><Card className="today-schedule"><div className="hub-card-head"><div><span className="card-label">TODAY'S SCHEDULE</span><h2>오늘 일정</h2></div><button className="text-button" onClick={() => navigate('plan:calendar')}>Calendar <ArrowRight size={15} /></button></div>{todayPlans.length ? <div className="today-plan-list">{incomplete.map(planRow)}{completed.length > 0 && <><button className="completed-toggle" onClick={() => setShowCompleted((value) => !value)}>완료 {completed.length}개 {showCompleted ? '접기' : '보기'}</button>{showCompleted && completed.map(planRow)}</>}</div> : <Empty>오늘 일정이 없습니다.<br />Calendar에서 학습 계획을 추가하세요.</Empty>}</Card>
      <div className="today-side">{feedback && <Card className="teacher-signal"><div><MessageSquareText /><span>TEACHER SIGNAL</span></div><small>{feedback.subject ?? '전체'} · 새로운 피드백</small><h2>{feedback.title || feedback.bottleneck || '선생님 피드백'}</h2><p>{feedback.observation || feedback.action || '확인할 피드백이 있습니다.'}</p><button className="text-button" onClick={() => navigate('feedback')}>피드백 보기 <ArrowRight /></button></Card>}<Card className="today-quick"><Clock3 /><div><span>Capture once, reuse everywhere.</span><p>실모와 오답 기록은 Review와 AI Coach의 맥락으로 자동 연결됩니다.</p></div></Card></div>
    </div>
    <div className="today-section-head"><div><span className="card-label">AI COACH</span><h2>오늘의 코칭</h2></div><button className="text-button" onClick={() => navigate('coach')}>Coach 전체 화면 <ArrowRight /></button></div><DailyCoachCard data={data} />
  </div>;
}
