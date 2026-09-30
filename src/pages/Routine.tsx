import { useState } from 'react';
import { ArrowDown, ArrowUp, Clock, Info, Plus, Trash2 } from 'lucide-react';
import type { AppData, RoutineItem, Subject } from '../types';
import { SUBJECTS } from '../data/config';
import { uid } from '../lib/date';
import { Card, PageHeader } from '../components/Ui';

export default function Routine({data,update}:{data:AppData;update:(fn:(value:AppData)=>AppData)=>void}) {
  const [draft,setDraft]=useState<Omit<RoutineItem,'id'>>({time:'',title:'',detail:'',subject:'국어'});
  const add=()=>{if(!draft.time.trim()||!draft.title.trim())return;update(v=>({...v,routine:[...v.routine,{...draft,id:uid()}]}));setDraft({time:'',title:'',detail:'',subject:'국어'})};
  const move = (index: number, direction: -1 | 1) => update((value) => {
    const next = [...value.routine];
    const target = index + direction;
    if (target < 0 || target >= next.length) return value;
    [next[index], next[target]] = [next[target], next[index]];
    return { ...value, routine: next };
  });
  const sortByTime = () => update((value) => ({ ...value, routine: [...value.routine].sort((a, b) => a.time.localeCompare(b.time, 'ko')) }));
  return <div><PageHeader eyebrow="DAILY ROUTINE" title="하루의 기본 궤도" description="완벽한 고정이 아니라, 흐름이 끊겨도 돌아올 수 있는 기준 시간표입니다." />
    <Card className="notice"><Info size={18} /><p>학교 시간에는 짧은 단위로 끊어 풀고, 중단 지점과 다음 첫 행동을 한 줄로 남깁니다.</p></Card>
    <div className="timeline-toolbar"><span>현재 표시 순서는 직접 조정한 순서입니다.</span><button className="button" onClick={sortByTime}>시간순 정렬</button></div>
    <div className="timeline">{data.routine.map((item,index) => <article className="timeline-item" key={item.id}><div className="timeline-time"><Clock size={15} />{item.time}</div><div className="timeline-line"><i /></div><Card><div className="order-actions routine-order-actions"><button aria-label="위로 이동" disabled={index === 0} onClick={()=>move(index,-1)}><ArrowUp size={14}/></button><button aria-label="아래로 이동" disabled={index === data.routine.length - 1} onClick={()=>move(index,1)}><ArrowDown size={14}/></button><button className="routine-delete" aria-label="루틴 삭제" onClick={()=>update(v=>({...v,routine:v.routine.filter(r=>r.id!==item.id)}))}><Trash2 size={14}/></button></div><span className={`subject-badge ${item.subject}`}>{item.subject}</span><h3>{item.title}</h3><p>{item.detail}</p></Card></article>)}</div>
    <Card className="routine-add"><h2>루틴 항목 추가</h2><div className="routine-add-grid"><input value={draft.time} onChange={e=>setDraft({...draft,time:e.target.value})} placeholder="시간 (예: 16:40)"/><select value={draft.subject} onChange={e=>setDraft({...draft,subject:e.target.value as Subject|'생활'})}>{[...SUBJECTS,'생활'].map(s=><option key={s}>{s}</option>)}</select><input value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} placeholder="학습 블록 이름"/><input value={draft.detail} onChange={e=>setDraft({...draft,detail:e.target.value})} placeholder="세부 기준"/><button className="button primary" onClick={add}><Plus size={16}/>추가</button></div></Card>
  </div>;
}
