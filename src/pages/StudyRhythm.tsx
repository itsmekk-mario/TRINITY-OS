import { useState } from 'react';
import type { TimerSession } from '../types';
import { toDateKey, weekStartKey } from '../lib/date';
import { Card } from '../components/Ui';

// Native application heatmap: seven local dates × 24 hours, exact interval overlap in minutes.
// Fixed 0–60 minute scale; old duration-only records are never assigned invented timestamps.
export default function StudyRhythm({ sessions }: { sessions: TimerSession[] }) {
  const [week, setWeek] = useState(weekStartKey());
  const [kind, setKind] = useState<'focus' | 'break'>('focus');
  const dates = Array.from({ length: 7 }, (_, i) => { const d = new Date(week + 'T00:00:00'); d.setDate(d.getDate()+i); return toDateKey(d); });
  const intervals = sessions.flatMap(s => s.segments ?? []).filter(s => Number.isFinite(Date.parse(s.start)) && Date.parse(s.end) > Date.parse(s.start));
  const from = Date.parse(dates[0]+'T00:00:00'); const last = new Date(dates[6]+'T00:00:00'); last.setDate(last.getDate()+1); const until = last.getTime();
  const inWeek = intervals.filter(s => Date.parse(s.start)<until && Date.parse(s.end)>from);
  const longest = Math.max(0,...inWeek.filter(s=>s.kind==='focus').map(s=>(Math.min(until,Date.parse(s.end))-Math.max(from,Date.parse(s.start)))/60000));
  return <Card><h2>주간 학습 시간대</h2><label>주 선택 <input type="date" value={week} onChange={e=>{if(e.target.value)setWeek(weekStartKey(new Date(e.target.value+'T00:00:00')));}} /></label>
    <p>현재 기기 시간대: {Intl.DateTimeFormat().resolvedOptions().timeZone} · 최장 연속 집중 {Math.floor(longest)}분</p>
    <p>일시정지 구간만 휴식으로 표시합니다. 빈칸은 기록 없음이며, 집중 저하의 증거가 아닙니다.</p>
    <div className="plan-tabs"><button className={kind==='focus'?'active':''} onClick={()=>setKind('focus')}>집중</button><button className={kind==='break'?'active':''} onClick={()=>setKind('break')}>휴식</button></div>
    <div style={{overflowX:'auto'}}><table className="rhythm-grid"><caption>{dates[0]} ~ {dates[6]} · 셀 숫자: 분 · 색 농도: 0–60분</caption><thead><tr><th>날짜</th>{Array.from({length:24},(_,h)=><th key={h}>{h}</th>)}</tr></thead><tbody>{dates.map(date=><tr key={date}><th>{date.slice(5)}</th>{Array.from({length:24},(_,h)=>{
      const start=new Date(date+'T00:00:00');start.setHours(h);const end=new Date(start);end.setHours(h+1);
      const parts=intervals.filter(s=>s.kind===kind).map(s=>[Math.max(+start,Date.parse(s.start)),Math.min(+end,Date.parse(s.end))]).filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]);
      let total=0,edge=+start;for(const [a,b] of parts){total+=Math.max(0,b-Math.max(edge,a));edge=Math.max(edge,b);}
      const minutes=Math.round(total/60000);
      return <td key={h} title={date+' '+h+'시 '+kind+' '+minutes+'분'} style={{background:minutes ? 'rgba(99,125,164,'+(0.15+0.65*Math.min(minutes/60,1))+')':'#f4f5f7'}}>{minutes||'·'}</td>;
    })}</tr>)}</tbody></table></div>
    <div style={{overflowX:'auto'}}><table className="rhythm-summary"><thead><tr><th>날짜</th><th>첫 집중</th><th>마지막 집중 종료</th><th>집중 저하 직접 표시</th></tr></thead><tbody>{dates.map(date=>{
      const start=Date.parse(date+'T00:00:00');const end=new Date(start);end.setDate(end.getDate()+1);
      const focus=inWeek.filter(s=>s.kind==='focus'&&Date.parse(s.start)<+end&&Date.parse(s.end)>start);
      const format=(v:number)=>new Date(v).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false});
      const drops=sessions.flatMap(s=>s.focusDrops??[]).filter(t=>toDateKey(new Date(t))===date);
      return <tr key={date}><td>{date}</td><td>{focus.length?format(Math.max(start,Math.min(...focus.map(s=>Date.parse(s.start))))):'—'}</td><td>{focus.length?format(Math.min(+end,Math.max(...focus.map(s=>Date.parse(s.end))))):'—'}</td><td>{drops.map(t=>format(Date.parse(t))).join(', ')||'기록 없음'}</td></tr>;
    })}</tbody></table></div>
    <p>과거 기록과 수동 입력은 시작·종료가 없으면 히트맵에서 제외하고 기존 학습량 통계에는 유지합니다.</p>
  </Card>;
}
