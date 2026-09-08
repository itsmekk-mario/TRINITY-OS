import { useMemo, useState } from 'react';
import { Clock3, Timer, TrendingUp } from 'lucide-react';
import type { AppData, Subject, TimerSession } from '../types';
import { SUBJECTS } from '../data/config';
import { Card, Empty, PageHeader, SectionTitle } from '../components/Ui';
import { toDateKey } from '../lib/date';
import { studyTotals } from '../lib/studyTotals';

const COLOR: Record<Subject, string> = { 국어: '#52647d', 수학: '#d08a35', 영어: '#64a486', 탐구: '#9172a4' };
const DAY = ['일', '월', '화', '수', '목', '금', '토'];
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const compact = (seconds: number) => seconds >= 3600 ? `${Math.floor(seconds / 3600)}시간 ${Math.round(seconds % 3600 / 60)}분` : `${Math.round(seconds / 60)}분`;
const dateRange = (start: Date, end: Date) => { const out: string[] = []; const cursor = new Date(start); while (cursor <= end) { out.push(toDateKey(cursor)); cursor.setDate(cursor.getDate() + 1); } return out; };

function MonthHeatmap({ month, totals }: { month: Date; totals: Record<string, number> }) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1); const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const dates = Array.from({ length: last.getDate() }, (_, i) => `${monthKey(month)}-${String(i + 1).padStart(2, '0')}`);
  const max = Math.max(1, ...dates.map(date => totals[date] ?? 0)); const total = dates.reduce((sum, date) => sum + (totals[date] ?? 0), 0);
  return <section className="insight-month"><header><b>{month.getMonth() + 1}월</b><small>{compact(total)}</small></header><div className="insight-weekdays">{DAY.map(d => <span key={d}>{d}</span>)}</div><div className="insight-calendar">{Array.from({ length: first.getDay() }, (_, i) => <i key={i} />)}{dates.map((date, i) => { const seconds = totals[date] ?? 0; const label = seconds >= 3600 ? `${Math.round(seconds / 3600)}h` : seconds ? `${Math.round(seconds / 60)}m` : ''; return <div key={date} title={`${date} · ${compact(seconds)}`} className={seconds ? 'has-study' : ''} style={seconds ? { '--level': String(.13 + Math.min(.87, seconds / max * .87)) } as React.CSSProperties : undefined}><b>{i + 1}</b>{label && <small>{label}</small>}</div>; })}</div></section>;
}

function DailyBars({ dates, totals, byDay }: { dates: string[]; totals: Record<string, number>; byDay: Record<string, Record<Subject, number>> }) {
  const max = Math.max(1, ...dates.map(date => totals[date] ?? 0));
  return <div className="insight-bars">{dates.map(date => { const seconds = totals[date] ?? 0; return <div key={date} title={`${date} · ${compact(seconds)}`}><div className="insight-stack" style={{ height: `${Math.max(seconds ? 6 : 0, seconds / max * 100)}%` }}>{SUBJECTS.map(subject => { const part = byDay[date]?.[subject] ?? 0; return part ? <i key={subject} style={{ height: `${part / seconds * 100}%`, background: COLOR[subject] }} /> : null; })}</div><small>{new Date(`${date}T00:00:00`).getDate()}</small></div>; })}</div>;
}

