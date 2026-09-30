import { useEffect } from 'react';
import { migratePlans } from '../lib/planGraph';
import type { AppData } from '../types';
import { Card } from '../components/Ui';
import { toDateKey } from '../lib/date';
export default function DailyDrillPanel({data,update}:{data:AppData;update:(fn:(v:AppData)=>AppData)=>void}) {
 useEffect(()=>{if((data.dailyDrills ?? []).some(d=>!(data.migratedDailyDrillIds ?? []).includes(d.id)))update(migratePlans);},[data.dailyDrills,data.migratedDailyDrillIds,update]);
 const date=toDateKey(),entry=data.calendar[date],plans=entry?.plans ?? [];
 return <Card><h2>Daily Plan · 오늘</h2><p>Plan의 날짜별 계획과 같은 데이터입니다. 일별 배치는 Plan → Weekly에서 편집하세요.</p>{plans.map(p=><label key={p.id} className="library-row"><input type="checkbox" checked={p.done} onChange={()=>update(v=>({...v,calendar:{...v.calendar,[date]:{...v.calendar[date],plans:(v.calendar[date]?.plans ?? []).map(x=>x.id===p.id?{...x,done:!x.done,outcome:!x.done?'achieved':undefined}:x)}}}))}/><span>{p.subject} · {p.title}</span></label>)}{!plans.length&&<p>오늘 계획 없음</p>}</Card>;
}
