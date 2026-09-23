import { useEffect, useRef, useState } from 'react';
import type { Subject, TimerSession } from '../types';
import { toDateKey, uid } from './date';
import { loadCloudflareConfig } from './cloudflare';

export type ActiveStudyClock = { subject: Subject; startedAt: string; since: string; running: boolean; segments: NonNullable<TimerSession['segments']> };
type Clock = ActiveStudyClock;
const key = () => {
  const userId = loadCloudflareConfig().userId;
  return userId === undefined ? null : `trinity-os:active-clock:${userId}:v2`;
};
export const STUDY_CLOCK_EVENT = 'trinity-study-clock-change';
function load(): Clock | null {
  try { const storageKey = key(); const v = JSON.parse(storageKey ? localStorage.getItem(storageKey) || 'null' : 'null'); return v && Array.isArray(v.segments) && ['국어','수학','영어','통사','통과','탐구'].includes(v.subject) && Number.isFinite(Date.parse(v.since)) ? v : null; } catch { return null; }
}
export const readStudyClock = () => load();
export const studyClockElapsedSeconds = (clock: ActiveStudyClock, now = Date.now()) => Math.floor((clock.segments.filter(s => s.kind === 'focus').reduce((sum, s) => sum + Date.parse(s.end) - Date.parse(s.start), 0) + (clock.running ? Math.max(0, now - Date.parse(clock.since)) : 0)) / 1000);
export function useStudyClock(save: (session: TimerSession) => void) {
  const [clock, setClock] = useState<Clock | null>(load);
  const [subject, chooseSubject] = useState<Subject>(clock?.subject ?? '국어');
  const [now, setNow] = useState(Date.now());
  const current = useRef(clock); current.current = clock;
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id); }, []);
  const put = (next: Clock | null) => { const storageKey=key(); if (storageKey) { if(next) localStorage.setItem(storageKey, JSON.stringify(next)); else localStorage.removeItem(storageKey); } window.dispatchEvent(new Event(STUDY_CLOCK_EVENT)); current.current = next; setClock(next); setNow(Date.now()); };
  const close = (v: Clock, end: string) => [...v.segments, { start: v.since, end, kind: v.running ? 'focus' as const : 'break' as const }];
  const start = (at = Date.now()) => { const time = new Date(at).toISOString(); const v = current.current; if (v?.running) return; put(v ? { ...v, since: time, running: true, segments: close(v, time) } : { subject, startedAt: time, since: time, running: true, segments: [] }); };
  const pause = (at = Date.now()) => { const v = current.current; if (!v?.running) return; const time = new Date(at).toISOString(); put({ ...v, running: false, since: time, segments: close(v, time) }); };
  const reset = (confirmed = false) => { if (current.current && !confirmed && !window.confirm('저장하지 않은 타이머를 초기화할까요?')) return; put(null); };
  const stop = (at = Date.now()) => {
    const v = current.current; if (!v) return;
    const end = new Date(at).toISOString(); const segments = close(v, end);
    const seconds = Math.floor(segments.filter(s => s.kind === 'focus').reduce((sum, s) => sum + Date.parse(s.end) - Date.parse(s.start), 0) / 1000);
    if (seconds > 0) save({ id: uid(), date: toDateKey(new Date(v.startedAt)), subject: v.subject, seconds, startedAt: v.startedAt, endedAt: end, segments });
    put(null);
  };
  const seconds = clock ? studyClockElapsedSeconds(clock, now) : 0;
  return { subject, setSubject: (s: Subject) => { if (!clock) chooseSubject(s); }, seconds, running: !!clock?.running, start, pause, stop, reset, startedAt: clock?.startedAt };
}
