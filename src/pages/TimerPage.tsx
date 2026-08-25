import { useEffect, useMemo, useRef, useState } from 'react';
import { AlarmClock, Minus, Pause, Play, Plus, RotateCcw, Square, Trash2 } from 'lucide-react';
import type { AppData, MockScheduleItem, Subject } from '../types';
import { SUBJECTS } from '../data/config';
import { Card, PageHeader, Progress, SectionTitle } from '../components/Ui';
import { formatMinutes, toDateKey, uid, weekStartKey } from '../lib/date';

const fmt = (seconds: number) => [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map(v => String(Math.max(v, 0)).padStart(2, '0')).join(':');
const clockMinutes = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
const duration = (item: MockScheduleItem) => Math.max(0, clockMinutes(item.end) - clockMinutes(item.start));

export default function TimerPage({ data, update }: { data: AppData; update: (fn: (value: AppData) => AppData) => void }) {
  const [mode, setMode] = useState<'study' | 'mock'>('study');
  const [subject, setSubject] = useState<Subject>('국어'); const [seconds, setSeconds] = useState(0); const [running, setRunning] = useState(false); const startRef = useRef(0); const baseRef = useRef(0);
  const [now, setNow] = useState(new Date()); const [manualDate, setManualDate] = useState(toDateKey()); const [manualSubject, setManualSubject] = useState<Subject>('국어'); const [hours, setHours] = useState(0); const [minutes, setMinutes] = useState(0); const [note, setNote] = useState('수동 보정');
  useEffect(() => { if (!running) return; startRef.current = Date.now(); const id = window.setInterval(() => setSeconds(baseRef.current + Math.floor((Date.now() - startRef.current) / 1000)), 250); return () => clearInterval(id); }, [running]);
  useEffect(() => { const id = window.setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  const pause = () => { baseRef.current = seconds; setRunning(false); };
  const reset = () => { setRunning(false); setSeconds(0); baseRef.current = 0; };
  const stop = () => { if (seconds > 0) update(value => ({ ...value, sessions: [...value.sessions, { id: uid(), date: toDateKey(), subject, seconds }] })); reset(); };
  const addManual = () => { const total = Math.max(0, hours * 3600 + minutes * 60); if (!total) return; update(value => ({ ...value, sessions: [...value.sessions, { id: uid(), date: manualDate, subject: manualSubject, seconds: total, note: note.trim() || '수동 보정' }] })); setHours(0); setMinutes(0); };
  const deleteSession = (id: string) => { if (window.confirm('이 시간 기록을 삭제할까요? 통계에서도 제외됩니다.')) update(value => ({ ...value, sessions: value.sessions.filter(item => item.id !== id) })); };
  const updateSchedule = (id: string, patch: Partial<MockScheduleItem>) => update(value => ({ ...value, mockSchedule: value.mockSchedule.map(item => item.id === id ? { ...item, ...patch } : item) }));
  const addSchedule = () => update(value => ({ ...value, mockSchedule: [...value.mockSchedule, { id: uid(), label: '새 일정', start: '09:00', end: '09:40', kind: 'exam' }] }));
  const deleteSchedule = (id: string) => update(value => ({ ...value, mockSchedule: value.mockSchedule.filter(item => item.id !== id) }));

  const today = toDateKey(), start = weekStartKey();
  const todayBySubject = useMemo(() => Object.fromEntries(SUBJECTS.map(s => [s, data.sessions.filter(x => x.date === today && x.subject === s).reduce((a, x) => a + x.seconds, 0)])) as Record<Subject, number>, [data.sessions, today]);
  const weekly = data.sessions.filter(s => s.date >= start).reduce((a, s) => a + s.seconds, 0);
  const recent = [...data.sessions].sort((a, b) => `${b.date}-${b.id}`.localeCompare(`${a.date}-${a.id}`)).slice(0, 12);
  const sortedSchedule = [...data.mockSchedule].sort((a, b) => a.start.localeCompare(b.start));
  const minuteNow = now.getHours() * 60 + now.getMinutes();
  const active = sortedSchedule.find(item => minuteNow >= clockMinutes(item.start) && minuteNow < clockMinutes(item.end));
  const next = sortedSchedule.find(item => minuteNow < clockMinutes(item.start));
  const remaining = active ? clockMinutes(active.end) * 60 - (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) : 0;

  return <div><PageHeader eyebrow="STUDY TIMER" title="학습·실모 타이머" description="일반 순공과 2028학년도 수능 시간표 기반 실모 운영을 한곳에서 관리합니다." />
    <div className="timer-mode-tabs"><button className={mode==='study'?'active':''} onClick={()=>setMode('study')}>일반 순공</button><button className={mode==='mock'?'active':''} onClick={()=>setMode('mock')}>실모 운영</button></div>
    {mode === 'study' ? <>
      <div className="timer-layout"><Card className="timer-card"><div className={`timer-ring ${running ? 'running' : ''}`}><div><span>{subject}</span><strong>{fmt(seconds)}</strong><small>{running ? '집중 세션 진행 중' : seconds ? '일시정지' : 'READY'}</small></div></div><div className="subject-tabs">{SUBJECTS.map(s => <button className={subject === s ? 'active' : ''} disabled={running || seconds > 0} onClick={() => setSubject(s)} key={s}>{s}</button>)}</div><div className="timer-actions">{!running ? <button className="timer-main" onClick={() => setRunning(true)}><Play fill="currentColor" />{seconds ? '계속' : '시작'}</button> : <button className="timer-main" onClick={pause}><Pause fill="currentColor" />일시정지</button>}<button onClick={stop} disabled={!seconds}><Square size={20} />정지·저장</button><button onClick={reset} disabled={!seconds}><RotateCcw size={20} />초기화</button></div></Card>
        <div><SectionTitle title="오늘 순공" meta={formatMinutes(Object.values(todayBySubject).reduce((a,b)=>a+b,0) / 60)} />{SUBJECTS.map(s => <Card className="subject-time" key={s}><div><span className={`subject-dot ${s}`} /><b>{s}</b></div><strong>{formatMinutes(todayBySubject[s] / 60)}</strong><Progress value={todayBySubject[s]} max={Math.max(...Object.values(todayBySubject), 1)} /></Card>)}<Card className="weekly-total"><span>이번 주 누적</span><strong>{formatMinutes(weekly / 60)}</strong></Card></div>
      </div>
      <SectionTitle title="시간 수동 보정" meta="누락된 시간 추가 · 과다 기록 삭제" />
      <Card className="manual-time-card"><div className="manual-time-form"><label><span>날짜</span><input type="date" value={manualDate} onChange={e=>setManualDate(e.target.value)}/></label><label><span>과목</span><select value={manualSubject} onChange={e=>setManualSubject(e.target.value as Subject)}>{SUBJECTS.map(s=><option key={s}>{s}</option>)}</select></label><label><span>시간</span><input type="number" min="0" value={hours} onChange={e=>setHours(Number(e.target.value))}/></label><label><span>분</span><input type="number" min="0" max="59" value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/></label><label className="manual-note"><span>사유</span><input value={note} onChange={e=>setNote(e.target.value)}/></label><button className="button primary" onClick={addManual} disabled={hours * 60 + minutes <= 0}><Plus size={16}/>시간 추가</button></div></Card>
      <SectionTitle title="최근 측정 기록" meta="잘못 측정한 기록은 삭제할 수 있습니다." />
      <div className="session-history">{recent.map(item=><Card key={item.id} className="session-row"><div><span className={`subject-dot ${item.subject}`}/><b>{item.subject}</b><small>{item.date} · {item.note || '타이머 측정'}</small></div><strong>{fmt(item.seconds)}</strong><button className="icon-button danger" onClick={()=>deleteSession(item.id)} aria-label="기록 삭제"><Trash2 size={17}/></button></Card>)}</div>
    </> : <>
      <div className="mock-status-grid"><Card className="mock-clock"><AlarmClock/><span>현재 시각</span><strong>{now.toLocaleTimeString('ko-KR',{hour12:false})}</strong><small>입실 완료 08:10</small></Card><Card className="mock-current"><span>{active?'진행 중':next?'다음 일정':'오늘 일정 종료'}</span><h2>{active?.label || next?.label || '수고했습니다'}</h2><strong>{active ? `${fmt(remaining)} 남음` : next ? `${next.start} 시작` : '17:00 종료'}</strong></Card></div>
      <SectionTitle title="2028학년도 수능 실모 시간표" meta="시간과 항목을 직접 수정할 수 있습니다." />
      <div className="mock-schedule">{sortedSchedule.map(item=><Card key={item.id} className={`mock-row ${active?.id===item.id?'active':''}`}><div className="mock-time-edit"><input type="time" value={item.start} onChange={e=>updateSchedule(item.id,{start:e.target.value})}/><span>~</span><input type="time" value={item.end} onChange={e=>updateSchedule(item.id,{end:e.target.value})}/></div><input className="mock-label-edit" value={item.label} onChange={e=>updateSchedule(item.id,{label:e.target.value})}/><select value={item.kind} onChange={e=>updateSchedule(item.id,{kind:e.target.value as MockScheduleItem['kind']})}><option value="exam">시험</option><option value="break">휴식</option><option value="admin">운영</option></select><span className="mock-duration">{duration(item)}분{item.questions?` · ${item.questions}문항`:''}</span><button className="icon-button danger" onClick={()=>deleteSchedule(item.id)}><Trash2 size={16}/></button></Card>)}</div>
      <button className="button mock-add" onClick={addSchedule}><Plus size={16}/>시간표 항목 추가</button>
      <Card className="mock-notice"><Minus/><p>사회·과학탐구를 모두 응시하는 구성은 17:00에 종료됩니다. 실제 응시 영역에 맞게 불필요한 항목을 삭제하거나 시간을 수정하세요.</p></Card>
    </>}
  </div>;
}
