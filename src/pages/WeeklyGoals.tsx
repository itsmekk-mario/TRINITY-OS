import { createPortal } from 'react-dom';
import { useMemo, useRef, useState } from 'react';
import { Check, Ellipsis, Link2, Plus, Trash2, X } from 'lucide-react';
import type { AppData, Subject, WeeklyCapabilityGoal } from '../types';
import { SUBJECTS } from '../data/config';
import { toDateKey, uid } from '../lib/date';
import { getSubjectColor } from '../lib/subjectColors';
import { useDialogFocus } from '../components/motion/useDialogFocus';

const endOfWeek = (weekStart: string) => {
  const date = new Date(`${weekStart}T12:00:00+09:00`);
  date.setUTCDate(date.getUTCDate() + 6);
  return toDateKey(date);
};

type Draft = Pick<WeeklyCapabilityGoal, 'subject' | 'ability' | 'successCriterion' | 'drillDesign'>;
const blankDraft = (): Draft => ({ subject: '국어', ability: '', successCriterion: '', drillDesign: '' });

export default function WeeklyGoals({data, update, weekStart}:{data:AppData;update:(fn:(v:AppData)=>AppData)=>void;weekStart:string}) {
  const colorFor = (subject: string) => getSubjectColor(subject, data.subjectColors);
  const [editing, setEditing] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(blankDraft());
  const [linkedPlanKeys, setLinkedPlanKeys] = useState<string[]>([]);
  const sheetRef = useRef<HTMLElement>(null);

  const goals = useMemo(
    () => data.weeklyCapabilityGoals.filter((goal) => goal.weekStart === weekStart),
    [data.weeklyCapabilityGoals, weekStart],
  );

  const weekPlans = useMemo(() => {
    const end = endOfWeek(weekStart);
    return Object.values(data.calendar)
      .filter((entry) => entry.date >= weekStart && entry.date <= end)
      .sort((a, b) => a.date.localeCompare(b.date))
      .flatMap((entry) => (entry.plans ?? []).map((plan) => ({ date: entry.date, plan, key: `${entry.date}::${plan.id}` })));
  }, [data.calendar, weekStart]);

  const linkedCount = (goalId: string) => weekPlans.filter(({plan}) => plan.weeklyPlanId === goalId).length;
  const totalLinked = weekPlans.filter(({plan}) => goals.some((goal) => goal.id === plan.weeklyPlanId)).length;
  const doneCount = goals.filter((goal) => goal.done).length;

  const openNew = () => {
    setEditing(null);
    setDraft(blankDraft());
    setLinkedPlanKeys([]);
    setSheetOpen(true);
  };

  const openEdit = (goal: WeeklyCapabilityGoal) => {
    setEditing(goal.id);
    setDraft({
      subject: goal.subject,
      ability: goal.ability,
      successCriterion: goal.successCriterion,
      drillDesign: goal.drillDesign ?? '',
    });
    setLinkedPlanKeys(weekPlans.filter(({plan}) => plan.weeklyPlanId === goal.id).map(({key}) => key));
    setSheetOpen(true);
  };

  const closeSheet = () => {
    setSheetOpen(false);
    setEditing(null);
    setDraft(blankDraft());
    setLinkedPlanKeys([]);
  };

  useDialogFocus(sheetOpen, sheetRef, closeSheet);

  const save = () => {
    if (!draft.ability.trim() || !draft.successCriterion.trim()) return;
    const goalId = editing ?? uid();
    const selected = new Set(linkedPlanKeys);
    update((value) => {
      const existing = editing ? value.weeklyCapabilityGoals.find((goal) => goal.id === editing) : undefined;
      const saved: WeeklyCapabilityGoal = {
        id: goalId,
        weekStart,
        subject: draft.subject,
        ability: draft.ability.trim(),
        successCriterion: draft.successCriterion.trim(),
        drillDesign: draft.drillDesign.trim(),
        evidence: existing?.evidence ?? '',
        done: existing?.done ?? false,
        feedbackId: existing?.feedbackId,
        inquiryTrack: existing?.inquiryTrack,
      };
      const weeklyCapabilityGoals = editing
        ? value.weeklyCapabilityGoals.map((goal) => goal.id === editing ? saved : goal)
        : [...value.weeklyCapabilityGoals, saved];
      const calendar = Object.fromEntries(Object.entries(value.calendar).map(([date, entry]) => {
        if (date < weekStart || date > endOfWeek(weekStart)) return [date, entry];
        return [date, {
          ...entry,
          plans: (entry.plans ?? []).map((plan) => {
            const key = `${date}::${plan.id}`;
            if (selected.has(key)) return { ...plan, weeklyPlanId: goalId };
            if (plan.weeklyPlanId === goalId) return { ...plan, weeklyPlanId: undefined };
            return plan;
          }),
        }];
      }));
      return { ...value, weeklyCapabilityGoals, calendar };
    });
    closeSheet();
  };

  const toggleDone = (id: string) => update((value) => ({
    ...value,
    weeklyCapabilityGoals: value.weeklyCapabilityGoals.map((goal) => goal.id === id ? { ...goal, done: !goal.done } : goal),
  }));

  const remove = (id: string) => update((value) => ({
    ...value,
    weeklyCapabilityGoals: value.weeklyCapabilityGoals.filter((goal) => goal.id !== id),
    calendar: Object.fromEntries(Object.entries(value.calendar).map(([date, entry]) => [date, {
      ...entry,
      plans: (entry.plans ?? []).map((plan) => plan.weeklyPlanId === id ? { ...plan, weeklyPlanId: undefined } : plan),
    }])),
  }));

  return <section className="weekly-goals-v4" aria-labelledby="weekly-goals-title">
    <div className="weekly-goals-toolbar">
      <div>
        <p className="weekly-kicker">THIS WEEK</p>
        <h2 id="weekly-goals-title">Weekly Plan</h2>
        <p className="weekly-goals-subtitle">이번 주에 끝낼 범위와 만들어야 할 능력만 남깁니다.</p>
      </div>
      <button className="weekly-add-button" type="button" onClick={openNew}><Plus size={16}/>추가</button>
    </div>

    <div className="weekly-summary-strip" aria-label="주간 목표 요약">
      <div><span>목표</span><strong>{goals.length}</strong></div>
      <div><span>완료</span><strong>{doneCount}</strong></div>
      <div><span>진행 중</span><strong>{goals.length - doneCount}</strong></div>
      <div><span>Daily 연결</span><strong>{totalLinked}</strong></div>
    </div>

    <div className="weekly-goal-list">
      {goals.length === 0 ? <div className="weekly-goal-empty">
        <span className="weekly-empty-icon"><Plus size={18}/></span>
        <div><b>이번 주 목표가 없습니다.</b><p>완료량보다 이번 주에 확보할 능력과 성공 기준을 먼저 정의하세요.</p></div>
        <button type="button" onClick={openNew}>첫 목표 추가</button>
      </div> : goals.map((goal) => <article className={`weekly-goal-item ${goal.done ? 'is-done' : ''}`} key={goal.id}>
        <span className="weekly-subject-dot" style={{ backgroundColor: colorFor(goal.subject) }} aria-hidden="true" />
        <div className="weekly-goal-copy">
          <div className="weekly-goal-titleline">
            <span className="weekly-subject-name" style={{ color: colorFor(goal.subject) }}>{goal.subject}</span>
            <h3>{goal.ability}</h3>
          </div>
          <p>{goal.successCriterion}</p>
          <div className="weekly-goal-meta"><Link2 size={13}/><span>Daily Plan {linkedCount(goal.id)}개 연결</span></div>
        </div>
        <div className="weekly-goal-right">
          <span className={`weekly-status-badge ${goal.done ? 'done' : 'active'}`}>{goal.done ? '검증 완료' : '진행 중'}</span>
          <details className="weekly-goal-more">
            <summary aria-label={`${goal.ability} 메뉴`}><Ellipsis size={18}/></summary>
            <div className="weekly-goal-menu">
              <button type="button" onClick={() => openEdit(goal)}>수정</button>
              <button type="button" onClick={() => toggleDone(goal.id)}>{goal.done ? '진행 중으로 변경' : '검증 완료 처리'}</button>
              <button className="danger" type="button" onClick={() => remove(goal.id)}><Trash2 size={14}/>삭제</button>
            </div>
          </details>
        </div>
      </article>)}
    </div>

    {sheetOpen && createPortal(<div className="weekly-goal-sheet-backdrop" role="presentation" onMouseDown={closeSheet}>
      <aside ref={sheetRef} className="weekly-goal-sheet" role="dialog" aria-modal="true" aria-labelledby="weekly-goal-sheet-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><p className="weekly-kicker">WEEKLY GOAL</p><h2 id="weekly-goal-sheet-title">{editing ? '주간 목표 수정' : '주간 목표 추가'}</h2></div>
          <button className="weekly-sheet-close" type="button" aria-label="닫기" onClick={closeSheet}><X size={19}/></button>
        </header>
        <div className="weekly-goal-sheet-body">
          <label className="weekly-field"><span>과목</span><select value={draft.subject} onChange={(event) => setDraft({...draft, subject:event.target.value as Subject})}>{SUBJECTS.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="weekly-field"><span>이번 주 목표</span><input value={draft.ability} onChange={(event) => setDraft({...draft, ability:event.target.value})} placeholder="예: 2709 · 2706 · 2611 분석 완료"/></label>
          <label className="weekly-field"><span>성공 기준</span><textarea rows={3} value={draft.successCriterion} onChange={(event) => setDraft({...draft, successCriterion:event.target.value})} placeholder="예: 근거-선지 대응을 매 지문에서 재현하고 평균 2등급 이상 유지"/></label>
          <label className="weekly-field"><span>설명 · 훈련 설계 <small>선택</small></span><textarea rows={3} value={draft.drillDesign} onChange={(event) => setDraft({...draft, drillDesign:event.target.value})} placeholder="이번 주에 어떻게 반복하고 검증할지"/></label>

          <section className="weekly-link-section">
            <div className="weekly-link-head"><div><b>Daily Plan 연결</b><p>이 목표와 직접 연결되는 이번 주 실행 항목만 선택합니다.</p></div><span>{linkedPlanKeys.length}개</span></div>
            {weekPlans.length ? <div className="weekly-link-list">{weekPlans.map(({date, plan, key}) => {
              const checked = linkedPlanKeys.includes(key);
              return <label key={key} className={checked ? 'checked' : ''}>
                <input type="checkbox" checked={checked} onChange={() => setLinkedPlanKeys((current) => checked ? current.filter((item) => item !== key) : [...current, key])}/>
                <span className="weekly-link-check">{checked && <Check size={13}/>}</span>
                <span className="weekly-link-plan"><b>{plan.title}</b><small>{date.slice(5).replace('-', '.')} · {plan.subject}{plan.quantity ? ` · ${plan.quantity}` : ''}</small></span>
              </label>;
            })}</div> : <p className="weekly-link-empty">이번 주 Daily Plan이 아직 없습니다.</p>}
          </section>
        </div>
        <footer>
          <button className="weekly-sheet-cancel" type="button" onClick={closeSheet}>취소</button>
          <button className="weekly-sheet-save" type="button" onClick={save} disabled={!draft.ability.trim() || !draft.successCriterion.trim()}>{editing ? '변경사항 저장' : '목표 추가'}</button>
        </footer>
      </aside>
    </div>, document.body)}
  </section>;
}
