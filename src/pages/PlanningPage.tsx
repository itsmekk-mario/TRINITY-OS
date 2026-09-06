import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { AppData, CalendarEntry, CalendarPlan, MonthlyPlan, Subject } from '../types';
import { SUBJECTS } from '../data/config';
import { Card, Empty, Field, PageHeader, SaveButton, TextArea } from '../components/Ui';
import { toDateKey, uid, weekStartKey } from '../lib/date';

type WeeklyTaskDraft = CalendarPlan & { date: string };
const emptyCalendar = (date: string): CalendarEntry => ({ date, study: '', minutes: 0, exam: '', event: '', condition: 3, reflection: '', plans: [] });
const blankPlan = (): MonthlyPlan => ({ id: '', month: toDateKey().slice(0, 7), subject: '국어', title: '', objective: '', successCriterion: '', strategy: '', done: false });
const blankTask = (date: string): WeeklyTaskDraft => ({ id: '', date, subject: '국어', title: '', detail: '', quantity: '', done: false });
const dateLabel = (date: string) => new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(new Date(`${date}T00:00:00`));
const weekDates = (start: string) => Array.from({ length: 7 }, (_, index) => { const date = new Date(`${start}T00:00:00`); date.setDate(date.getDate() + index); return toDateKey(date); });

