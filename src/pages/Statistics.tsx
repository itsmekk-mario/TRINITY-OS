import { useMemo, useState } from 'react';
import { CalendarDays, Flame, Timer, TrendingUp } from 'lucide-react';
import type { AppData, Subject } from '../types';
import { SUBJECTS, ERROR_TYPES } from '../data/config';
import { Card, Empty, PageHeader, Progress, SectionTitle } from '../components/Ui';
import { formatMinutes, toDateKey, weekStartKey } from '../lib/date';

const colors: Record<Subject, string> = { 국어: '#637da4', 수학: '#c9a75d', 영어: '#5d927d', 탐구: '#9473a5' };
const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토'];
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const formatCompact = (seconds: number) => { const minutes = Math.round(seconds / 60); const hours = Math.floor(minutes / 60); const rest = minutes % 60; return hours ? `${hours}시간${rest ? ` ${rest}분` : ''}` : `${rest}분`; };

export default function Statistics({ data }: { data: AppData }) {
  const [selectedMonth, setSelectedMonth] = useState(monthKey(new Date()));
  const now = new Date();
  const weekStart = weekStartKey(now);
  const weekDays = Array.from({ length: 7 }, (_, index) => { const date = new Date(`${weekStart}T00:00:00`); date.setDate(date.getDate() + index); return toDateKey(date); });
  const monthDate = new Date(`${selectedMonth}-01T00:00:00`);
  const monthDays = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const monthDates = Array.from({ length: monthDays }, (_, index) => `${selectedMonth}-${String(index + 1).padStart(2, '0')}`);
  const sessionsByDate = useMemo(() => data.sessions.reduce<Record<string, number>>((result, session) => ({ ...result, [session.date]: (result[session.date] ?? 0) + session.seconds }), {}), [data.sessions]);
  const weeklyDaily = weekDays.map((date) => (sessionsByDate[date] ?? 0) / 3600);
  const weeklyMax = Math.max(...weeklyDaily, 1);
  const monthDaily = monthDates.map((date) => sessionsByDate[date] ?? 0);
  const monthTotal = monthDaily.reduce((sum, seconds) => sum + seconds, 0);
  const activeDays = monthDaily.filter(Boolean).length;
  const activeAverage = activeDays ? monthTotal / activeDays : 0;
  const monthMax = Math.max(...monthDaily, 1);
  const currentStreak = useMemo(() => { let count = 0; const cursor = new Date(); while (sessionsByDate[toDateKey(cursor)] > 0) { count += 1; cursor.setDate(cursor.getDate() - 1); } return count; }, [sessionsByDate]);
  const monthSubjectTotals = Object.fromEntries(SUBJECTS.map((subject) => [subject, data.sessions.filter((session) => session.date.startsWith(selectedMonth) && session.subject === subject).reduce((sum, session) => sum + session.seconds, 0)])) as Record<Subject, number>;
  const subjectTotal = Object.values(monthSubjectTotals).reduce((sum, seconds) => sum + seconds, 0);
  const monthTrend = Array.from({ length: 6 }, (_, reverseIndex) => { const date = new Date(monthDate.getFullYear(), monthDate.getMonth() - (5 - reverseIndex), 1); const key = monthKey(date); return { key, label: `${date.getMonth() + 1}월`, seconds: data.sessions.filter((session) => session.date.startsWith(key)).reduce((sum, session) => sum + session.seconds, 0) }; });
  const trendMax = Math.max(...monthTrend.map((item) => item.seconds), 1);
  const weekdayAverages = useMemo(() => Array.from({ length: 7 }, (_, weekday) => { const dates = Object.entries(sessionsByDate).filter(([date, seconds]) => new Date(`${date}T00:00:00`).getDay() === weekday && seconds > 0); return dates.length ? dates.reduce((sum, [, seconds]) => sum + seconds, 0) / dates.length : 0; }), [sessionsByDate]);
  const weekdayMax = Math.max(...weekdayAverages, 1);
  const errors = ERROR_TYPES.map((type) => ({ type, count: data.scores.filter((score) => score.errorType === type).length })).sort((a, b) => b.count - a.count);
  const maxError = Math.max(...errors.map((error) => error.count), 1);
  const latestPlaire = Object.values(data.plaire).sort((a, b) => b.date.localeCompare(a.date))[0];
  const scores = [...data.scores].reverse().slice(-8);
  const firstOffset = new Date(`${selectedMonth}-01T00:00:00`).getDay();
  const conic = SUBJECTS.map((subject, index) => { const before = SUBJECTS.slice(0, index).reduce((sum, item) => sum + monthSubjectTotals[item] / Math.max(subjectTotal, 1) * 100, 0); const after = before + monthSubjectTotals[subject] / Math.max(subjectTotal, 1) * 100; return `${colors[subject]} ${before}% ${after}%`; }).join(',');

  return <div><PageHeader eyebrow="STATISTICS" title="학습 시스템 계기판" description="월별 총량, 학습 규칙성, 과목 배분과 성과를 함께 보며 다음 운영 결정을 내립니다." action={<input className="date-input stats-month-input" type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />} />
    <div className="statistics-metrics"><Card><CalendarDays size={18} /><span className="card-label">월간 총 학습량</span><strong>{formatCompact(monthTotal)}</strong><small>{selectedMonth.replace('-', '.')} · {activeDays}일 학습</small></Card><Card><Timer size={18} /><span className="card-label">공부한 날 평균</span><strong>{formatCompact(activeAverage)}</strong><small>기록이 있는 날짜 기준</small></Card><Card><Flame size={18} /><span className="card-label">현재 연속 학습</span><strong>{currentStreak}일</strong><small>오늘부터 이어진 타이머 기록</small></Card><Card><TrendingUp size={18} /><span className="card-label">최근 월 변화</span><strong>{monthTrend.length > 1 ? `${monthTrend.at(-1)!.seconds - monthTrend.at(-2)!.seconds >= 0 ? '+' : ''}${Math.round((monthTrend.at(-1)!.seconds - monthTrend.at(-2)!.seconds) / 3600)}시간` : '—'}</strong><small>직전 달 대비</small></Card></div>
    <div className="stats-grid statistics-primary"><Card className="monthly-heatmap-card"><SectionTitle title="월별 학습량" meta={`${activeDays} / ${monthDays}일`}/><div className="heatmap-weekdays">{weekdayLabels.map((label) => <span key={label}>{label}</span>)}</div><div className="monthly-heatmap">{Array.from({ length: firstOffset }, (_, index) => <i key={`empty-${index}`} />)}{monthDates.map((date, index) => { const seconds = monthDaily[index]; const intensity = seconds ? .16 + .84 * seconds / monthMax : 0; return <div key={date} className={seconds ? 'studied' : ''} style={seconds ? { background: `rgba(198,164,90,${intensity})` } : undefined}><b>{index + 1}</b>{seconds > 0 && <small>{formatCompact(seconds)}</small>}</div>; })}</div></Card>
      <Card><SectionTitle title="과목 비율" meta={selectedMonth.replace('-', '.')}/>{subjectTotal ? <div className="donut-wrap"><div className="donut" style={{ background: `conic-gradient(${conic})` }}><span><b>{Math.round(subjectTotal / 3600)}</b>h</span></div><div className="legend">{SUBJECTS.map((subject) => <div key={subject}><i style={{ background: colors[subject] }} /><span>{subject}</span><b>{formatMinutes(monthSubjectTotals[subject] / 60)}</b></div>)}</div></div> : <Empty>선택한 달의 타이머 기록이 없습니다.</Empty>}</Card></div>
    <div className="stats-grid"><Card className="monthly-trend-card"><SectionTitle title="최근 6개월 학습량" meta="월별 총 순공"/><div className="month-bars">{monthTrend.map((item) => <div key={item.key}><span style={{ height: `${Math.max(item.seconds ? 6 : 0, item.seconds / trendMax * 100)}%` }}><b>{item.seconds ? Math.round(item.seconds / 3600) : ''}</b></span><small>{item.label}</small></div>)}</div></Card><Card><SectionTitle title="요일별 평균 학습량" meta="전체 기록 기준"/><div className="weekday-bars">{weekdayAverages.map((seconds, index) => <div key={weekdayLabels[index]}><span>{weekdayLabels[index]}</span><div><i style={{ width: `${seconds / weekdayMax * 100}%` }} /></div><b>{seconds ? formatCompact(seconds) : '—'}</b></div>)}</div></Card></div>
    <div className="stats-grid"><Card className="chart-card"><SectionTitle title="이번 주 학습량" meta={formatMinutes(weeklyDaily.reduce((sum, hours) => sum + hours, 0) * 60)}/><div className="bar-chart">{weeklyDaily.map((value, index) => <div key={weekDays[index]}><span style={{ height: `${Math.max(value ? 3 : 0, value / weeklyMax * 100)}%` }}><b>{value ? value.toFixed(1) : ''}</b></span><small>{['월', '화', '수', '목', '금', '토', '일'][index]}</small></div>)}</div></Card><Card><SectionTitle title="Plaire 단계" meta={latestPlaire?.date ?? '기록 없음'}/>{latestPlaire ? <div className="plaire-levels"><Progress label="기준" value={latestPlaire.levels.criterion} max={10}/><Progress label="몰입" value={latestPlaire.levels.immersion} max={10}/><Progress label="체화" value={latestPlaire.levels.embodiment} max={10}/></div> : <Empty>Plaire Review에서 단계를 기록하세요.</Empty>}</Card></div>
    <div className="stats-grid"><Card><SectionTitle title="오답 유형 빈도" meta={`${data.scores.length}개 시험`}/><div className="error-bars">{errors.map((error) => <div key={error.type}><span>{error.type}</span><div><i style={{ width: `${error.count / maxError * 100}%` }} /></div><b>{error.count}</b></div>)}</div></Card><Card className="score-chart"><SectionTitle title="실모 점수 변화" meta="최근 8회"/>{scores.length ? <div className="score-table"><div className="score-table-head"><span>시험</span><span>국어</span><span>수학</span><span>영어</span></div>{scores.map((score) => <div key={score.id}><span>{score.name}<small>{score.date}</small></span><b>{score.korean ?? '—'}</b><b>{score.math ?? '—'}</b><b>{score.english ?? '—'}</b></div>)}</div> : <Empty>점수 기록이 쌓이면 변화가 표시됩니다.</Empty>}</Card></div>
  </div>;
}
