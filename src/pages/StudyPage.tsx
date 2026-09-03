import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Flag, Play, Square } from 'lucide-react';
import type { AppData } from '../types';
import { Card, Empty, PageHeader } from '../components/Ui';
import { toDateKey } from '../lib/date';
import TimerPage from './TimerPage';

export default function StudyPage({ data, update, navigate }: { data: AppData; update: (fn: (value: AppData) => AppData) => void; navigate: (page: string) => void }) {
  const [mode, setMode] = useState<'timer' | 'practice'>('timer');
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => { if (!running || startedAt === null) return; const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000); return () => window.clearInterval(id); }, [running, startedAt]);
  const total = useMemo(() => data.mockSchedule.filter((item) => item.kind === 'exam').reduce((sum, item) => sum + ((Number(item.end.slice(0, 2)) * 60 + Number(item.end.slice(3))) - (Number(item.start.slice(0, 2)) * 60 + Number(item.start.slice(3)))), 0), [data.mockSchedule]);
  const finishPractice = () => { setRunning(false); setElapsed(0); setStartedAt(null); navigate('review'); };
  const clock = (seconds: number) => `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return <div>
    <PageHeader eyebrow="STUDY" title="공부를 실행한다" description="시간을 기록하는 것보다, 오늘 무엇을 개선했는지가 중심이 되도록 설계했습니다." />
    <div className="workspace-tabs"><button className={mode === 'timer' ? 'active' : ''} onClick={() => setMode('timer')}><Clock3 size={16}/> 순공 Timer</button><button className={mode === 'practice' ? 'active' : ''} onClick={() => setMode('practice')}><Flag size={16}/> 실전 Mode</button></div>
    {mode === 'timer' ? <TimerPage data={data} update={update}/> : <div className="study-practice">
      <Card className="practice-hero"><div><span className="card-label">PRACTICE MODE · {toDateKey().replaceAll('-', '.')}</span><h2>실전 조건을 그대로 재현</h2><p>시험 시간표를 따라가며 실행하고, 종료하면 바로 Review Hub로 이동합니다.</p></div><div className="practice-clock">{clock(elapsed)}</div></Card>
      <div className="practice-grid"><Card><div className="section-title"><h2>시험 진행</h2><span>{running ? '진행 중' : '대기'}</span></div><div className="practice-actions">{!running ? <button className="button primary" onClick={() => { setStartedAt(Date.now()); setRunning(true); }}><Play size={16}/> 실전 시작</button> : <button className="button" onClick={finishPractice}><Square size={15}/> 실전 종료 → Review</button>}</div><div className="practice-meta"><span>시험 구간 {Math.round(total)}분</span><span>종료 후 원인 분석으로 연결</span></div></Card><Card><div className="section-title"><h2>오늘의 시험 시간표</h2><span>{data.mockSchedule.length}개 구간</span></div>{data.mockSchedule.length ? <div className="practice-schedule">{data.mockSchedule.map((item) => <div key={item.id} className={`schedule-row ${item.kind}`}><span>{item.start}</span><b>{item.label}</b><small>{item.end}{item.questions ? ` · ${item.questions}문항` : ''}</small></div>)}</div> : <Empty>실전 시간표가 없습니다.</Empty>}</Card></div>
      <Card className="practice-next"><CheckCircle2 size={18}/><div><b>실전 종료 후</b><p>오늘의 막힘 → 실패 원인 → 교정 행동 → 재검증 Drill을 Review Hub에서 바로 남깁니다.</p></div></Card>
    </div>}
  </div>;
}
