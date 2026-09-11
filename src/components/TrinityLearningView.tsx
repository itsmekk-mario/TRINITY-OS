import { useState } from 'react';
import { BarChart3, ClipboardPenLine, Clock3, Crosshair, Gauge, ListTodo } from 'lucide-react';
import type { AppData, Subject } from '../types';
import { Card, Empty, PageHeader, Progress, SectionTitle } from './Ui';

export type ViewerMode = 'student' | 'subject_teacher' | 'academic_manager';
export type FeedbackTarget = { type: 'general' | 'mock_exam' | 'wrong_answer' | 'weekly_goal' | 'subject_progress'; targetId?: string; title: string };
type LearningData = Pick<AppData, 'sessions' | 'scores' | 'wrongAnswerDrills' | 'weeklyCapabilityGoals' | 'dailyDrills' | 'resources'>;
type ViewTab = 'overview' | 'scores' | 'wrongAnswers' | 'goals' | 'resources';

const formatTime = (seconds: number) => `${Math.floor(seconds / 3600)}시간 ${Math.round((seconds % 3600) / 60)}분`;
const scoreFor = (item: AppData['scores'][number], subject?: string) => {
  if (subject === '수학') return item.math;
  if (subject === '국어') return item.korean;
  if (subject === '영어') return item.english;
  return item.math ?? item.korean ?? item.english;
};