export default function Statistics({ data }: { data: AppData }) {
  const [range, setRange] = useState<1 | 30 | 90 | 180 | 365>(1);
  const end = useMemo(() => new Date(), []); const start = useMemo(() => { const d = new Date(end); d.setDate(d.getDate() - range + 1); return d; }, [end, range]);
  const dates = useMemo(() => dateRange(start, end), [start, end]); const totals = useMemo(() => studyTotals(data.sessions), [data.sessions]);
  const total = dates.reduce((sum, date) => sum + (totals[date] ?? 0), 0); const active = dates.filter(date => totals[date] > 0); const average = active.length ? total / active.length : 0;
  const byDay = useMemo(() => Object.fromEntries(dates.map(date => [date, Object.fromEntries(SUBJECTS.map(subject => [subject, studyTotals(data.sessions.filter(s => s.subject === subject))[date] ?? 0]))])) as Record<string, Record<Subject, number>>, [data.sessions, dates]);
  const subjects = SUBJECTS.reduce((out, subject) => ({ ...out, [subject]: dates.reduce((sum, date) => sum + byDay[date][subject], 0) }), {} as Record<Subject, number>);
  const timed = data.sessions.filter((s): s is TimerSession & { startedAt: string; endedAt: string } => dates.includes(s.date) && !!s.startedAt && !!s.endedAt && Number.isFinite(Date.parse(s.startedAt)) && Number.isFinite(Date.parse(s.endedAt)));
  const startMinutes = timed.map(s => new Date(s.startedAt).getHours() * 60 + new Date(s.startedAt).getMinutes()); const endMinutes = timed.map(s => new Date(s.endedAt).getHours() * 60 + new Date(s.endedAt).getMinutes());
  const averageTime = (values: number[]) => values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
  const timeText = (value: number | null) => value === null ? '—' : `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  const longest = Math.max(0, ...data.sessions.map(s => (s.segments ?? []).filter(p => p.kind === 'focus').reduce((sum, p) => sum + Math.max(0, Date.parse(p.end) - Date.parse(p.start)), 0) / 1000), ...data.sessions.filter(s => !s.segments?.length).map(s => s.seconds));
  const monthCount = range === 1 ? 1 : Math.min(12, Math.max(1, Math.ceil(range / 30) + 1)); const months = Array.from({ length: monthCount }, (_, i) => new Date(end.getFullYear(), end.getMonth() - (monthCount - 1 - i), 1));
  const todaySessions = data.sessions.filter(session => session.date === toDateKey(end)).sort((a, b) => `${a.startedAt ?? ''}-${a.id}`.localeCompare(`${b.startedAt ?? ''}-${b.id}`));
  const latest = dates.slice(-28); const weekday = DAY.map((_, day) => { const values = active.filter(date => new Date(`${date}T00:00:00`).getDay() === day).map(date => totals[date]); return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0; }); const weekdayMax = Math.max(1, ...weekday);
  const hourCounts = Array.from({ length: 24 }, (_, hour) => timed.filter(s => new Date(s.startedAt).getHours() === hour).length); const hourMax = Math.max(1, ...hourCounts);
  const gradient = SUBJECTS.map((subject, index) => { const before = SUBJECTS.slice(0, index).reduce((sum, item) => sum + subjects[item], 0); return `${COLOR[subject]} ${before / Math.max(total, 1) * 100}% ${(before + subjects[subject]) / Math.max(total, 1) * 100}%`; }).join(',');

  return <div className="insight-page"><PageHeader eyebrow="STATISTICS" title="통계" description="순공 시간의 흐름과 과목 배분을 간결하게 확인합니다." />
    <div className="insight-tabs" role="tablist">{([{ label: '오늘', value: 1 }, { label: '30일', value: 30 }, { label: '3개월', value: 90 }, { label: '6개월', value: 180 }, { label: '12개월', value: 365 }] as const).map(item => <button key={item.value} className={range === item.value ? 'active' : ''} onClick={() => setRange(item.value)}>{item.label}</button>)}</div>
    <div className="insight-summary"><Card className="insight-total"><span>총 학습 시간</span><strong>{compact(total)}</strong><small>{start.toLocaleDateString('ko-KR')} ~ {end.toLocaleDateString('ko-KR')}</small></Card><Card><span>학습한 날 평균</span><strong>{compact(average)}</strong><small>{active.length}일 기록 기준</small></Card><Card><span>최장 연속 집중</span><strong>{compact(longest)}</strong><small>타이머 집중 구간 기준</small></Card></div>
    <div className="insight-layout"><Card className="insight-calendar-card"><SectionTitle title={range === 1 ? '오늘의 달력' : '학습량 캘린더'} meta={range === 1 ? '색과 시간은 오늘까지의 기록입니다.' : `${active.length}일 학습`} /><div className="insight-months">{months.map(month => <MonthHeatmap key={monthKey(month)} month={month} totals={totals} />)}</div></Card><div className="insight-right"><Card><SectionTitle title="과목 비율" meta={compact(total)} />{total ? <div className="insight-subjects"><div className="insight-donut" style={{ background: `conic-gradient(${gradient})` }}><b>{Math.round(total / 3600)}<small>시간</small></b></div><div>{SUBJECTS.map(subject => <p key={subject}><i style={{ background: COLOR[subject] }} /><span>{subject}</span><b>{compact(subjects[subject])}</b><small>{Math.round(subjects[subject] / total * 100)}%</small></p>)}</div></div> : <Empty>선택한 기간의 타이머 기록이 없습니다.</Empty>}</Card>{range === 1 ? <Card><SectionTitle title="오늘의 측정 기록" meta={`${todaySessions.length}회`} />{todaySessions.length ? <div className="insight-session-list">{todaySessions.map(session => <div key={session.id}><i style={{ background: COLOR[session.subject] }} /><b>{session.subject}</b><span>{session.startedAt ? new Date(session.startedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '수동 입력'}</span><strong>{compact(session.seconds)}</strong></div>)}</div> : <Empty>오늘 저장한 타이머 기록이 없습니다.</Empty>}</Card> : <Card><SectionTitle title="일별 과목 시간" meta="최근 28일" /><DailyBars dates={latest} totals={totals} byDay={byDay} /></Card>}<Card><SectionTitle title={range === 1 ? '오늘의 시작·종료' : '일별 시작·종료'} meta="시각이 있는 타이머 기록만 반영" /><div className="insight-time-points"><div><Clock3 /><span>{range === 1 ? '첫 시작' : '평균 시작'}</span><b>{timeText(range === 1 ? (startMinutes.length ? Math.min(...startMinutes) : null) : averageTime(startMinutes))}</b></div><div><Timer /><span>{range === 1 ? '마지막 종료' : '평균 종료'}</span><b>{timeText(range === 1 ? (endMinutes.length ? Math.max(...endMinutes) : null) : averageTime(endMinutes))}</b></div><div><TrendingUp /><span>기록 세션</span><b>{timed.length}회</b></div></div></Card></div></div>
    <div className="insight-bottom"><Card><SectionTitle title="요일별 평균 학습 시간" meta="학습한 날짜 기준" /><div className="insight-week-bars">{weekday.map((seconds, index) => <div key={DAY[index]}><b>{compact(seconds)}</b><i style={{ height: `${seconds / weekdayMax * 100}%` }} /><span>{DAY[index]}</span></div>)}</div></Card><Card><SectionTitle title="학습 시작 시간대" meta="시각이 있는 타이머 기록만 반영" />{timed.length ? <div className="insight-hours">{hourCounts.map((count, hour) => <div key={hour}><i style={{ height: `${count / hourMax * 100}%` }} /><small>{hour}</small></div>)}</div> : <Empty>타이머를 시작·정지하면 시간대 통계가 표시됩니다.</Empty>}</Card></div>
  </div>;
}
