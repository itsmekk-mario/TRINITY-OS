import type { CalendarEntry } from '../types';
import { dayTypes } from '../lib/planGraph';

const labels: Record<string,string> = {normal:'Normal',bump:'BUMP',mock:'Mock',review:'Review',recovery:'Recovery',exam:'Exam',school:'School',off:'Off',custom:'Custom'};
const colors = ['orange','blue','green','purple','gray'] as const;

export default function DayLabelEditor({entry,onChange}:{entry:CalendarEntry;onChange:(entry:CalendarEntry)=>void}) {
 const selected=entry.dayType ?? 'normal';
 return <section className="day-index-editor" aria-label="날짜 성격">
   <div className="day-index-heading"><div><b>Day Index</b><small>날짜의 역할을 지정하면 주간 계획과 캘린더에서 같은 표식으로 보입니다.</small></div></div>
   <div className="day-type-chips" role="group" aria-label="날짜 유형">{dayTypes.map(type=><button type="button" key={type} className={selected===type?'active':''} aria-pressed={selected===type} onClick={()=>onChange({...entry,dayType:type})}>{labels[type] ?? type}</button>)}</div>
   <div className="day-index-fields"><label><span>표시 이름</span><input maxLength={60} value={entry.dayLabel ?? ''} placeholder="예: 수학 몰입 Day" onChange={e=>onChange({...entry,dayLabel:e.target.value})}/></label><label><span>아이콘</span><input maxLength={8} value={entry.dayIcon ?? ''} placeholder="예: ★" onChange={e=>onChange({...entry,dayIcon:e.target.value})}/></label><label><span>설명</span><input maxLength={160} value={entry.dayDescription ?? ''} placeholder="이 날짜에 집중할 일" onChange={e=>onChange({...entry,dayDescription:e.target.value})}/></label><div className="day-color-field"><span>표시 색상</span><div className="day-color-options" role="group" aria-label="표시 색상">{colors.map(color=><button type="button" key={color} aria-label={color} aria-pressed={(entry.dayColor ?? 'orange')===color} className={`${color} ${(entry.dayColor ?? 'orange')===color?'active':''}`} onClick={()=>onChange({...entry,dayColor:color})}/>)}</div></div></div>
 </section>;
}
