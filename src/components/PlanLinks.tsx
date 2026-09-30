import { BookOpen, Link2 } from 'lucide-react';
import type { AppData, CalendarPlan } from '../types';
import { weekStartKey } from '../lib/date';
export default function PlanLinks({data,date,plan,onChange}:{data:AppData;date:string;plan:CalendarPlan;onChange:(patch:Partial<CalendarPlan>)=>void}) {
 const goals=data.weeklyCapabilityGoals.filter(g=>g.weekStart===weekStartKey(new Date(`${date}T12:00:00`)) || g.id===plan.weeklyPlanId);
 return <div className="plan-link-panel"><div className="plan-link-title"><Link2 size={15}/><span><b>Learning Graph 연결</b><small>일별 계획을 이번 주 목표와 실제 학습 자료에 연결합니다.</small></span></div><div className="plan-link-fields"><label><span>Weekly Plan</span><select value={plan.weeklyPlanId ?? ''} onChange={e=>onChange({weeklyPlanId:e.target.value || undefined})}><option value="">연결하지 않음</option>{goals.map(g=><option key={g.id} value={g.id}>{g.subject} · {g.ability}</option>)}</select></label><label><span><BookOpen size={13}/> Resource</span><select value={plan.resourceId ?? ''} onChange={e=>onChange({resourceId:e.target.value || undefined})}><option value="">연결하지 않음</option>{data.resources.map(r=><option key={r.id} value={r.id}>{r.subject} · {r.name}</option>)}</select></label></div></div>;
}