export default function PlanningPage({ data, update }: { data: AppData; update: (fn: (value: AppData) => AppData) => void }) {
  const [tab, setTab] = useState<'weekly' | 'monthly'>('weekly');
  const [weekStart, setWeekStart] = useState(weekStartKey());
  const [month, setMonth] = useState(toDateKey().slice(0, 7));
  const [taskDate, setTaskDate] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [task, setTask] = useState<WeeklyTaskDraft>(blankTask(weekStartKey()));
  const [openMonthly, setOpenMonthly] = useState(false);
  const [monthlyDraft, setMonthlyDraft] = useState(blankPlan());
  const dates = useMemo(() => weekDates(weekStart), [weekStart]);
  const monthlyPlans = useMemo(() => data.monthlyPlans.filter((item) => item.month === month), [data.monthlyPlans, month]);
  const openTask = (date: string, existing?: CalendarPlan) => { setTaskDate(date); setEditingTaskId(existing?.id ?? null); setTask(existing ? { ...existing, date } : blankTask(date)); };
  const closeTask = () => { setTaskDate(null); setEditingTaskId(null); };
  const saveTask = () => {
    if (!taskDate || !task.title.trim()) return;
    update((value) => {
      const entry = value.calendar[taskDate] ?? emptyCalendar(taskDate);
      const saved: CalendarPlan = { id: editingTaskId ?? uid(), subject: task.subject, title: task.title.trim(), detail: task.detail.trim(), quantity: task.quantity.trim(), done: editingTaskId ? (entry.plans ?? []).find((item) => item.id === editingTaskId)?.done ?? false : false };
      const plans = editingTaskId ? (entry.plans ?? []).map((item) => item.id === editingTaskId ? saved : item) : [...(entry.plans ?? []), saved];
      return { ...value, calendar: { ...value.calendar, [taskDate]: { ...entry, plans } } };
    });
    closeTask();
  };
  const toggleTask = (date: string, id: string) => update((value) => { const entry = value.calendar[date]; if (!entry) return value; return { ...value, calendar: { ...value.calendar, [date]: { ...entry, plans: (entry.plans ?? []).map((item) => item.id === id ? { ...item, done: !item.done } : item) } } }; });
  const removeTask = (date: string, id: string) => update((value) => { const entry = value.calendar[date]; if (!entry) return value; return { ...value, calendar: { ...value.calendar, [date]: { ...entry, plans: (entry.plans ?? []).filter((item) => item.id !== id) } } }; });
  const moveTask = (date: string, index: number, delta: number) => update((value) => { const entry = value.calendar[date]; const plans = [...(entry?.plans ?? [])]; const target = index + delta; if (!entry || target < 0 || target >= plans.length) return value; [plans[index], plans[target]] = [plans[target], plans[index]]; return { ...value, calendar: { ...value.calendar, [date]: { ...entry, plans } } }; });
  const saveMonthly = () => { if (!monthlyDraft.title.trim() || !monthlyDraft.objective.trim()) return; update((value) => ({ ...value, monthlyPlans: [...value.monthlyPlans, { ...monthlyDraft, id: uid(), month, title: monthlyDraft.title.trim() }] })); setMonthlyDraft({ ...blankPlan(), month }); setOpenMonthly(false); };
  const toggleMonthly = (id: string) => update((value) => ({ ...value, monthlyPlans: value.monthlyPlans.map((item) => item.id === id ? { ...item, done: !item.done } : item) }));
  const removeMonthly = (id: string) => update((value) => ({ ...value, monthlyPlans: value.monthlyPlans.filter((item) => item.id !== id) }));
  const moveWeek = (delta: number) => { const next = new Date(`${weekStart}T00:00:00`); next.setDate(next.getDate() + delta * 7); setWeekStart(toDateKey(next)); };
  const monthWeekCount = useMemo(() => { const map = new Map<string, number>(); Object.values(data.calendar).forEach((entry) => { if (entry.date.startsWith(month)) { const key = weekStartKey(new Date(`${entry.date}T00:00:00`)); map.set(key, (map.get(key) ?? 0) + (entry.plans?.length ?? 0)); } }); return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)); }, [data.calendar, month]);

  return <div>
    <PageHeader eyebrow="LEARNING PLAN" title="Weekly · Monthly Plan" description="달력 칸 대신, 표에서 날짜별 실행 계획과 월간 방향을 한눈에 설계합니다." />
    <div className="plan-tabs"><button className={tab === 'weekly' ? 'active' : ''} onClick={() => setTab('weekly')}>WEEKLY PLAN</button><button className={tab === 'monthly' ? 'active' : ''} onClick={() => setTab('monthly')}>MONTHLY PLAN</button></div>
    {tab === 'weekly' ? <>
      <Card className="weekly-plan-head"><button aria-label="이전 주" onClick={() => moveWeek(-1)}><ChevronLeft /></button><div><span className="card-label">WEEKLY EXECUTION</span><h2>{dateLabel(dates[0])} — {dateLabel(dates[6])}</h2><p>날짜별로 훈련 블록을 배치하고, 수정·위아래 정렬하며 끝낸 계획만 체크합니다.</p></div><button aria-label="다음 주" onClick={() => moveWeek(1)}><ChevronRight /></button></Card>
      <div className="weekly-table card"><div className="weekly-table-head"><span>날짜</span><span>학습 계획 · 목표량</span></div>{dates.map((date) => {
        const plans = data.calendar[date]?.plans ?? [];
        return <div className="weekly-day-row" key={date}><div className="weekly-date"><strong>{dateLabel(date)}</strong><button className="add-day-plan" onClick={() => openTask(date)}><Plus size={15} /> 추가</button></div><div className="weekly-task-list">{plans.length ? plans.map((item, index) => <div className={`weekly-task-row ${item.done ? 'done' : ''}`} key={item.id}>
          <button className="plan-check" aria-label={`${item.title} 완료`} onClick={() => toggleTask(date, item.id)}>{item.done ? <Check size={13} /> : '○'}</button><span className={`subject-badge ${item.subject}`}>{item.subject}</span><div className="weekly-task-main"><b>{item.title}</b>{item.detail && <small>{item.detail}</small>}</div><span className="weekly-task-quantity">{item.quantity || '—'}</span><div className="weekly-task-actions"><button aria-label="수정" onClick={() => openTask(date, item)}><Pencil size={14} /></button><button aria-label="위로 이동" disabled={index === 0} onClick={() => moveTask(date, index, -1)}><ArrowUp size={14} /></button><button aria-label="아래로 이동" disabled={index === plans.length - 1} onClick={() => moveTask(date, index, 1)}><ArrowDown size={14} /></button><button className="row-delete" aria-label="삭제" onClick={() => removeTask(date, item.id)}><Trash2 size={14} /></button></div>
        </div>) : <p className="weekly-empty">계획 없음 — 추가 버튼으로 오늘의 훈련을 넣어보세요.</p>}</div></div>;
      })}</div>
    </> : <>
      <Card className="monthly-plan-head"><div><span className="card-label">MONTHLY DIRECTION</span><h2>{month.replace('-', '년 ')}월 계획</h2><p>과제 나열보다 이달에 만들 능력·검증 기준·운영 전략을 먼저 정합니다.</p></div><div><input className="date-input" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /><button className="button primary" onClick={() => { setMonthlyDraft({ ...blankPlan(), month }); setOpenMonthly(!openMonthly); }}><Plus size={16} /> 월간 목표</button></div></Card>
      {openMonthly && <Card className="monthly-form"><div className="form-grid two"><Field label="과목"><select value={monthlyDraft.subject} onChange={(event) => setMonthlyDraft({ ...monthlyDraft, subject: event.target.value as Subject })}>{SUBJECTS.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="목표명"><input value={monthlyDraft.title} onChange={(event) => setMonthlyDraft({ ...monthlyDraft, title: event.target.value })} placeholder="예: 수1 기출 완주 및 확통 전환" /></Field></div><Field label="이달의 목적"><TextArea value={monthlyDraft.objective} onChange={(value) => setMonthlyDraft({ ...monthlyDraft, objective: value })} placeholder="어떤 능력 또는 범위를 확보할 것인지" /></Field><Field label="검증 기준"><TextArea value={monthlyDraft.successCriterion} onChange={(value) => setMonthlyDraft({ ...monthlyDraft, successCriterion: value })} placeholder="완료 여부를 판단할 점수·문항·재현 기준" /></Field><Field label="운영 전략"><TextArea value={monthlyDraft.strategy} onChange={(value) => setMonthlyDraft({ ...monthlyDraft, strategy: value })} placeholder="주차별 배분, 휴식·모의고사일 조정 원칙" /></Field><div className="modal-actions"><SaveButton onClick={saveMonthly} label="월간 목표 저장" /></div></Card>}
      <div className="monthly-goal-grid">{monthlyPlans.length ? monthlyPlans.map((item) => <Card className={`monthly-goal-card ${item.done ? 'done' : ''}`} key={item.id}><div><span className={`subject-badge ${item.subject}`}>{item.subject}</span><span><button className="goal-check" onClick={() => toggleMonthly(item.id)}>{item.done ? <Check size={14} /> : '○'}</button><button className="goal-delete" onClick={() => removeMonthly(item.id)}><Trash2 size={14} /></button></span></div><h3>{item.title}</h3><section><b>목적</b><p>{item.objective}</p></section><section><b>검증 기준</b><p>{item.successCriterion || '미설정'}</p></section><section><b>운영 전략</b><p>{item.strategy || '미설정'}</p></section></Card>) : <Empty>이달에 확보할 능력 또는 완주할 학습 범위를 설정하세요.</Empty>}</div>
      <Card className="monthly-week-summary"><div><span className="card-label">WEEKLY LOAD</span><h3>주차별 배치 현황</h3></div>{monthWeekCount.length ? <div>{monthWeekCount.map(([week, count]) => <span key={week}><b>{week.slice(5).replace('-', '.')} 주</b> {count}개 일정</span>)}</div> : <p>Weekly Plan에서 일정을 추가하면 이달의 주차별 계획량이 표시됩니다.</p>}</Card>
    </>}
    {taskDate && <div className="modal-backdrop" onClick={closeTask}><div className="modal plan-task-modal" onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">{editingTaskId ? 'EDIT DAILY PLAN' : 'ADD DAILY PLAN'}</p><h2>{dateLabel(taskDate)} 일정</h2></div><button onClick={closeTask}><X /></button></div><div className="form-grid two"><Field label="과목"><select value={task.subject} onChange={(event) => setTask({ ...task, subject: event.target.value as Subject })}>{SUBJECTS.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="훈련명"><input value={task.title} onChange={(event) => setTask({ ...task, title: event.target.value })} placeholder="예: 수1 뉴런 1단원" /></Field><Field label="세부 내용"><input value={task.detail} onChange={(event) => setTask({ ...task, detail: event.target.value })} placeholder="예: 정적분으로 정의된 함수" /></Field><Field label="목표량"><input value={task.quantity} onChange={(event) => setTask({ ...task, quantity: event.target.value })} placeholder="예: 31문제 · 90분" /></Field></div><div className="modal-actions"><SaveButton onClick={saveTask} label={editingTaskId ? '주간 계획 수정' : '주간 계획 추가'} /></div></div></div>}
  </div>;
}
