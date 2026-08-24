import type { AppData, Subject } from '../types';
import { SUBJECTS, ERROR_TYPES } from '../data/config';
import { Card, Empty, PageHeader, Progress, SectionTitle } from '../components/Ui';
import { formatMinutes, toDateKey, weekStartKey } from '../lib/date';

const colors:Record<Subject,string>={국어:'#637da4',수학:'#c9a75d',영어:'#5d927d',탐구:'#9473a5'};
export default function Statistics({data}:{data:AppData}){
 const start=weekStartKey(),days=Array.from({length:7},(_,i)=>{const d=new Date(`${start}T00:00:00`);d.setDate(d.getDate()+i);return toDateKey(d)}); const daily=days.map(d=>data.sessions.filter(s=>s.date===d).reduce((a,s)=>a+s.seconds,0)/3600); const max=Math.max(...daily,1);
 const subjectTotals=Object.fromEntries(SUBJECTS.map(s=>[s,data.sessions.filter(x=>x.date>=start&&x.subject===s).reduce((a,x)=>a+x.seconds,0)])) as Record<Subject,number>; const total=Object.values(subjectTotals).reduce((a,b)=>a+b,0);
 const errors=ERROR_TYPES.map(type=>({type,count:data.scores.filter(s=>s.errorType===type).length})).sort((a,b)=>b.count-a.count); const maxError=Math.max(...errors.map(e=>e.count),1); const latestPlaire=Object.values(data.plaire).sort((a,b)=>b.date.localeCompare(a.date))[0];
 const scores=[...data.scores].reverse().slice(-8);
 return <div><PageHeader eyebrow="STATISTICS" title="학습 시스템 계기판" description="시간, 점수, 오류와 체감 단계를 함께 보며 다음 운영 결정을 내립니다."/>
  <div className="stats-grid"><Card className="chart-card"><SectionTitle title="주간 순공 시간" meta={formatMinutes(total/60)}/><div className="bar-chart">{daily.map((v,i)=><div key={days[i]}><span style={{height:`${Math.max(3,v/max*100)}%`}}><b>{v?v.toFixed(1):''}</b></span><small>{['월','화','수','목','금','토','일'][i]}</small></div>)}</div></Card>
  <Card><SectionTitle title="과목별 시간" meta="이번 주"/><div className="donut-wrap"><div className="donut" style={{background:`conic-gradient(${SUBJECTS.map((s,i)=>`${colors[s]} ${SUBJECTS.slice(0,i).reduce((a,x)=>a+(subjectTotals[x]/Math.max(total,1)*100),0)}% ${SUBJECTS.slice(0,i+1).reduce((a,x)=>a+(subjectTotals[x]/Math.max(total,1)*100),0)}%`).join(',')})`}}><span><b>{Math.round(total/3600)}</b>h</span></div><div className="legend">{SUBJECTS.map(s=><div key={s}><i style={{background:colors[s]}}/><span>{s}</span><b>{formatMinutes(subjectTotals[s]/60)}</b></div>)}</div></div></Card></div>
  <div className="stats-grid"><Card><SectionTitle title="오답 유형 빈도" meta={`${data.scores.length}개 시험`}/><div className="error-bars">{errors.map(e=><div key={e.type}><span>{e.type}</span><div><i style={{width:`${e.count/maxError*100}%`}}/></div><b>{e.count}</b></div>)}</div></Card><Card><SectionTitle title="Plaire 단계" meta={latestPlaire?.date??'기록 없음'}/>{latestPlaire?<div className="plaire-levels"><Progress label="기준" value={latestPlaire.levels.criterion} max={10}/><Progress label="몰입" value={latestPlaire.levels.immersion} max={10}/><Progress label="체화" value={latestPlaire.levels.embodiment} max={10}/></div>:<Empty>Plaire Review에서 단계를 기록하세요.</Empty>}</Card></div>
  <Card className="score-chart"><SectionTitle title="실모 점수 변화" meta="최근 8회"/>{scores.length?<div className="score-table"><div className="score-table-head"><span>시험</span><span>국어</span><span>수학</span><span>영어</span></div>{scores.map(s=><div key={s.id}><span>{s.name}<small>{s.date}</small></span><b>{s.korean??'—'}</b><b>{s.math??'—'}</b><b>{s.english??'—'}</b></div>)}</div>:<Empty>점수 기록이 쌓이면 변화가 표시됩니다.</Empty>}</Card>
 </div>;
}
