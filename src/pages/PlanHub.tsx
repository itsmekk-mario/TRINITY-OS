import { CalendarDays, CalendarRange, CheckCircle2, ChevronRight, ListTodo, Target } from 'lucide-react';
import type { AppData } from '../types';
import { Card, Empty, Progress } from '../components/Ui';
import HubLayout from '../components/navigation/HubLayout';
import type { ReactNode } from 'react';
import SegmentedControl from '../components/navigation/SegmentedControl';
import CalendarPage from './CalendarPage';
import PlanningPage from './PlanningPage';
import Routine from './Routine';
import { toDateKey, weekStartKey } from '../lib/date';
import { formatResourceDeadline, sortResourcesByDeadline } from '../lib/resourceDeadline';

export type PlanView='overview'|'calendar'|'weekly'|'monthly'|'routine';
const tabs=[{id:'overview',label:'Overview'},{id:'monthly',label:'Monthly'},{id:'weekly',label:'Weekly'},{id:'calendar',label:'Daily'},{id:'routine',label:'Routine'}] as const;

export default function PlanHub({data,update,view,onView}:{data:AppData;update:(fn:(value:AppData)=>AppData)=>void;view:PlanView;onView:(view:PlanView)=>void}) {
  const layout=(content:ReactNode)=><HubLayout eyebrow="PLAN" title="목표를 오늘의 행동으로 내립니다" description="Monthly → Weekly → Daily 순서로 계획을 구체화하고, 실행 결과를 다음 계획에 다시 반영합니다." controls={<SegmentedControl label="Plan 화면" options={tabs} value={view} onChange={onView}/>}>{content}</HubLayout>;
  if(view==='calendar')return layout(<CalendarPage data={data} update={update}/>);
  if(view==='weekly'||view==='monthly')return layout(<PlanningPage key={view} data={data} update={update} initialTab={view}/>);
  if(view==='routine')return layout(<Routine data={data} update={update}/>);

  const today=toDateKey(),week=weekStartKey();
  const end=new Date(`${week}T12:00:00`);end.setDate(end.getDate()+6);
  const plans=Object.values(data.calendar).filter(entry=>entry.date>=week&&entry.date<=toDateKey(end)).flatMap(entry=>entry.plans??[]);
  const todayPlans=data.calendar[today]?.plans??[];
  const achieved=(item:typeof plans[number])=>(item.outcome??(item.done?'achieved':'partial'))==='achieved';
  const partial=(item:typeof plans[number])=>(item.outcome??(item.done?'achieved':'partial'))==='partial';
  const failed=(item:typeof plans[number])=>(item.outcome??(item.done?'achieved':'partial'))==='failed';
  const goals=data.weeklyCapabilityGoals.filter(goal=>goal.weekStart===week);
  const monthPlans=data.monthlyPlans.filter(item=>item.month===today.slice(0,7));
  const upcomingResources=sortResourcesByDeadline(data.resources.filter(resource=>resource.done<resource.total&&resource.dueDate)).slice(0,4);
  const weekRate=plans.length?Math.round(plans.filter(achieved).length/plans.length*100):0;

  return layout(<div className="plan-overview-v2">
    <section className="plan-flow" aria-label="계획 계층">
      <button onClick={()=>onView('monthly')}><span>01</span><div><small>MONTHLY</small><b>방향</b><p>{monthPlans.length?`${monthPlans.filter(item=>item.done).length}/${monthPlans.length} 목표 완료`:'이번 달 방향을 설정하세요'}</p></div><ChevronRight/></button>
      <button onClick={()=>onView('weekly')}><span>02</span><div><small>WEEKLY</small><b>설계</b><p>{goals.length?`${goals.length}개 능력 목표 · ${plans.length}개 실행 항목`:'이번 주 능력과 실행을 설계하세요'}</p></div><ChevronRight/></button>
      <button onClick={()=>onView('calendar')}><span>03</span><div><small>DAILY</small><b>배치</b><p>{todayPlans.length?`오늘 ${todayPlans.length}개 · ${todayPlans.filter(achieved).length}개 완료`:'오늘 실행할 항목을 배치하세요'}</p></div><ChevronRight/></button>
    </section>

    <div className="hub-metric-grid plan-metrics-v2">
      <Card><CalendarDays/><span>오늘 계획</span><strong className="metric-number">{todayPlans.filter(achieved).length}/{todayPlans.length}</strong><Progress value={todayPlans.filter(achieved).length} max={Math.max(1,todayPlans.length)}/><small>Daily execution</small></Card>
      <Card><CalendarRange/><span>이번 주 실행</span><strong className="metric-number">{weekRate}%</strong><div className="plan-outcome-summary"><i className="achieved">✓ {plans.filter(achieved).length}</i><i className="partial">△ {plans.filter(partial).length}</i><i className="failed">× {plans.filter(failed).length}</i></div></Card>
      <Card><Target/><span>능력 목표</span><strong className="metric-number">{goals.filter(item=>item.done).length}/{goals.length}</strong><small>완료량이 아니라 성공 기준으로 검증</small></Card>
    </div>

    <div className="hub-two-column plan-overview-columns">
      <Card className="plan-today-card"><div className="hub-card-head"><div><span className="card-label">TODAY</span><h2>오늘 실행 순서</h2></div><button className="text-button" onClick={()=>onView('calendar')}>Daily Plan</button></div>{todayPlans.length?<div className="compact-list">{todayPlans.slice(0,6).map(item=><div key={item.id}><ListTodo/><span><b>{item.title}</b><small>{item.subject} · {item.quantity||'목표량 없음'}</small></span><em>{achieved(item)?'완료':failed(item)?'실패':partial(item)?'진행':'예정'}</em></div>)}</div>:<Empty title="오늘 계획이 없습니다." description="Weekly에서 오늘 칸에 실행 항목을 추가하세요." action={<button className="button" onClick={()=>onView('weekly')}>Weekly Plan 열기</button>}/>}</Card>
      <Card><div className="hub-card-head"><div><span className="card-label">CAPABILITY</span><h2>이번 주 능력 목표</h2></div><button className="text-button" onClick={()=>onView('weekly')}>Weekly</button></div>{goals.length?<div className="compact-list">{goals.slice(0,5).map(goal=><div key={goal.id}><CheckCircle2/><span><b>{goal.ability}</b><small>{goal.successCriterion}</small></span><em>{goal.done?'검증 완료':'진행 중'}</em></div>)}</div>:<Empty title="능력 목표가 없습니다." description="이번 주에 무엇을 잘하게 될지 성공 기준으로 정의하세요."/>}</Card>
    </div>

    {upcomingResources.length>0&&<Card className="plan-upcoming-resources"><div className="hub-card-head"><div><span className="card-label">RESOURCE DEADLINE</span><h2>계획에 반영할 가까운 마감</h2></div></div><div className="compact-list">{upcomingResources.map(resource=><div key={resource.id}><ListTodo/><span><b>{resource.name}</b><small>{resource.subject} · {resource.done}/{resource.total}</small></span><em>{formatResourceDeadline(resource)}</em></div>)}</div></Card>}
  </div>);
}
