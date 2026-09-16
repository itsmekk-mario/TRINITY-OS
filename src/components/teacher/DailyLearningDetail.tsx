import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck, Clock3, FileText, Flag, Target, X } from 'lucide-react';
import { parsePlannedMinutes } from '../../lib/plannedTime';
import { formatStudyTime, type TeacherData } from '../../lib/teacherAnalytics';
import { toDateKey } from '../../lib/date';
import { Empty, SectionTitle } from '../Ui';

const SUBJECTS = ['국어', '수학', '영어', '탐구'] as const;
const dateAtSeoulNoon = (key: string) => new Date(`${key}T12:00:00+09:00`);
const dateLabel = (key: string) => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long' }).format(dateAtSeoulNoon(key));
const monthLabel = (year: number, month: number) => `${year}년 ${month + 1}월`;
const minutes = (seconds: number) => Math.round(seconds / 60);
const compact = (seconds: number) => seconds >= 3600 ? `${Math.floor(seconds / 3600)}h ${Math.round(seconds % 3600 / 60)}m` : `${Math.round(seconds / 60)}m`;
const weekStart = (key: string) => { const value = dateAtSeoulNoon(key); value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() || 7) - 1)); return toDateKey(value); };

function DayDetail({ data, date, onClose }: { data: TeacherData; date: string; onClose: () => void }) {
  const view = useMemo(() => {
    const plans = data.plans.filter(item => item.date === date);
    const sessions = data.sessions.filter(item => item.date === date);
    const day = data.calendarDays?.find(item => item.date === date);
    const totalSeconds = sessions.reduce((sum, item) => sum + item.seconds, 0) || (day?.minutes ?? 0) * 60;
    const plannedMinutes = plans.reduce((sum, item) => sum + parsePlannedMinutes(item.quantity), 0);
    const bySubject = Object.fromEntries(SUBJECTS.map(subject => [subject, sessions.filter(item => item.subject === subject).reduce((sum, item) => sum + item.seconds, 0)]));
    const drills = data.dailyDrills.filter(item => item.date === date);
    const wrong = data.wrongAnswerDrills.filter(item => item.date === date);
    const scores = data.scores.filter(item => item.date === date);
    const start = weekStart(date);
    const goals = data.weeklyCapabilityGoals.filter(item => item.weekStart === start);
    const plaire = data.plaire?.find(item => item.date === date);
    const trinity = data.trinity?.filter(item => item.date === date) ?? [];
    const subjects = new Set([...plans.map(item => item.subject), ...sessions.map(item => item.subject), ...drills.map(item => item.subject)]);
    return { plans, sessions, day, totalSeconds, plannedMinutes, bySubject, drills, wrong, scores, goals, plaire, trinity, subjects };
  }, [data, date]);
  const done = view.plans.filter(item => item.done).length;
  const execution = view.plannedMinutes ? Math.round(minutes(view.totalSeconds) / view.plannedMinutes * 100) : undefined;
  const hasData = view.plans.length || view.sessions.length || view.day || view.drills.length || view.wrong.length || view.scores.length;
  return <aside className="daily-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="daily-detail-title">
    <header className="daily-detail-header"><div><p className="eyebrow">DAILY LEARNING DETAIL</p><h2 id="daily-detail-title">{dateLabel(date)}</h2></div><button className="icon-button" onClick={onClose} aria-label="일별 학습내역 닫기"><X /></button></header>
    {!hasData ? <Empty title="이 날짜의 학습 기록이 없습니다." description="계획·타이머·Drill·실모 기록이 동기화되면 이곳에 연결됩니다." /> : <div className="daily-detail-content">
      <section className="daily-summary-grid"><div><span>총 실제 학습</span><b>{formatStudyTime(view.totalSeconds)}</b></div><div><span>계획 학습시간</span><b>{view.plannedMinutes ? `${view.plannedMinutes}m` : '미기록'}</b></div><div><span>계획 대비 실행률</span><b>{execution === undefined ? '분석 불가' : `${execution}%`}</b></div><div><span>완료 과제</span><b>{done} / {view.plans.length}</b></div><div><span>학습 과목</span><b>{view.subjects.size}개</b></div><div><span>집중 세션</span><b>{view.sessions.length}회</b></div></section>

      <section><SectionTitle title="계획 vs 실제 실행" meta="시간은 과목별 실제 타이머 기록 기준" />{view.plans.length ? <div className="daily-plan-list">{view.plans.map(plan => <article key={plan.id}><span className={`subject-badge ${plan.subject}`}>{plan.subject}</span><div><b>{plan.title}</b><small>계획 {plan.quantity || '목표량 미기록'} · 실제 {compact(view.bySubject[plan.subject as typeof SUBJECTS[number]] ?? 0)}</small></div><em className={plan.done ? 'is-done' : ''}>{plan.done ? '완료' : (view.bySubject[plan.subject as typeof SUBJECTS[number]] ?? 0) ? '일부 완료' : '미실행'}</em></article>)}</div> : <p className="teacher-panel-description">등록된 계획은 없고 실제 기록만 있을 수 있습니다.</p>}</section>

      {view.sessions.length > 0 && <section><SectionTitle title="실제 학습 구성" /> <div className="daily-subject-breakdown">{SUBJECTS.filter(subject => view.bySubject[subject]).map(subject => <span key={subject}><i className={`subject-dot ${subject}`} />{subject}<b>{compact(view.bySubject[subject])}</b></span>)}</div></section>}
      {(view.day?.study || view.day?.reflection || view.day?.event || view.day?.exam) && <section className="daily-note-card"><SectionTitle title="학생 실행 기록" />{view.day?.study && <p><b>실행</b>{view.day.study}</p>}{view.day?.exam && <p><b>시험·모의고사</b>{view.day.exam}</p>}{view.day?.event && <p><b>영향 사건</b>{view.day.event}</p>}{view.day?.condition && <p><b>컨디션</b>{view.day.condition} / 5</p>}{view.day?.reflection && <p><b>회고·다음 조정</b>{view.day.reflection}</p>}</section>}
      {view.scores.length > 0 && <section><SectionTitle title="실모·성과 기록" />{view.scores.map(score => <article className="daily-evidence-row" key={score.id}><FileText size={16}/><div><b>{score.name}</b><small>국어 {score.korean ?? '—'} · 수학 {score.math ?? '—'} · 영어 {score.english ?? '—'}</small></div></article>)}</section>}
      {(view.drills.length || view.wrong.length) > 0 && <section><SectionTitle title="오답 · Drill" />{view.drills.map(item => <article className="daily-evidence-row" key={item.id}><ClipboardCheck size={16}/><div><b>{item.subject} · {item.title}</b><small>{item.done ? '완료' : '미완료'} · {item.minutes}분 {item.reflection ? `· ${item.reflection}` : ''}</small></div></article>)}{view.wrong.map(item => <article className="daily-evidence-row" key={item.id}><Flag size={16}/><div><b>{item.subject} · {item.question || item.source}</b><small>병목 {item.bottleneck || '미분류'} · {item.missedCue || '놓친 단서 미기록'}</small></div></article>)}</section>}
      {(view.goals.length > 0 || Boolean(view.plaire) || view.trinity.length > 0) && <section><SectionTitle title="학습 병목·다음 행동" />{view.goals.map(item => <article className="daily-evidence-row" key={item.id}><Target size={16}/><div><b>{item.subject} · {item.ability}</b><small>{item.done ? '완료' : '진행 중'} · {item.successCriterion}</small></div></article>)}{view.plaire && <article className="daily-evidence-row"><Clock3 size={16}/><div><b>오늘의 병목</b><small>{view.plaire.bottleneck || '미기록'}{view.plaire.nextAction ? ` · 다음 행동: ${view.plaire.nextAction}` : ''}</small></div></article>}{view.trinity.map(item => <article className="daily-evidence-row" key={item.id}><Target size={16}/><div><b>{item.subject} Trinity 분석</b><small>{Object.values(item.fields).filter(Boolean).slice(0, 2).join(' · ') || '분석 내용 미기록'}</small></div></article>)}</section>}
    </div>}
  </aside>;
}

