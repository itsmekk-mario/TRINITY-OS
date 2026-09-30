import type { CalendarEntry } from '../types';
import { dayTypes } from '../lib/planGraph';
export default function DayLabelEditor({entry,onChange}:{entry:CalendarEntry;onChange:(entry:CalendarEntry)=>void}) {
 return <div className="form-grid two day-label-editor"><label>날짜 성격<select value={entry.dayType ?? 'normal'} onChange={e=>onChange({...entry,dayType:e.target.value as CalendarEntry['dayType']})}>{dayTypes.map(type=><option key={type} value={type}>{type.toUpperCase()}</option>)}</select></label><label>날짜 이름<input maxLength={60} value={entry.dayLabel ?? ''} placeholder="예: BUMP DAY · 확통 마무리" onChange={e=>onChange({...entry,dayLabel:e.target.value})}/></label><label>색상<select value={entry.dayColor ?? 'orange'} onChange={e=>onChange({...entry,dayColor:e.target.value})}>{['orange','blue','green','purple','gray'].map(color=><option key={color}>{color}</option>)}</select></label></div>;
}
