import { useState } from 'react';
import type { AppData, Subject } from '../types';
import { SUBJECTS } from '../data/config';
import { Card } from '../components/Ui';
import { uid } from '../lib/date';
export default function WeeklyGoals({data,update,weekStart}:{data:AppData;update:(fn:(v:AppData)=>AppData)=>void;weekStart:string}) {
 const [editing,setEditing]=useState<string|null>(null);
 const [ability,setAbility]=useState(''),[criterion,setCriterion]=useState(''),[subject,setSubject]=useState<Subject>('국어');
 const goals=data.weeklyCapabilityGoals.filter(g=>g.weekStart===weekStart);
 return <Card><h2>Weekly Plan · 이번 주 목표</h2>{goals.map(g=><div key={g.id} className="library-row"><div><b>{g.subject} · {g.ability}</b><p>{g.successCriterion}</p><small>Daily Plan {Object.values(data.calendar).flatMap(e=>e.plans ?? []).filter(p=>p.weeklyPlanId===g.id).length}개 연결</small></div><button onClick={()=>update(v=>({...v,weeklyCapabilityGoals:v.weeklyCapabilityGoals.map(x=>x.id===g.id?{...x,done:!x.done}:x)}))}>{g.done?'검증 완료':'진행 중'}</button><button onClick={()=>{setEditing(g.id);setAbility(g.ability);setCriterion(g.successCriterion);setSubject(g.subject);}}>수정</button></div>)}<form className="form-grid two" onSubmit={e=>{e.preventDefault();if(!ability.trim()||!criterion.trim())return;update(v=>({...v,weeklyCapabilityGoals:editing?v.weeklyCapabilityGoals.map(g=>g.id===editing?{...g,subject,ability:ability.trim(),successCriterion:criterion.trim()}:g):[...v.weeklyCapabilityGoals,{id:uid(),weekStart,subject,ability:ability.trim(),successCriterion:criterion.trim(),drillDesign:'',evidence:'',done:false}]}));setEditing(null);setAbility('');setCriterion('');}}><select aria-label="목표 과목" value={subject} onChange={e=>setSubject(e.target.value as Subject)}>{SUBJECTS.map(s=><option key={s}>{s}</option>)}</select><input required value={ability} onChange={e=>setAbility(e.target.value)} placeholder="이번 주에 끝낼 범위 / 만들 능력"/><input required value={criterion} onChange={e=>setCriterion(e.target.value)} placeholder="성공 기준"/><button className="button primary">{editing ? '주간 목표 저장' : '주간 목표 추가'}</button></form></Card>;
}