export default function DailyLearningDetail({ data }: { data: TeacherData }) {
  const today = toDateKey();
  const [cursor, setCursor] = useState(() => dateAtSeoulNoon(today));
  const [selected, setSelected] = useState<string>();
  const year = cursor.getUTCFullYear(), month = cursor.getUTCMonth();
  const cells = useMemo(() => { const first = new Date(Date.UTC(year, month, 1)); const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate(); return [...Array(first.getUTCDay()).fill(null), ...Array.from({ length: count }, (_, index) => index + 1)]; }, [year, month]);
  const stateFor = (date: string) => { const sessions = data.sessions.filter(item => item.date === date); const plans = data.plans.filter(item => item.date === date); const drills = data.dailyDrills.filter(item => item.date === date); const scores = data.scores.filter(item => item.date === date); return { sessions, plans, drills, scores, seconds: sessions.reduce((sum, item) => sum + item.seconds, 0) || (data.calendarDays?.find(item => item.date === date)?.minutes ?? 0) * 60 }; };
  return <section className="teacher-daily-detail"><SectionTitle title="Daily Learning Detail" meta="날짜를 선택해 계획 · 실행 · 성과 · 병목을 함께 확인" /><div className="teacher-calendar-card"><header><button className="icon-button" aria-label="이전 달" onClick={() => setCursor(new Date(Date.UTC(year, month - 1, 1)))}><ChevronLeft /></button><h3><CalendarDays size={17}/>{monthLabel(year, month)}</h3><button className="icon-button" aria-label="다음 달" onClick={() => setCursor(new Date(Date.UTC(year, month + 1, 1)))}><ChevronRight /></button></header><div className="teacher-calendar-weekdays">{['일','월','화','수','목','금','토'].map(item => <span key={item}>{item}</span>)}</div><div className="teacher-calendar-grid">{cells.map((day, index) => { if (!day) return <span key={`empty-${index}`} />; const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`, state = stateFor(date), subjects = [...new Set(state.sessions.map(item => item.subject))]; const done = state.plans.length > 0 && state.plans.every(item => item.done); return <button key={date} className={`${date === today ? 'is-today' : ''} ${selected === date ? 'is-selected' : ''}`} onClick={() => setSelected(date)}><b>{day}</b>{state.seconds > 0 && <small>{subjects.length ? `${subjects.slice(0, 3).join(' · ')} ` : ''}{compact(state.seconds)}</small>}<i className="teacher-calendar-markers">{state.plans.length > 0 && <em className={done ? 'complete' : 'partial'} />}{state.scores.length > 0 && <em className="score" />}{(state.drills.length > 0 || data.wrongAnswerDrills.some(item => item.date === date)) && <em className="drill" />}</i></button>; })}</div><p className="teacher-calendar-legend"><i className="complete" />계획 완료 <i className="partial" />일부 미완료 <i className="score" />실모 <i className="drill" />오답·Drill</p></div>{selected && <DayDetail data={data} date={selected} onClose={() => setSelected(undefined)} />}</section>;
}
