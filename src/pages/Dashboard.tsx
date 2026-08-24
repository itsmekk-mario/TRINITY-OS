import { useState } from 'react';
import { ArrowRight, Clock3, Plus, Target, Trash2 } from 'lucide-react';
import { SUBJECTS } from '../data/config';
import type { AppData, Subject } from '../types';
import { Card, PageHeader, Progress, SectionTitle } from '../components/Ui';
import { formatKoreanDate, formatMinutes, toDateKey, uid, weekStartKey } from '../lib/date';

export default function Dashboard({ data, update, navigate }: { data: AppData; update: (fn: (value: AppData) => AppData) => void; navigate: (page: string) => void }) {
  const [goalText,setGoalText]=useState(''); const [goalSubject,setGoalSubject]=useState<Subject>('국어');
  const now = new Date();
  const dday = Math.max(0, Math.ceil((new Date(`${data.examDate}T00:00:00`).getTime() - new Date(toDateKey(now)).getTime()) / 86_400_000));
  const quote = data.quotes[Math.floor(now.getTime() / 86_400_000) % data.quotes.length] ?? '盡人事待天命';
  const today = toDateKey(now);
  const todaySeconds = data.sessions.filter((s) => s.date === today).reduce((sum, s) => sum + s.seconds, 0);
  const weekSeconds = data.sessions.filter((s) => s.date >= weekStartKey(now)).reduce((sum, s) => sum + s.seconds, 0);
  const journalComplete = Boolean(data.journals[today]?.action);
  const addGoal=()=>{if(!goalText.trim())return;update(v=>({...v,goals:[...v.goals,{id:uid(),subject:goalSubject,text:goalText.trim(),done:false}]}));setGoalText('')};
  return <div>
    <PageHeader eyebrow="PERSONAL LEARNING OPERATING SYSTEM" title="오늘의 운영판" description={formatKoreanDate(now)} />
    <div className="hero-grid">
      <Card className="dday-card"><span className="card-label">대학수학능력시험</span><strong>D-{dday}</strong><p>{data.examDate.replaceAll('-', '.')}</p></Card>
      <Card className="quote-card"><span className="gold-mark">盡</span><blockquote>“{quote}”</blockquote><p>통제 가능한 행동과 기준을 완성한다.</p></Card>
    </div>
    <div className="metric-grid">
      <Card><span className="metric-icon"><Clock3 size={19} /></span><span className="card-label">오늘 순공</span><strong className="metric-value">{formatMinutes(todaySeconds / 60)}</strong><Progress value={todaySeconds / 60} max={600} /></Card>
      <Card><span className="metric-icon"><Target size={19} /></span><span className="card-label">이번 주 누적</span><strong className="metric-value">{formatMinutes(weekSeconds / 60)}</strong><Progress value={weekSeconds / 60} max={3000} /></Card>
      <Card className="action-card"><span className="card-label">운영 체크</span><strong>{journalComplete ? '오늘의 수정 행동 설정 완료' : '오늘의 수정 행동이 비어 있습니다'}</strong><button className="text-button" onClick={() => navigate('journal')}>저널 열기 <ArrowRight size={15} /></button></Card>
    </div>
    <SectionTitle title="이번 주 목표" meta="앱에서 직접 편집" />
    <div className="goal-grid">{SUBJECTS.map(subject=><Card key={subject} className="goal-card"><div className={`subject-dot ${subject}`}/><h3>{subject}</h3><ul>{data.goals.filter(g=>g.subject===subject).map(goal=><li key={goal.id} className={goal.done?'done':''}><button className="goal-check" onClick={()=>update(v=>({...v,goals:v.goals.map(g=>g.id===goal.id?{...g,done:!g.done}:g)}))}>{goal.done?'✓':'○'}</button><span>{goal.text}</span><button className="goal-delete" onClick={()=>update(v=>({...v,goals:v.goals.filter(g=>g.id!==goal.id)}))}><Trash2 size={13}/></button></li>)}</ul></Card>)}</div>
    <Card className="quick-add"><select value={goalSubject} onChange={(e)=>setGoalSubject(e.target.value as Subject)}>{SUBJECTS.map(s=><option key={s}>{s}</option>)}</select><input value={goalText} onChange={(e)=>setGoalText(e.target.value)} placeholder="이번 주 목표를 추가하세요" onKeyDown={(e)=>e.key==='Enter'&&addGoal()}/><button className="button primary" onClick={addGoal}><Plus size={16}/> 추가</button></Card>
    <Card className="cycle-card"><span>PLAN</span><i /><span>EXECUTE</span><i /><span>RECORD</span><i /><span>ANALYZE</span><i /><span>ADJUST</span><i /><b>EMBODY</b></Card>
  </div>;
}
