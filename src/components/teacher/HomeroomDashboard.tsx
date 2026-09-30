import { useMemo, useState } from 'react';
import { Card, Empty } from '../Ui';
import type { TeacherData, DateRange } from '../../lib/teacherAnalytics';
import { inRange, weekInRange } from '../../lib/teacherAnalytics';

const colors = ['#5277bd', '#df9658', '#53a486', '#9472b9', '#d46b72', '#58a6b7', '#c3a548', '#78899d'];
const hours = (seconds: number) => `${Math.floor(seconds / 3600)}시간 ${Math.floor(seconds % 3600 / 60)}분`;
export default function HomeroomDashboard({ data, range }: { data: TeacherData; range: DateRange }) {
  const [subject, setSubject] = useState('전체 과목');
  const subjects = useMemo(() => [...new Set([...data.sessions.map(item => item.subject), ...data.plans.map(item => item.subject)])].sort(), [data.sessions, data.plans]);
  const sessions = data.sessions.filter(item => inRange(item.date, range) && (subject === '전체 과목' || item.subject === subject));
  const plans = data.plans.filter(item => inRange(item.date, range) && (subject === '전체 과목' || item.subject === subject));
  const totalSeconds = sessions.reduce((total, item) => total + item.seconds, 0);
  const subjectSeconds = new Map<string, number>();
  sessions.forEach(item => subjectSeconds.set(item.subject, (subjectSeconds.get(item.subject) ?? 0) + item.seconds));
  const distribution = [...subjectSeconds.entries()].sort((a, b) => b[1] - a[1]);
  const totalBySubject = distribution.reduce((total, [, seconds]) => total + seconds, 0);
  let start = 0;
  const gradient = distribution.map(([name, seconds], index) => { const end = start + seconds / Math.max(totalBySubject, 1) * 100; const segment = `${colors[index % colors.length]} ${start}% ${end}%`; start = end; return segment; }).join(', ');
  const weeklyGoals = data.weeklyCapabilityGoals.filter(item => weekInRange(item.weekStart, range) && (subject === '전체 과목' || item.subject === subject));
  const monthlyGoals = (data.monthlyPlans ?? []).filter(item => { const startOfMonth = `${item.month}-01`; const end = new Date(`${startOfMonth}T12:00:00`); end.setMonth(end.getMonth() + 1); end.setDate(0); const monthEnd = end.toLocaleDateString('sv-SE'); return startOfMonth <= range.end && monthEnd >= range.start && (subject === '전체 과목' || item.subject === subject); });
  const scores = data.scores.filter(item => inRange(item.date, range) && (subject === '전체 과목' || item.subject === subject || !item.subject)).sort((a, b) => b.date.localeCompare(a.date));
  const completed = plans.filter(item => item.done).length;
  return <div className="homeroom-dashboard">
    <div className="homeroom-subject-filter"><label>학습 선택<select value={subject} onChange={event => setSubject(event.target.value)}><option>전체 과목</option>{subjects.map(item => <option key={item}>{item}</option>)}</select></label></div>
    <section className="homeroom-summary">
      <Card className="homeroom-study-card"><div className="homeroom-card-heading"><div><span className="card-label">STUDY BALANCE</span><h2>과목별 공부 비중</h2></div><small>{range.start} — {range.end}</small></div>{totalBySubject ? <div className="homeroom-subject-chart"><div className="homeroom-donut" style={{ background: `conic-gradient(${gradient})` }}><div><b>{Math.round(totalSeconds / 3600 * 10) / 10}</b><small>시간</small></div></div><div className="homeroom-subject-legend">{distribution.map(([name, seconds], index) => <div key={name}><i style={{ background: colors[index % colors.length] }}/><span>{name}</span><b>{Math.round(seconds / totalBySubject * 100)}%</b><small>{hours(seconds)}</small></div>)}</div></div> : <Empty>선택한 기간에 학습 시간 기록이 없습니다.</Empty>}</Card>
      <Card className="homeroom-kpi-card"><span className="card-label">LEARNING OVERVIEW</span><div className="homeroom-total-time"><small>총 공부 시간</small><strong>{hours(totalSeconds)}</strong></div><div className="homeroom-plan-counts"><div><small>계획</small><b>{plans.length}</b></div><div className="complete"><small>완료한 계획</small><b>{completed}</b></div><div className="incomplete"><small>미완료 계획</small><b>{plans.length - completed}</b></div></div></Card>
    </section>
    <section className="homeroom-record-grid">
      <Card><div className="homeroom-card-heading"><div><span className="card-label">WEEKLY GOAL</span><h2>Weekly goal</h2></div><b>{weeklyGoals.filter(item => item.done).length}/{weeklyGoals.length}</b></div>{weeklyGoals.length ? weeklyGoals.map(item => <article className="homeroom-record" key={item.id}><span className={`subject-badge ${item.subject}`}>{item.subject}</span><b>{item.ability}</b><small>{item.weekStart} · {item.done ? '완료' : '진행 중'}</small></article>) : <Empty>선택한 기간에 Weekly goal이 없습니다.</Empty>}</Card>
      <Card><div className="homeroom-card-heading"><div><span className="card-label">MONTHLY GOAL</span><h2>Monthly goal</h2></div><b>{monthlyGoals.filter(item => item.done).length}/{monthlyGoals.length}</b></div>{monthlyGoals.length ? monthlyGoals.map(item => <article className="homeroom-record" key={item.id}><span className={`subject-badge ${item.subject}`}>{item.subject}</span><b>{item.title}</b><small>{item.month} · {item.done ? '완료' : '진행 중'}</small></article>) : <Empty>선택한 기간에 Monthly goal이 없습니다.</Empty>}</Card>
      <Card className="homeroom-exams"><div className="homeroom-card-heading"><div><span className="card-label">MOCK EXAMS</span><h2>실모 기록</h2></div><b>{scores.length}</b></div>{scores.length ? scores.slice(0, 8).map(item => <article className="homeroom-record homeroom-score" key={item.id}><b>{item.name || '실전 모의고사'}</b><small>{item.date}</small><span>{item.korean !== undefined && `국어 ${item.korean}`} {item.math !== undefined && `수학 ${item.math}`} {item.english !== undefined && `영어 ${item.english}`} {item.score !== undefined && `${item.subject ?? ''} ${item.score}점`}</span></article>) : <Empty>선택한 기간에 실모 기록이 없습니다.</Empty>}</Card>
    </section>
  </div>;
}
