import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Square } from 'lucide-react';
import type { AppData, Subject } from '../types';
import { SUBJECTS } from '../data/config';
import { Card, PageHeader, Progress, SectionTitle } from '../components/Ui';
import { formatMinutes, toDateKey, uid, weekStartKey } from '../lib/date';

const fmt = (seconds: number) => [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map((v) => String(v).padStart(2, '0')).join(':');
export default function TimerPage({ data, update }: { data: AppData; update: (fn: (value: AppData) => AppData) => void }) {
  const [subject, setSubject] = useState<Subject>('국어'); const [seconds, setSeconds] = useState(0); const [running, setRunning] = useState(false); const startRef = useRef(0); const baseRef = useRef(0);
  useEffect(() => { if (!running) return; startRef.current = Date.now(); const id = window.setInterval(() => setSeconds(baseRef.current + Math.floor((Date.now() - startRef.current) / 1000)), 250); return () => clearInterval(id); }, [running]);
  const pause = () => { baseRef.current = seconds; setRunning(false); };
  const reset = () => { setRunning(false); setSeconds(0); baseRef.current = 0; };
  const stop = () => { if (seconds > 0) update((value) => ({ ...value, sessions: [...value.sessions, { id: uid(), date: toDateKey(), subject, seconds }] })); reset(); };
  const today = toDateKey(), start = weekStartKey();
  const todayBySubject = useMemo(() => Object.fromEntries(SUBJECTS.map((s) => [s, data.sessions.filter((x) => x.date === today && x.subject === s).reduce((a, x) => a + x.seconds, 0)])) as Record<Subject, number>, [data.sessions, today]);
  const weekly = data.sessions.filter((s) => s.date >= start).reduce((a, s) => a + s.seconds, 0);
  return <div><PageHeader eyebrow="STUDY TIMER" title="순공 측정기" description="앱이 화면 밖에 있어도 경과 시각 기준으로 정확하게 측정합니다." />
    <div className="timer-layout"><Card className="timer-card"><div className={`timer-ring ${running ? 'running' : ''}`}><div><span>{subject}</span><strong>{fmt(seconds)}</strong><small>{running ? '집중 세션 진행 중' : seconds ? '일시정지' : 'READY'}</small></div></div><div className="subject-tabs">{SUBJECTS.map((s) => <button className={subject === s ? 'active' : ''} disabled={running || seconds > 0} onClick={() => setSubject(s)} key={s}>{s}</button>)}</div><div className="timer-actions">{!running ? <button className="timer-main" onClick={() => setRunning(true)}><Play fill="currentColor" />{seconds ? '계속' : '시작'}</button> : <button className="timer-main" onClick={pause}><Pause fill="currentColor" />일시정지</button>}<button onClick={stop} disabled={!seconds}><Square size={20} />정지·저장</button><button onClick={reset} disabled={!seconds}><RotateCcw size={20} />초기화</button></div></Card>
      <div><SectionTitle title="오늘 순공" meta={formatMinutes(Object.values(todayBySubject).reduce((a,b)=>a+b,0) / 60)} />{SUBJECTS.map((s) => <Card className="subject-time" key={s}><div><span className={`subject-dot ${s}`} /><b>{s}</b></div><strong>{formatMinutes(todayBySubject[s] / 60)}</strong><Progress value={todayBySubject[s]} max={Math.max(...Object.values(todayBySubject), 1)} /></Card>)}<Card className="weekly-total"><span>이번 주 누적</span><strong>{formatMinutes(weekly / 60)}</strong></Card></div>
    </div>
  </div>;
}
