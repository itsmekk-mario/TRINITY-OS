import { CalendarDays, CalendarRange, CheckCircle2, ListTodo } from 'lucide-react';
import type { AppData } from '../types';
import { Card, Empty, Progress } from '../components/Ui';
import HubLayout from '../components/navigation/HubLayout';
import type { ReactNode } from 'react';
import SegmentedControl from '../components/navigation/SegmentedControl';
import CalendarPage from './CalendarPage';
import PlanningPage from './PlanningPage';
import Routine from './Routine';
import { toDateKey, weekStartKey } from '../lib/date';

export type PlanView = 'overview' | 'calendar' | 'weekly' | 'routine';
const tabs = [{ id: 'overview', label: 'Overview' }, { id: 'calendar', label: 'Calendar' }, { id: 'weekly', label: 'Weekly' }, { id: 'routine', label: 'Routine' }] as const;

export default function PlanHub({ data, update, view, onView }: { data: AppData; update: (fn: (value: AppData) => AppData) => void; view: PlanView; onView: (view: PlanView) => void }) {
  const layout = (content: ReactNode) => <HubLayout eyebrow="PLAN" title="실행을 설계합니다" description="시간 계획과 이번 주에 개선할 능력을 같은 흐름에서 정리합니다." controls={<SegmentedControl label="Plan 화면" options={tabs} value={view} onChange={onView} />}>{content}</HubLayout>;
  if (view === 'calendar') return layout(<CalendarPage data={data} update={update} />);
  if (view === 'weekly') return layout(<PlanningPage data={data} update={update} />);
  if (view === 'routine') return layout(<Routine data={data} update={update} />);
  const today = toDateKey(); const week = weekStartKey();
  const end = new Date(`${week}T12:00:00`); end.setDate(end.getDate() + 6);
  const plans = Object.values(data.calendar).filter((entry) => entry.date >= week && entry.date <= toDateKey(end)).flatMap((entry) => entry.plans ?? []);
  const todayPlans = data.calendar[today]?.plans ?? [];
  const goals = data.weeklyCapabilityGoals.filter((goal) => goal.weekStart === week);
  return layout(<div>
    <div className="hub-metric-grid"><Card><CalendarDays /><span>오늘 일정</span><strong className="metric-number">{todayPlans.filter((item) => item.done).length}/{todayPlans.length}</strong><Progress value={todayPlans.filter((item) => item.done).length} max={Math.max(1, todayPlans.length)} /></Card><Card><CalendarRange /><span>이번 주 실행</span><strong className="metric-number">{plans.length ? Math.round(plans.filter((item) => item.done).length / plans.length * 100) : 0}%</strong><small>{plans.length ? `${plans.length}개 계획 기준` : '주간 계획 없음'}</small></Card><Card><CheckCircle2 /><span>Capability Goal</span><strong className="metric-number">{goals.filter((item) => item.done).length}/{goals.length}</strong><small>성공 기준으로 검증</small></Card></div>
    <div className="hub-two-column"><Card><div className="hub-card-head"><div><span className="card-label">NEXT</span><h2>오늘의 계획</h2></div><button className="text-button" onClick={() => onView('calendar')}>일정 열기</button></div>{todayPlans.length ? <div className="compact-list">{todayPlans.slice(0, 5).map((item) => <div key={item.id}><ListTodo /><span><b>{item.title}</b><small>{item.subject} · {item.quantity || '목표량 없음'}</small></span><em>{item.done ? '완료' : '예정'}</em></div>)}</div> : <Empty>오늘 계획이 없습니다.<br />일정에서 첫 일정을 추가하세요.</Empty>}</Card><Card><div className="hub-card-head"><div><span className="card-label">CAPABILITY</span><h2>이번 주 능력 목표</h2></div><button className="text-button" onClick={() => onView('weekly')}>목표 관리</button></div>{goals.length ? <div className="compact-list">{goals.map((goal) => <div key={goal.id}><CheckCircle2 /><span><b>{goal.ability}</b><small>{goal.successCriterion}</small></span><em>{goal.done ? '검증 완료' : '진행 중'}</em></div>)}</div> : <Empty>이번 주 능력 목표가 없습니다.<br />주간 계획에서 성공 기준을 설정하세요.</Empty>}</Card></div>
  </div>);
}
