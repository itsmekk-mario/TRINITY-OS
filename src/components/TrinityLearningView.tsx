import { BarChart3, ClipboardPenLine, Clock3, Crosshair, Gauge, ListTodo } from 'lucide-react';
import type { AppData, Subject } from '../types';
import { Card, Empty, PageHeader, Progress, SectionTitle } from './Ui';

export type ViewerMode = 'student' | 'subject_teacher' | 'academic_manager';
export type FeedbackTarget = {
  type: 'general' | 'mock_exam' | 'wrong_answer' | 'weekly_goal' | 'subject_progress';
  targetId?: string;
  title: string;
};

type LearningData = Pick<AppData, 'sessions' | 'scores' | 'wrongAnswerDrills' | 'weeklyCapabilityGoals' | 'dailyDrills' | 'resources'>;

const formatTime = (seconds: number) => `${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
const scoreFor = (item: AppData['scores'][number], subject?: string) => {
  if (subject === '수학') return item.math;
  if (subject === '국어') return item.korean;
  if (subject === '영어') return item.english;
  return item.math ?? item.korean ?? item.english;
};

export default function TrinityLearningView({ data, viewer, focusSubject, onFeedback, name = 'Student' }: {
  data: LearningData;
  viewer: ViewerMode;
  focusSubject?: string;
  onFeedback?: (target: FeedbackTarget) => void;
  name?: string;
}) {
  const readOnly = viewer !== 'student';
  const scoped = <T extends { subject?: string }>(items: T[]) => focusSubject ? items.filter((item) => item.subject === focusSubject) : items;
  const sessions = scoped(data.sessions);
  const scores = scoped(data.scores);
  const wrongAnswers = scoped(data.wrongAnswerDrills);
  const goals = scoped(data.weeklyCapabilityGoals);
  const drills = scoped(data.dailyDrills);
  const resources = scoped(data.resources);
  const totalSeconds = sessions.reduce((sum, item) => sum + item.seconds, 0);
  const completedDrills = drills.filter((item) => item.done).length;
  const subjects = [...new Set(sessions.map((item) => item.subject))] as Subject[];
  const latestScore = scores.length ? scoreFor(scores[scores.length - 1], focusSubject) : undefined;

  return <div className="trinity-view">
    <PageHeader eyebrow={readOnly ? 'STUDENT LEARNING STATUS' : 'LEARNING OVERVIEW'} title={readOnly ? `${name}'s TRINITY` : 'Learning overview'} description={readOnly ? `${focusSubject ?? 'All subjects'} · Teacher View` : 'Your learning progress at a glance.'} />
    <div className="execution-metrics">
      <Card><span className="metric-icon"><Clock3 size={19} /></span><span className="card-label">THIS WEEK</span><strong className="metric-value">{formatTime(totalSeconds)}</strong><Progress value={totalSeconds / 60} max={3000} /></Card>
      <Card><span className="metric-icon"><ListTodo size={19} /></span><span className="card-label">DAILY DRILL</span><strong className="metric-value">{completedDrills} / {drills.length}</strong><Progress value={completedDrills} max={Math.max(drills.length, 1)} /></Card>
      <Card><span className="metric-icon"><Gauge size={19} /></span><span className="card-label">LATEST SCORE</span><strong className="metric-value">{scores.length ? `${latestScore ?? '-'} pts` : '-'}</strong><small>{scores.length ? scores[scores.length - 1].name : 'No record yet'}</small></Card>
    </div>
    <SectionTitle title="Subject progress" meta={focusSubject ?? 'This week'} />
    <div className="goal-grid">{subjects.length ? subjects.map((subject) => { const seconds = sessions.filter((item) => item.subject === subject).reduce((sum, item) => sum + item.seconds, 0); return <Card className="goal-card" key={subject}><span className={`subject-badge ${subject}`}>{subject}</span><strong className="metric-value">{formatTime(seconds)}</strong><Progress value={seconds / 60} max={900} /></Card>; }) : <Empty>No learning data has been recorded this week.</Empty>}</div>
    <div className="trinity-view-grid">
      <Card><div className="execution-card-head"><div><span className="card-label">MOCK EXAMS</span><h2>Recent scores</h2></div><BarChart3 size={18} /></div>{scores.length ? scores.slice(-5).reverse().map((item) => <div className="score-row" key={item.id}><div className="score-main"><h3>{item.name}</h3><p>{item.date} · {item.subject}</p></div><b>{scoreFor(item, focusSubject) ?? '-'} pts</b>{readOnly && onFeedback && <button className="text-button" onClick={() => onFeedback({ type: 'mock_exam', targetId: item.id, title: item.name })}>Leave feedback</button>}</div>) : <Empty>No mock exam records yet.</Empty>}</Card>
      <Card><div className="execution-card-head"><div><span className="card-label">WRONG ANSWERS</span><h2>Recent correction drills</h2></div><Crosshair size={18} /></div>{wrongAnswers.length ? wrongAnswers.slice(-5).reverse().map((item) => <article className="drill-record" key={item.id}><span className={`subject-badge ${item.subject}`}>{item.subject}</span><h3>{item.question || item.source}</h3><div className="drill-chain"><div><b>Wrong judgment</b><p>{item.wrongJudgment}</p></div><div><b>Correction</b><p>{item.correction || 'Not recorded'}</p></div></div>{readOnly && onFeedback && <button className="text-button" onClick={() => onFeedback({ type: 'wrong_answer', targetId: item.id, title: item.question || item.source })}><ClipboardPenLine size={14} /> Feedback on this item</button>}</article>) : <Empty>No wrong-answer records yet.</Empty>}</Card>
    </div>
    <div className="trinity-view-grid">
      <Card><SectionTitle title="Weekly goals" />{goals.length ? goals.slice(-4).reverse().map((item) => <div className="collab-row" key={item.id}><span><b>{item.ability}</b><small>{item.successCriterion}</small></span><b>{item.done ? 'Done' : 'In progress'}</b>{readOnly && onFeedback && <button className="text-button" onClick={() => onFeedback({ type: 'weekly_goal', targetId: item.id, title: item.ability })}>Feedback</button>}</div>) : <Empty>No weekly goals yet.</Empty>}</Card>
      <Card><SectionTitle title="Resource progress" />{resources.length ? resources.slice(0, 6).map((item) => <div className="collab-row" key={item.id}><span>{item.name}</span><b>{item.done} / {item.total}</b></div>) : <Empty>No resource progress yet.</Empty>}</Card>
    </div>
    {readOnly && onFeedback && <div className="teacher-view-feedback"><button className="button primary" onClick={() => onFeedback({ type: 'subject_progress', title: focusSubject ? `${focusSubject} weekly progress` : 'Weekly learning progress' })}><ClipboardPenLine size={16} /> Leave feedback on this week</button></div>}
  </div>;
}
