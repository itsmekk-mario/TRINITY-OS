import { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import type { AppData, CalendarPlan, PlanOutcome, Subject } from '../types';
import { SUBJECTS } from '../data/config';
import { emptyDay } from '../lib/planGraph';
import { parsePlannedMinutes } from '../lib/plannedTime';
import { toDateKey, uid, weekStartKey } from '../lib/date';
import { Empty, PageHeader } from '../components/Ui';
import DayLabelEditor from '../components/DayLabelEditor';
import PlanLinks from '../components/PlanLinks';

const blankPlan = (): CalendarPlan => ({ id: '', subject: '국어', title: '', detail: '', quantity: '', done: false, priority: 'normal' });
const statusOf = (plan: CalendarPlan) => plan.outcome ?? (plan.done ? 'achieved' : 'planned');

export default function DailyPlan({ data, update, date, onDate }: {
  data: AppData;
  update: (fn: (value: AppData) => AppData) => void;
  date: string;
  onDate: (date: string) => void;
}) {
  const [draft, setDraft] = useState<CalendarPlan>(blankPlan);
  const entry = data.calendar[date] ?? emptyDay(date);
  const plans = entry.plans ?? [];
  const completed = plans.filter(plan => statusOf(plan) === 'achieved').length;
  const plannedMinutes = plans.reduce((sum, plan) => sum + (parsePlannedMinutes(plan.quantity) ?? 0), 0);
  const actualMinutes = Math.round(data.sessions.filter(session => session.date === date).reduce((sum, session) => sum + session.seconds, 0) / 60);
  const goals = data.weeklyCapabilityGoals.filter(goal => goal.weekStart === weekStartKey(new Date(`${date}T12:00:00`)));
  const changeDay = (delta: number) => {
    const next = new Date(`${date}T12:00:00`);
    next.setDate(next.getDate() + delta);
    onDate(toDateKey(next));
  };
  const patchPlan = (id: string, patch: Partial<CalendarPlan>) => update(value => {
    const current = value.calendar[date] ?? emptyDay(date);
    return { ...value, calendar: { ...value.calendar, [date]: { ...current, plans: (current.plans ?? []).map(plan => plan.id === id ? { ...plan, ...patch, updatedAt: new Date().toISOString() } : plan) } } };
  });
  const addPlan = () => {
    if (!draft.title.trim()) return;
    update(value => {
      const current = value.calendar[date] ?? emptyDay(date);
      return { ...value, calendar: { ...value.calendar, [date]: { ...current, plans: [...(current.plans ?? []), { ...draft, id: uid(), title: draft.title.trim(), detail: draft.detail.trim(), quantity: draft.quantity.trim(), updatedAt: new Date().toISOString() }] } } };
    });
    setDraft(blankPlan());
  };
  const removePlan = (id: string) => {
    if (!window.confirm('이 계획을 삭제할까요?')) return;
    update(value => {
      const current = value.calendar[date] ?? emptyDay(date);
      return { ...value, calendar: { ...value.calendar, [date]: { ...current, plans: (current.plans ?? []).filter(plan => plan.id !== id) } } };
    });
  };
  const setStatus = (plan: CalendarPlan, status: PlanOutcome | 'planned') => patchPlan(plan.id, { outcome: status === 'planned' ? undefined : status, done: status === 'achieved' });

  return <div className="daily-plan-page">
    <PageHeader eyebrow="DAILY PLAN" title="오늘 할 일을 배치합니다" description="Weekly Plan의 목표를 날짜에 연결하고, 실행 결과를 같은 항목에 남깁니다." />
    <div className="daily-plan-datebar"><button aria-label="이전 날짜" onClick={() => changeDay(-1)}><ChevronLeft /></button><label>날짜<input type="date" value={date} onChange={event => onDate(event.target.value)} /></label><button aria-label="다음 날짜" onClick={() => changeDay(1)}><ChevronRight /></button><button className="text-button" onClick={() => onDate(toDateKey())}>오늘</button></div>
    <div className="daily-plan-summary"><strong>{completed} / {plans.length} Tasks</strong><span>예상 {plannedMinutes}분</span><span>실제 {actualMinutes}분</span></div>
    <DayLabelEditor entry={entry} onChange={next => update(value => ({ ...value, calendar: { ...value.calendar, [date]: next } }))} />
    <section className="daily-plan-list" aria-label="일일 계획">
      {plans.length ? plans.map(plan => <article className="daily-plan-item" key={plan.id}>
        <div className="daily-plan-item-main"><span className={`subject-badge ${plan.subject}`}>{plan.subject}</span><div><h3>{plan.title}</h3><p>{plan.detail || '세부 내용 없음'}</p><small>{plan.quantity || '예상 시간 미설정'} · {plan.priority === 'high' ? '높은 우선순위' : plan.priority === 'low' ? '낮은 우선순위' : '보통 우선순위'}{plan.weeklyPlanId && ` · ${goals.find(goal => goal.id === plan.weeklyPlanId)?.ability ?? 'Weekly Goal 연결'}`}</small></div></div>
        <div className="daily-plan-item-actions"><select aria-label={`${plan.title} 상태`} value={statusOf(plan)} onChange={event => setStatus(plan, event.target.value as PlanOutcome | 'planned')}><option value="planned">○ 예정</option><option value="in_progress">▶ 진행 중</option><option value="achieved">✓ 완료</option><option value="partial">△ 일부 완료</option><option value="failed">× 실패</option></select><button className="icon-button danger" aria-label={`${plan.title} 삭제`} onClick={() => removePlan(plan.id)}><Trash2 size={16} /></button></div>
      </article>) : <Empty title="아직 이 날짜의 계획이 없습니다." description="이번 주 목표와 연결된 첫 계획을 추가하세요." />}
    </section>
    <section className="daily-plan-add" aria-label="계획 추가"><h2>계획 추가</h2><div className="form-grid two"><label>과목<select value={draft.subject} onChange={event => setDraft({ ...draft, subject: event.target.value as Subject | '생활' })}>{[...SUBJECTS, '생활'].map(subject => <option key={subject}>{subject}</option>)}</select></label><label>학습 내용<input value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="예: 뉴런 수1 Theme 14" /></label><label>예상 시간 / 목표량<input value={draft.quantity} onChange={event => setDraft({ ...draft, quantity: event.target.value })} placeholder="예: 45분" /></label><label>우선순위<select value={draft.priority} onChange={event => setDraft({ ...draft, priority: event.target.value as CalendarPlan['priority'] })}><option value="high">높음</option><option value="normal">보통</option><option value="low">낮음</option></select></label></div><label>메모<input value={draft.detail} onChange={event => setDraft({ ...draft, detail: event.target.value })} placeholder="학습 범위 또는 완료 기준" /></label><PlanLinks data={data} date={date} plan={draft} onChange={patch => setDraft({ ...draft, ...patch })} /><button className="button primary" disabled={!draft.title.trim()} onClick={addPlan}><Plus size={16} /> 계획 추가</button></section>
  </div>;
}
