import { useEffect, useMemo, useState } from 'react';
import { AlarmClock, Minus, Pause, Play, Plus, RotateCcw, Square, Trash2 } from 'lucide-react';
import type { AppData, MockScheduleItem, Subject } from '../types';
import { SUBJECTS } from '../data/config';
import { Card, PageHeader, Progress, SectionTitle } from '../components/Ui';
import { formatMinutes, toDateKey, uid, weekStartKey } from '../lib/date';

import { studyTotals } from '../lib/studyTotals';
import { useStudyClock } from '../lib/useStudyClock';

const fmt = (seconds: number) => [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map(v => String(Math.max(v, 0)).padStart(2, '0')).join(':');
const clockMinutes = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
const duration = (item: MockScheduleItem) => Math.max(0, clockMinutes(item.end) - clockMinutes(item.start));

export default function TimerPage({ data, update, navigate }: { data: AppData; update: (fn: (value: AppData) => AppData) => void; navigate?: (target: string) => void }) {
  const [resourceId,setResourceId]=useState('');
  const [planId,setPlanId]=useState('');
  const [lastSessionId,setLastSessionId]=useState('');
  const [mode, setMode] = useState<'study' | 'mock'>('study');
  const { subject, setSubject, seconds, running, start: startClock, pause, stop, reset, startedAt } = useStudyClock(session => { update(value => ({ ...value, sessions: [...value.sessions, session] })); setLastSessionId(session.id); }, {resourceId:resourceId||undefined,planId:planId||undefined});
  const [now, setNow] = useState(new Date()); const [manualDate, setManualDate] = useState(toDateKey()); const [manualSubject, setManualSubject] = useState<Subject>('국어'); const [hours, setHours] = useState(0); const [minutes, setMinutes] = useState(0); const [note, setNote] = useState('수동 보정');
  useEffect(() => { const id = window.setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  const addManual = () => { const total = Math.max(0, hours * 3600 + minutes * 60); if (!total) return; update(value => ({ ...value, sessions: [...value.sessions, { id: uid(), date: manualDate, subject: manualSubject, seconds: total, note: note.trim() || '수동 보정' }] })); setHours(0); setMinutes(0); };
  const deleteSession = (id: string) => { if (window.confirm('이 시간 기록을 삭제할까요? 통계에서도 제외됩니다.')) update(value => ({ ...value, sessions: value.sessions.filter(item => item.id !== id) })); };
  const updateSchedule = (id: string, patch: Partial<MockScheduleItem>) => update(value => ({ ...value, mockSchedule: value.mockSchedule.map(item => item.id === id ? { ...item, ...patch } : item) }));
  const addSchedule = () => update(value => ({ ...value, mockSchedule: [...value.mockSchedule, { id: uid(), label: '새 일정', start: '09:00', end: '09:40', kind: 'exam' }] }));
  const deleteSchedule = (id: string) => update(value => ({ ...value, mockSchedule: value.mockSchedule.filter(item => item.id !== id) }));

  const today = toDateKey(), start = weekStartKey();
  const todayBySubject = useMemo(() => Object.fromEntries(SUBJECTS.map(s => [s, (studyTotals(data.sessions.filter(x => x.subject === s))[today] ?? 0)])) as Record<Subject, number>, [data.sessions, today]);
  const weekly = Object.entries(studyTotals(data.sessions)).filter(([date]) => date >= start && date <= today).reduce((sum, [,seconds]) => sum + seconds, 0);
  const recent = [...data.sessions].sort((a, b) => `${b.date}-${b.id}`.localeCompare(`${a.date}-${a.id}`)).slice(0, 12);
  const lastSession = data.sessions.find(session => session.id === lastSessionId);
  const linkedPlan = lastSession?.planId ? data.calendar[lastSession.date]?.plans?.find(plan => plan.id === lastSession.planId) : undefined;
  const setLastPlanOutcome = (outcome: 'achieved' | 'partial' | 'failed') => {
    if (!lastSession?.planId) return;
    update(value => { const entry = value.calendar[lastSession.date]; if (!entry) return value; return { ...value, calendar: { ...value.calendar, [lastSession.date]: { ...entry, plans: (entry.plans ?? []).map(plan => plan.id === lastSession.planId ? { ...plan, outcome, done: outcome === 'achieved', updatedAt: new Date().toISOString() } : plan) } } }; });
  };
  const beginSession = () => {
    if (planId && !startedAt) {
      const date = toDateKey();
      update(value => {
        const entry = value.calendar[date];
        if (!entry) return value;
        return { ...value, calendar: { ...value.calendar, [date]: { ...entry, plans: (entry.plans ?? []).map(plan => plan.id === planId && !plan.done ? { ...plan, outcome: 'in_progress' as const, updatedAt: new Date().toISOString() } : plan) } } };
      });
    }
    startClock();
  };
  const sortedSchedule = [...data.mockSchedule].sort((a, b) => a.start.localeCompare(b.start));
  const minuteNow = now.getHours() * 60 + now.getMinutes();
  const active = sortedSchedule.find(item => minuteNow >= clockMinutes(item.start) && minuteNow < clockMinutes(item.end));
  const next = sortedSchedule.find(item => minuteNow < clockMinutes(item.start));
  const remaining = active ? clockMinutes(active.end) * 60 - (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) : 0;

  return <div><div className="form-grid two"><label>학습 자료<select disabled={Boolean(startedAt)} value={resourceId} onChange={e=>setResourceId(e.target.value)}><option value="">연결 없음</option>{data.resources.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label>Daily Plan<select disabled={Boolean(startedAt)} value={planId} onChange={e=>{setPlanId(e.target.value);const p=data.calendar[toDateKey()]?.plans?.find(p=>p.id===e.target.value);if(p){setResourceId(p.resourceId ?? '');if(p.subject!=='생활')setSubject(p.subject);}}}><option value="">연결 없음</option>{(data.calendar[toDateKey()]?.plans ?? []).map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label></div><PageHeader eyebrow="STUDY TIMER" title="학습·실모 타이머" description="일반 순공과 2028학년도 수능 시간표 기반 실모 운영을 한곳에서 관리합니다." />
    <div className="timer-mode-tabs"><button className={mode==='study'?'active':''} onClick={()=>setMode('study')}>일반 순공</button><button className={mode==='mock'?'active':''} onClick={()=>setMode('mock')}>실모 운영</button></div>
    {mode === 'study' ? <>
      {lastSession && <section className="session-wrapup" aria-label="방금 끝난 학습"><span className="card-label">SESSION COMPLETE</span><h2>{lastSession.subject} · {formatMinutes(lastSession.seconds / 60)}</h2><p>{linkedPlan ? `Daily Plan: ${linkedPlan.title}` : '자유 학습 세션'}</p><label>짧은 메모<input value={lastSession.note ?? ''} onChange={event => update(value => ({ ...value, sessions: value.sessions.map(session => session.id === lastSession.id ? { ...session, note: event.target.value } : session) }))} placeholder="무엇을 마쳤나요?" /></label>{linkedPlan && <div className="session-wrapup-actions"><span>완료 여부</span><button onClick={() => setLastPlanOutcome('achieved')}>✓ 완료</button><button onClick={() => setLastPlanOutcome('partial')}>△ 일부 완료</button><button onClick={() => setLastPlanOutcome('failed')}>× 실패</button></div>}<div className="session-wrapup-actions"><button className="button" onClick={() => navigate?.('review:wrong')}>Wrong Answer</button><button className="button" onClick={() => navigate?.('review:archive')}>Learning Archive</button><button className="text-button" onClick={() => setLastSessionId('')}>닫기</button></div></section>}
      <p>시작·일시정지·재개·종료 시각을 기록합니다. 일시정지 구간은 휴식으로만 기록됩니다.</p>{startedAt && <p>시작 {new Date(startedAt).toLocaleString("ko-KR")} · 화면을 닫아도 계속 측정됩니다.</p>}<div className="timer-layout"><Card className="timer-card"><div className={`timer-ring ${running ? 'running' : ''}`}><div><span>{subject}</span><strong>{fmt(seconds)}</strong><small>{running ? '집중 세션 진행 중' : seconds ? '일시정지' : 'READY'}</small></div></div><div className="subject-tabs">{SUBJECTS.map(s => <button className={subject === s ? 'active' : ''} disabled={running || seconds > 0} onClick={() => setSubject(s)} key={s}>{s}</button>)}</div><div className="timer-actions">{!running ? <button className="timer-main" onClick={beginSession}><Play fill="currentColor" />{seconds ? '계속' : '시작'}</button> : <button className="timer-main" onClick={pause}><Pause fill="currentColor" />일시정지</button>}<button onClick={stop} disabled={!seconds}><Square size={20} />정지·저장</button><button onClick={reset} disabled={!seconds}><RotateCcw size={20} />초기화</button></div></Card>
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