export default function TrinityLearningView({ data, viewer, focusSubject, onFeedback, name = '학생' }: { data: LearningData; viewer: ViewerMode; focusSubject?: string; onFeedback?: (target: FeedbackTarget) => void; name?: string }) {
  const [tab, setTab] = useState<ViewTab>('overview');
  const readOnly = viewer !== 'student';
  const scoped = <T extends { subject?: string }>(items: T[]) => focusSubject ? items.filter((item) => item.subject === focusSubject) : items;
  const sessions = scoped(data.sessions), scores = scoped(data.scores), wrongAnswers = scoped(data.wrongAnswerDrills), goals = scoped(data.weeklyCapabilityGoals), drills = scoped(data.dailyDrills), resources = scoped(data.resources);
  const totalSeconds = sessions.reduce((sum, item) => sum + item.seconds, 0);
  const completedDrills = drills.filter((item) => item.done).length;
  const subjects = [...new Set(sessions.map((item) => item.subject))] as Subject[];
  const latestScore = scores.length ? scoreFor(scores[scores.length - 1], focusSubject) : undefined;
  const tabs: { id: ViewTab; label: string; count?: number }[] = [{ id: 'overview', label: '개요' }, { id: 'scores', label: '실모 · 성적', count: scores.length }, { id: 'wrongAnswers', label: '오답 분석', count: wrongAnswers.length }, { id: 'goals', label: '목표 · Drill', count: goals.length + drills.length }, { id: 'resources', label: '교재', count: resources.length }];

  const feedback = (target: FeedbackTarget, label: string) => readOnly && onFeedback ? <button className="text-button" onClick={() => onFeedback(target)}><ClipboardPenLine size={14} /> {label}</button> : null;
  const overview = <>
    <div className="execution-metrics">
      <Card><span className="metric-icon"><Clock3 size={19} /></span><span className="card-label">이번 주 학습</span><strong className="metric-value">{formatTime(totalSeconds)}</strong><Progress value={totalSeconds / 60} max={3000} /></Card>
      <Card><span className="metric-icon"><ListTodo size={19} /></span><span className="card-label">Daily Drill</span><strong className="metric-value">{completedDrills} / {drills.length}</strong><Progress value={completedDrills} max={Math.max(drills.length, 1)} /></Card>
      <Card><span className="metric-icon"><Gauge size={19} /></span><span className="card-label">최근 성적</span><strong className="metric-value">{scores.length ? `${latestScore ?? '-'}점` : '-'}</strong><small>{scores.length ? scores[scores.length - 1].name : '기록 없음'}</small></Card>
    </div>
    <SectionTitle title="과목별 현황" meta={focusSubject ?? '이번 주'} />
    <div className="goal-grid">{subjects.length ? subjects.map((subject) => { const seconds = sessions.filter((item) => item.subject === subject).reduce((sum, item) => sum + item.seconds, 0); return <Card className="goal-card" key={subject}><span className={`subject-badge ${subject}`}>{subject}</span><strong className="metric-value">{formatTime(seconds)}</strong><Progress value={seconds / 60} max={900} /></Card>; }) : <Empty>이번 주 등록된 학습 데이터가 없습니다.</Empty>}</div>
    <div className="trinity-view-grid"><Card><div className="execution-card-head"><div><span className="card-label">MOCK EXAMS</span><h2>최근 실모 · 성적</h2></div><BarChart3 size={18} /></div>{scores.length ? scores.slice(-3).reverse().map((item) => <div className="score-row" key={item.id}><div className="score-main"><h3>{item.name}</h3><p>{item.date} · {item.subject}</p></div><b>{scoreFor(item, focusSubject) ?? '-'}점</b>{feedback({ type: 'mock_exam', targetId: item.id, title: item.name }, '이 실모에 피드백')}</div>) : <Empty>아직 기록된 실모가 없습니다.</Empty>}</Card><Card><div className="execution-card-head"><div><span className="card-label">WRONG ANSWERS</span><h2>최근 오답 Drill</h2></div><Crosshair size={18} /></div>{wrongAnswers.length ? wrongAnswers.slice(-3).reverse().map((item) => <article className="drill-record" key={item.id}><span className={`subject-badge ${item.subject}`}>{item.subject}</span><h3>{item.question || item.source}</h3><p>{item.bottleneck || item.missedCue || '오답 원인 미기록'}</p>{feedback({ type: 'wrong_answer', targetId: item.id, title: item.question || item.source }, '이 오답에 피드백')}</article>) : <Empty>최근 오답 기록이 없습니다.</Empty>}</Card></div>
    {readOnly && onFeedback && <div className="teacher-view-feedback"><button className="button primary" onClick={() => onFeedback({ type: 'subject_progress', title: focusSubject ? `${focusSubject} 이번 주 학습` : '이번 주 전체 학습' })}><ClipboardPenLine size={16} /> 이번 주 학습에 피드백</button></div>}
  </>;
  const scoreTab = <Card><SectionTitle title="실모 · 성적 기록" meta={`${scores.length}개`} />{scores.length ? scores.slice().reverse().map((item) => <div className="score-row score-row-detail" key={item.id}><div className="score-main"><span className={`subject-badge ${item.subject}`}>{item.subject}</span><h3>{item.name}</h3><p>{item.date} · {item.duration ? `${item.duration}분` : '시간 기록 없음'}</p>{item.errorType && <small>주요 원인: {item.errorType}</small>}</div><b>{scoreFor(item, focusSubject) ?? '-'}점</b>{feedback({ type: 'mock_exam', targetId: item.id, title: item.name }, '피드백 작성')}</div>) : <Empty>아직 기록된 실모가 없습니다.</Empty>}</Card>;
  const wrongTab = <Card><SectionTitle title="오답 분석" meta={`${wrongAnswers.length}개`} />{wrongAnswers.length ? wrongAnswers.slice().reverse().map((item) => <article className="drill-record drill-record-detail" key={item.id}><span className={`subject-badge ${item.subject}`}>{item.subject}</span><h3>{item.question || item.source}</h3><small>{item.date} · {item.source}</small><div className="drill-chain"><div><b>잘못된 판단</b><p>{item.wrongJudgment || '미기록'}</p></div><div><b>놓친 단서</b><p>{item.missedCue || '미기록'}</p></div><div><b>교정</b><p>{item.correction || '미기록'}</p></div><div><b>전이 행동</b><p>{item.transfer || '미기록'}</p></div></div>{feedback({ type: 'wrong_answer', targetId: item.id, title: item.question || item.source }, '이 오답에 피드백')}</article>) : <Empty>최근 오답 기록이 없습니다.</Empty>}</Card>;
  const goalsTab = <div className="trinity-view-grid"><Card><SectionTitle title="Weekly Capability Goal" meta={`${goals.length}개`} />{goals.length ? goals.slice().reverse().map((item) => <div className="goal-detail" key={item.id}><span className={`subject-badge ${item.subject}`}>{item.subject}</span><h3>{item.ability}</h3><p><b>성공 기준</b> {item.successCriterion}</p><p><b>Drill 설계</b> {item.drillDesign}</p><b>{item.done ? '완료' : '진행 중'}</b>{feedback({ type: 'weekly_goal', targetId: item.id, title: item.ability }, '이 목표에 피드백')}</div>) : <Empty>등록된 Weekly Goal이 없습니다.</Empty>}</Card><Card><SectionTitle title="Daily Drill 수행" meta={`${completedDrills} / ${drills.length}`} />{drills.length ? drills.slice().reverse().map((item) => <div className="goal-detail" key={item.id}><span className={`subject-badge ${item.subject}`}>{item.subject}</span><h3>{item.title}</h3><p>{item.action}</p><small>{item.date} · {item.minutes}분 · {item.done ? '완료' : '미완료'}</small></div>) : <Empty>등록된 Daily Drill이 없습니다.</Empty>}</Card></div>;
  const resourcesTab = <Card><SectionTitle title="교재 진행률" meta={`${resources.length}개 교재`} />{resources.length ? <div className="resource-detail-grid">{resources.map((item) => <article className="resource-detail" key={item.id}><span className={`subject-badge ${item.subject}`}>{item.subject}</span><h3>{item.name}</h3><p>{item.group}</p><div><b>{item.done} / {item.total}</b><Progress value={item.done} max={Math.max(item.total, 1)} /></div></article>)}</div> : <Empty>등록된 교재 진행률이 없습니다.</Empty>}</Card>;
  const content = tab === 'overview' ? overview : tab === 'scores' ? scoreTab : tab === 'wrongAnswers' ? wrongTab : tab === 'goals' ? goalsTab : resourcesTab;

  return <div className="trinity-view"><PageHeader eyebrow={readOnly ? '학생 학습 현황' : '학습 현황'} title={readOnly ? `${name}의 TRINITY` : '나의 TRINITY'} description={readOnly ? `${focusSubject ?? '전체 과목'} · Teacher View` : '학습 현황을 확인하세요.'} /><nav className="trinity-view-tabs" aria-label="학습 현황 탭">{tabs.map((item) => <button className={tab === item.id ? 'active' : ''} key={item.id} onClick={() => setTab(item.id)}>{item.label}{item.count !== undefined && <small>{item.count}</small>}</button>)}</nav>{content}</div>;
}
