import { useEffect, useRef, useState } from 'react';
import type { Subject, TimerSession } from '../types';
import { toDateKey, uid } from './date';

type Clock = { subject: Subject; startedAt: string; since: string; running: boolean; segments: NonNullable<TimerSession['segments']>; focusDrops: string[] };
const KEY = 'trinity-os:active-clock:v2';
function load(): Clock | null {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && Array.isArray(v.segments) && ['국어','수학','영어','탐구'].includes(v.subject) && Number.isFinite(Date.parse(v.since)) ? v : null; } catch { return null; }
}
export function useStudyClock(save: (session: TimerSession) => void) {
  const [clock, setClock] = useState<Clock | null>(load);
  const [subject, chooseSubject] = useState<Subject>(clock?.subject ?? '국어');
  const [now, setNow] = useState(Date.now());
  const current = useRef(clock); current.current = clock;
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id); }, []);
  const put = (next: Clock | null) => { localStorage.setItem(KEY, JSON.stringify(next)); current.current = next; setClock(next); setNow(Date.now()); };
  const close = (v: Clock, end: string) => [...v.segments, { start: v.since, end, kind: v.running ? 'focus' as const : 'break' as const }];
  const start = () => { const time = new Date().toISOString(); const v = current.current; if (v?.running) return; put(v ? { ...v, since: time, running: true, segments: close(v, time) } : { subject, startedAt: time, since: time, running: true, segments: [], focusDrops: [] }); };
  const pause = () => { const v = current.current; if (!v?.running) return; const time = new Date().toISOString(); put({ ...v, running: false, since: time, segments: close(v, time) }); };
  const reset = () => { if (current.current && !window.confirm('저장하지 않은 타이머를 초기화할까요?')) return; put(null); };
  const stop = () => {
    const v = current.current; if (!v) return;
    const end = new Date().toISOString(); const segments = close(v, end);
    const seconds = Math.floor(segments.filter(s => s.kind === 'focus').reduce((sum, s) => sum + Date.parse(s.end) - Date.parse(s.start), 0) / 1000);
    if (seconds > 0) save({ id: uid(), date: toDateKey(new Date(v.startedAt)), subject: v.subject, seconds, startedAt: v.startedAt, endedAt: end, segments, focusDrops: v.focusDrops });
    put(null);
  };
  const markDrop = () => { const v = current.current; if (v?.running) put({ ...v, focusDrops: [...v.focusDrops, new Date().toISOString()] }); };
  const seconds = clock ? Math.floor((clock.segments.filter(s => s.kind === 'focus').reduce((sum, s) => sum + Date.parse(s.end) - Date.parse(s.start), 0) + (clock.running ? Math.max(0, now - Date.parse(clock.since)) : 0)) / 1000) : 0;
  return { subject, setSubject: (s: Subject) => { if (!clock) chooseSubject(s); }, seconds, running: !!clock?.running, start, pause, stop, reset, markDrop, startedAt: clock?.startedAt };
}
