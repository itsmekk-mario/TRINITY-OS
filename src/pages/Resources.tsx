import { useState } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import type { AppData, Resource, Subject } from '../types';
import { SUBJECTS } from '../data/config';
import { Card, PageHeader, Progress } from '../components/Ui';
import { uid } from '../lib/date';

export default function Resources({ data, update }: { data: AppData; update: (fn: (value: AppData) => AppData) => void }) {
  const [filter, setFilter] = useState<Subject | '전체'>('전체'); const resources = filter === '전체' ? data.resources : data.resources.filter((r) => r.subject === filter);
  const [draft,setDraft]=useState({subject:'국어' as Subject,group:'',name:'',total:1});
  const change = (item: Resource, amount: number) => update((value) => ({ ...value, resources: value.resources.map((r) => r.id === item.id ? { ...r, done: Math.max(0, Math.min(r.total, r.done + amount)) } : r) }));
  const total = resources.reduce((a,r)=>a+r.total,0), done=resources.reduce((a,r)=>a+r.done,0);
  const add=()=>{if(!draft.name.trim())return;update(v=>({...v,resources:[...v.resources,{...draft,id:uid(),done:0,total:Math.max(1,draft.total)}]}));setDraft({subject:'국어',group:'',name:'',total:1})};
  return <div><PageHeader eyebrow="RESOURCE DATABASE" title="학습 자원 현황" description="보유량과 실제 완료량을 분리해, 막연한 진도 감각을 수치로 바꿉니다." />
    <Card className="resource-summary"><div><span className="card-label">선택 범위 진행률</span><strong>{done} / {total}</strong></div><Progress value={done} max={total} /></Card><div className="filter-tabs">{(['전체',...SUBJECTS] as const).map((x)=><button key={x} onClick={()=>setFilter(x)} className={filter===x?'active':''}>{x}</button>)}</div>
    <div className="resource-grid">{resources.map((r)=><Card key={r.id} className="resource-card"><div className="resource-head"><span className={`subject-badge ${r.subject}`}>{r.subject} · {r.group}</span><span><b>{Math.round(r.done/r.total*100)}%</b><button className="resource-delete" onClick={()=>update(v=>({...v,resources:v.resources.filter(x=>x.id!==r.id)}))}><Trash2 size={14}/></button></span></div><h3>{r.name}</h3><Progress value={r.done} max={r.total}/><div className="stepper"><button onClick={()=>change(r,-1)} disabled={!r.done}><Minus size={17}/></button><strong>{r.done}<small> / {r.total}</small></strong><button onClick={()=>change(r,1)} disabled={r.done>=r.total}><Plus size={17}/></button></div></Card>)}</div>
    <Card className="resource-add"><h2>자료 추가</h2><div className="resource-add-grid"><select value={draft.subject} onChange={e=>setDraft({...draft,subject:e.target.value as Subject})}>{SUBJECTS.map(s=><option key={s}>{s}</option>)}</select><input value={draft.group} onChange={e=>setDraft({...draft,group:e.target.value})} placeholder="분류 (예: 수1)"/><input value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} placeholder="자료명"/><input type="number" min="1" value={draft.total} onChange={e=>setDraft({...draft,total:Number(e.target.value)})}/><button className="button primary" onClick={add}><Plus size={16}/>추가</button></div></Card>
  </div>;
}
