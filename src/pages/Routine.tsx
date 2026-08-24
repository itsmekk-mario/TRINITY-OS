import { useState } from 'react';
import { Clock, Info, Plus, Trash2 } from 'lucide-react';
import type { AppData, RoutineItem, Subject } from '../types';
import { SUBJECTS } from '../data/config';
import { uid } from '../lib/date';
import { Card, PageHeader } from '../components/Ui';

export default function Routine({data,update}:{data:AppData;update:(fn:(value:AppData)=>AppData)=>void}) {
  const [draft,setDraft]=useState<Omit<RoutineItem,'id'>>({time:'',title:'',detail:'',subject:'국어'});
  const add=()=>{if(!draft.time.trim()||!draft.title.trim())return;update(v=>({...v,routine:[...v.routine,{...draft,id:uid()}]}));setDraft({time:'',title:'',detail:'',subject:'국어'})};
  return <div><PageHeader eyebrow="DAILY ROUTINE" title="하루의 기본 궤도" description="완벽한 고정이 아니라, 흐름이 끊겨도 돌아올 수 있는 기준 시간표입니다." />
    <Card className="notice"><Info size={18} /><p>학교 시간에는 짧은 단위로 끊어 풀고, 중단 지점과 다음 첫 행동을 한 줄로 남깁니다.</p></Card>
    <div className="timeline">{data.routine.map((item) => <article className="timeline-item" key={item.id}><div className="timeline-time"><Clock size={15} />{item.time}</div><div className="timeline-line"><i /></div><Card><button className="routine-delete" onClick={()=>update(v=>({...v,routine:v.routine.filter(r=>r.id!==item.id)}))}><Trash2 size={14}/></button><span className={`subject-badge ${item.subject}`}>{item.subject}</span><h3>{item.title}</h3><p>{item.detail}</p></Card></article>)}</div>
    <Card className="routine-add"><h2>루틴 항목 추가</h2><div className="routine-add-grid"><input value={draft.time} onChange={e=>setDraft({...draft,time:e.target.value})} placeholder="시간 (예: 16:40)"/><select value={draft.subject} onChange={e=>setDraft({...draft,subject:e.target.value as Subject|'생활'})}>{[...SUBJECTS,'생활'].map(s=><option key={s}>{s}</option>)}</select><input value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} placeholder="학습 블록 이름"/><input value={draft.detail} onChange={e=>setDraft({...draft,detail:e.target.value})} placeholder="세부 기준"/><button className="button primary" onClick={add}><Plus size={16}/>추가</button></div></Card>
  </div>;
}
