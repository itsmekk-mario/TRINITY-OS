import type { AppData, CalendarPlan } from '../types';
import { weekStartKey } from '../lib/date';
export default function PlanLinks({data,date,plan,onChange}:{data:AppData;date:string;plan:CalendarPlan;onChange:(patch:Partial<CalendarPlan>)=>void}) {
 return <div className="form-grid two"><label>Weekly Plan 목표<select value={plan.weeklyPlanId ?? ''} onChange={e=>onChange({weeklyPlanId:e.target.value || undefined})}><option value="">연결 없음</option>{data.weeklyCapabilityGoals.filter(g=>g.weekStart===weekStartKey(new Date(`${date}T12:00:00`)) || g.id===plan.weeklyPlanId).map(g=><option key={g.id} value={g.id}>{g.subject} · {g.ability}</option>)}</select></label><label>학습 자료<select value={plan.resourceId ?? ''} onChange={e=>onChange({resourceId:e.target.value || undefined})}><option value="">연결 없음</option>{data.resources.map(r=><option key={r.id} value={r.id}>{r.subject} · {r.name}</option>)}</select></label></div>;
}
