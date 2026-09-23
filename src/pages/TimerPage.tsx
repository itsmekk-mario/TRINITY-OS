import { useEffect, useMemo, useRef, useState } from 'react';
import { AlarmClock, Minus, Pause, Play, Plus, RotateCcw, Square, Trash2 } from 'lucide-react';
import type { AppData, MockScheduleItem, Subject } from '../types';
import { SUBJECTS } from '../data/config';
import { Card, PageHeader, Progress, SectionTitle } from '../components/Ui';
import { formatMinutes, toDateKey, uid, weekStartKey } from '../lib/date';

import { studyTotals } from '../lib/studyTotals';
import { useStudyClock } from '../lib/useStudyClock';
import { getYptStatus, resolveYpt, startYpt, stopYpt, type YptStatus } from '../lib/ypt';

const fmt = (seconds: number) => [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map(v => String(Math.max(v, 0)).padStart(2, '0')).join(':');
const clockMinutes = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
const duration = (item: MockScheduleItem) => Math.max(0, clockMinutes(item.end) - clockMinutes(item.start));

export default function TimerPage({ data, update }: { data: AppData; update: (fn: (value: AppData) => AppData) => void }) {
  const [mode, setMode] = useState<'study' | 'mock'>('study');
  const { subject, setSubject, seconds, running, start: startClock, pause, stop, reset, startedAt } = useStudyClock(session => update(value => ({ ...value, sessions: [...value.sessions, session] })));
  const [ypt, setYpt] = useState<YptStatus | null>(null);
  const [yptError, setYptError] = useState('');
  const [yptBusy, setYptBusy] = useState(false);
  const yptBusyRef = useRef(false);
  useEffect(() => {
    let live = true;
    const refresh = () => { void getYptStatus().then(next => { if (live) { setYpt(next); setYptError(''); } }).catch(() => { if (live) { setYpt(null); setYptError('열품타 연결 상태를 확인할 수 없습니다.'); } }); };
    refresh(); window.addEventListener('trinity-ypt-change', refresh);
    return () => { live = false; window.removeEventListener('trinity-ypt-change', refresh); };
  }, []);
  const transition = async (action: 'start' | 'pause' | 'stop' | 'reset') => {
    if (yptBusyRef.current || !ypt) return;
    if (action === 'reset' && !window.confirm(ypt.connected ? 'TRINITY 타이머를 초기화할까요? 열품타에 이미 기록된 공부시간은 남습니다.' : '저장하지 않은 타이머를 초기화할까요?')) return;
    yptBusyRef.current = true; setYptBusy(true); setYptError('');
    try {
      const remote = await getYptStatus();
      setYpt(remote);
      if (!remote.connected) {
        if (action === 'start') startClock();
        else if (action === 'pause') pause();
        else if (action === 'stop') stop();
        else reset(true);
        return;
      }
      if (remote.state === 'uncertain' || remote.state === 'starting' || remote.state === 'stopping') throw new Error('열품타 작업 결과를 확인해야 합니다. 앱에서 타이머 상태를 확인해 주세요.');
      if (running !== (remote.state === 'running')) throw new Error('TRINITY와 열품타 타이머 상태가 다릅니다. 열품타 앱에서 정지 여부를 확인해 주세요.');
      if (action === 'start') {
        if (remote.state !== 'idle') throw new Error('열품타 타이머가 이미 실행 중입니다.');
        const result = await startYpt(subject);
        if (!result.startedAt) throw new Error('열품타 시작 시각을 확인하지 못했습니다. 앱에서 상태를 확인해 주세요.');
        startClock(result.startedAt);
        setYpt({ ...remote, state: 'running', activeStartedAt: result.startedAt, activeSubject: subject });
      } else if (action === 'pause') {
        const result = await stopYpt();
        pause(result.stoppedAt ?? Date.now());
        setYpt({ ...remote, state: 'idle', activeStartedAt: null, activeSubject: null });
      } else if (action === 'stop') {
        const endedAt = running ? (await stopYpt()).stoppedAt ?? Date.now() : Date.now();
        stop(endedAt);
        setYpt({ ...remote, state: 'idle', activeStartedAt: null, activeSubject: null });
      } else {
        if (running) await stopYpt();
        reset(true);
        setYpt({ ...remote, state: 'idle', activeStartedAt: null, activeSubject: null });
      }
    } catch (cause) {
      setYptError(cause instanceof Error ? cause.message : '열품타 상태를 확인할 수 없습니다.');
      try { setYpt(await getYptStatus()); } catch { setYpt(null); }
    } finally { yptBusyRef.current = false; setYptBusy(false); }
  };
  const recover = async () => {
    if (!ypt || !window.confirm('열품타 앱에서 실행 중인 타이머를 직접 정지했나요? 확인 후 TRINITY 타이머를 일시정지합니다. 수동으로 정지한 시각과 차이가 나면 기록을 보정해 주세요.')) return;
    yptBusyRef.current = true; setYptBusy(true);
    try {
      if (ypt.state !== 'idle') await resolveYpt();
      if (running) pause();
      setYpt(await getYptStatus()); setYptError('');
    } catch (cause) { setYptError(cause instanceof Error ? cause.message : '상태 복구에 실패했습니다.'); }
    finally { yptBusyRef.current = false; setYptBusy(false); }
  };
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
  const sortedSchedule = [...data.mockSchedule].sort((a, b) => a.start.localeCompare(b.start));
  const minuteNow = now.getHours() * 60 + now.getMinutes();
  const active = sortedSchedule.find(item => minuteNow >= clockMinutes(item.start) && minuteNow < clockMinutes(item.end));
  const next = sortedSchedule.find(item => minuteNow < clockMinutes(item.start));
  const remaining = active ? clockMinutes(active.end) * 60 - (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) : 0;

  return <div><PageHeader eyebrow="STUDY TIMER" title="학습·실모 타이머" description="일반 순공과 2028학년도 수능 시간표 기반 실모 운영을 한곳에서 관리합니다." />
    <div className="timer-mode-tabs"><button className={mode==='study'?'active':''} onClick={()=>setMode('study')}>일반 순공</button><button className={mode==='mock'?'active':''} onClick={()=>setMode('mock')}>실모 운영</button></div>
    {mode === 'study' ? <>
      <p>시작·일시정지·재개·종료 시각을 기록합니다. 일시정지 구간은 휴식으로만 기록됩니다.</p>{startedAt && <p>시작 {new Date(startedAt).toLocaleString("ko-KR")} · 화면을 닫아도 계속 측정됩니다.</p>}
      <p className="ypt-timer-status">열품타: {!ypt ? '연결 확인 중' : !ypt.connected ? '연동 안 함' : ypt.state === 'idle' ? '정지' : ypt.state === 'running' ? '공부 중' : '상태 확인 필요'}</p>
      {yptError && <p role="alert" className="ypt-error">{yptError}</p>}
      {!ypt && <button type="button" onClick={() => void getYptStatus().then(next => { setYpt(next); setYptError(''); }).catch(() => setYptError('열품타 연결 상태를 확인할 수 없습니다.'))}>연결 다시 확인</button>}
      {ypt?.connected && (['starting', 'stopping', 'uncertain'].includes(ypt.state) || running !== (ypt.state === 'running')) && <button type="button" disabled={yptBusy} onClick={() => void recover()}>열품타 앱에서 정지 후 복구</button>}
      <div className="timer-layout"><Card className="timer-card"><div className={`timer-ring ${running ? 'running' : ''}`}><div><span>{subject}</span><strong>{fmt(seconds)}</strong><small>{running ? '집중 세션 진행 중' : seconds ? '일시정지' : 'READY'}</small></div></div><div className="subject-tabs">{SUBJECTS.map(s => <button className={subject === s ? 'active' : ''} disabled={running || seconds > 0 || yptBusy} onClick={() => setSubject(s)} key={s}>{s}</button>)}</div><div className="timer-actions">{!running ? <button className="timer-main" disabled={!ypt || yptBusy} onClick={() => void transition('start')}><Play fill="currentColor" />{seconds ? '계속' : '시작'}</button> : <button className="timer-main" disabled={!ypt || yptBusy} onClick={() => void transition('pause')}><Pause fill="currentColor" />일시정지</button>}<button onClick={() => void transition('stop')} disabled={!ypt || yptBusy || !seconds}><Square size={20} />정지·저장</button><button onClick={() => void transition('reset')} disabled={!ypt || yptBusy || !seconds}><RotateCcw size={20} />초기화</button></div></Card>
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
