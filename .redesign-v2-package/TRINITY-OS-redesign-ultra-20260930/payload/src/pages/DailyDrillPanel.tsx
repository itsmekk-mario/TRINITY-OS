import { useEffect, useMemo } from 'react';
import { ArrowRight, Check, Circle, Clock3, ListChecks } from 'lucide-react';
import { migratePlans } from '../lib/planGraph';
import type { AppData, CalendarPlan, PlanOutcome } from '../types';
import { toDateKey } from '../lib/date';

const outcomeOf = (plan: CalendarPlan): PlanOutcome => plan.outcome ?? (plan.done ? 'achieved' : 'partial');

export default function DailyDrillPanel({
  data,
  update,
  onOpenPlan,
}: {
  data: AppData;
  update: (fn: (v: AppData) => AppData) => void;
  onOpenPlan?: () => void;
}) {
  useEffect(() => {
    if ((data.dailyDrills ?? []).some((drill) => !(data.migratedDailyDrillIds ?? []).includes(drill.id))) update(migratePlans);
  }, [data.dailyDrills, data.migratedDailyDrillIds, update]);

  const date = toDateKey();
  const plans = data.calendar[date]?.plans ?? [];
  const completed = plans.filter((plan) => outcomeOf(plan) === 'achieved').length;
  const plannedMinutes = useMemo(() => plans.reduce((sum, plan) => {
    const match = plan.quantity?.match(/(\d+)\s*분/);
    return sum + (match ? Number(match[1]) : 0);
  }, 0), [plans]);

  const toggle = (id: string) => update((value) => {
    const entry = value.calendar[date];
    if (!entry) return value;
    return {
      ...value,
      calendar: {
        ...value.calendar,
        [date]: {
          ...entry,
          plans: (entry.plans ?? []).map((plan) => plan.id === id
            ? { ...plan, done: !plan.done, outcome: !plan.done ? 'achieved' : 'partial' }
            : plan),
        },
      },
    };
  });

  return <section className="daily-execution-panel" aria-labelledby="daily-execution-title">
    <header className="daily-execution-head">
      <div>
        <p className="card-label">DAILY PLAN</p>
        <h2 id="daily-execution-title">오늘 실행 큐</h2>
        <p>Weekly Plan에 배치한 오늘 항목을 그대로 실행합니다. 별도의 Daily Drill 데이터는 만들지 않습니다.</p>
      </div>
      {onOpenPlan && <button className="text-button" type="button" onClick={onOpenPlan}>Weekly Plan <ArrowRight size={15}/></button>}
    </header>

    <div className="daily-execution-meta" aria-label="오늘 계획 요약">
      <span><ListChecks size={14}/><b>{completed}/{plans.length}</b> 완료</span>
      <span><Clock3 size={14}/><b>{plannedMinutes || '—'}</b>{plannedMinutes ? '분 계획' : '시간 미설정'}</span>
    </div>

    {plans.length ? <div className="daily-execution-list">
      {plans.map((plan) => {
        const outcome = outcomeOf(plan);
        return <button key={plan.id} className={`daily-execution-row ${outcome}`} type="button" onClick={() => toggle(plan.id)} aria-pressed={outcome === 'achieved'}>
          <span className="daily-execution-check">{outcome === 'achieved' ? <Check size={15}/> : <Circle size={15}/>}</span>
          <span className={`subject-badge ${plan.subject}`}>{plan.subject}{plan.inquiryTrack ? ` · ${plan.inquiryTrack}` : ''}</span>
          <span className="daily-execution-copy"><b>{plan.title}</b><small>{plan.detail || plan.quantity || '세부 목표 없음'}</small></span>
          <span className="daily-execution-quantity">{plan.quantity || '—'}</span>
        </button>;
      })}
    </div> : <div className="daily-execution-empty">
      <ListChecks size={20}/><b>오늘 배치된 학습이 없습니다.</b><p>Plan → Weekly에서 오늘 할 일을 배치하면 여기와 Today에 동시에 나타납니다.</p>
      {onOpenPlan && <button className="button" type="button" onClick={onOpenPlan}>Weekly Plan 열기</button>}
    </div>}
  </section>;
}
