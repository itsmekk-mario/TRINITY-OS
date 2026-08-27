import { useMemo, useState } from 'react';
import { Plus, Trash2, TrendingUp, X } from 'lucide-react';
import type { AppData, ScoreEntry, Subject } from '../types';
import { ERROR_TYPES, SUBJECTS } from '../data/config';
import { Card, Empty, Field, PageHeader, SaveButton, TextArea } from '../components/Ui';
import { toDateKey, uid } from '../lib/date';

const SCORE_SUBJECTS: Array<Exclude<Subject, '탐구'>> = ['국어', '수학', '영어'];
const scoreKey = { 국어: 'korean', 수학: 'math', 영어: 'english' } as const;
const blank = (): ScoreEntry => ({ id: '', name: '', date: toDateKey(), subject: '국어', duration: 0, errorType: '조건 해석 실패', cause: '', nextAction: '' });
type Point = { id: string; date: string; name: string; score: number };

function getPoints(scores: ScoreEntry[], subject: Exclude<Subject, '탐구'>): Point[] {
  const key = scoreKey[subject];
  return scores.map((entry) => ({ id: entry.id, date: entry.date, name: entry.name, score: entry[key] }))
    .filter((entry): entry is Point => typeof entry.score === 'number')
    .sort((a, b) => a.date.localeCompare(b.date));
}

function ScoreTrend({ points, subject }: { points: Point[]; subject: string }) {
  if (!points.length) return <div className="trend-empty">{subject} 점수를 기록하면 100점 만점 추이 그래프가 표시됩니다.</div>;
  const width = 760; const height = 280; const left = 44; const right = 20; const top = 25; const bottom = 42;
  const graphWidth = width - left - right; const graphHeight = height - top - bottom;
  const x = (index: number) => points.length === 1 ? left + graphWidth / 2 : left + (graphWidth * index) / (points.length - 1);
  const y = (value: number) => top + graphHeight * (1 - value / 100);
  const line = points.map((point, index) => `${index ? 'L' : 'M'} ${x(index)} ${y(point.score)}`).join(' ');
  const labels = points.length > 7 ? points.filter((_, index) => index === 0 || index === points.length - 1 || index % Math.ceil(points.length / 6) === 0) : points;
  return <div className="trend-scroll"><svg className="score-trend" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${subject} 실모 점수 변화 그래프`}>
    {[0, 20, 40, 60, 80, 100].map((value) => <g key={value}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="trend-grid" /><text x={left - 10} y={y(value) + 4} textAnchor="end" className="trend-axis">{value}</text></g>)}
    <path d={line} className="trend-line" />
    {points.map((point, index) => <g key={point.id}><circle cx={x(index)} cy={y(point.score)} r="5" className="trend-point"><title>{`${point.date} · ${point.name || '실모'} · ${point.score}점`}</title></circle><text x={x(index)} y={y(point.score) - 12} textAnchor="middle" className="trend-score">{point.score}</text></g>)}
    {labels.map((point) => { const index = points.indexOf(point); return <text key={point.id} x={x(index)} y={height - 13} textAnchor="middle" className="trend-date">{point.date.slice(5).replace('-', '.')}</text>; })}
  </svg></div>;
}

export default function ScoreTracker({ data, update }: { data: AppData; update: (fn: (value: AppData) => AppData) => void }) {
  const [open, setOpen] = useState(false); const [draft, setDraft] = useState(blank()); const [subject, setSubject] = useState<Exclude<Subject, '탐구'>>('국어');
  const points = useMemo(() => getPoints(data.scores, subject), [data.scores, subject]);
  const latest = points.at(-1); const change = points.length > 1 && latest ? latest.score - points.at(-2)!.score : undefined;
  const save = () => { const hasScore = SCORE_SUBJECTS.some((item) => typeof draft[scoreKey[item]] === 'number'); if (!draft.name.trim() || !hasScore) return; update((value) => ({ ...value, scores: [{ ...draft, id: uid(), name: draft.name.trim() }, ...value.scores] })); setDraft(blank()); setOpen(false); };
  const remove = (id: string) => update((value) => ({ ...value, scores: value.scores.filter((x) => x.id !== id) }));
  const setScore = (key: 'korean' | 'math' | 'english', raw: string) => { const parsed = raw === '' ? undefined : Math.max(0, Math.min(100, Number(raw))); setDraft({ ...draft, [key]: Number.isFinite(parsed) ? parsed : undefined }); };
  return <div><PageHeader eyebrow="MOCK EXAM" title="실모 기록" description="실전 모의고사 점수를 남기고, 과목별 100점 만점 변화 추이를 확인합니다." action={<button className="button primary" onClick={() => setOpen(true)}><Plus size={17} /> 실모 기록</button>} />
    <Card className="score-trend-card"><div className="score-trend-head"><div><span className="card-label">SCORE TREND · 100점 만점</span><h2>{subject} 실모 점수 변화</h2></div><div className="trend-summary">{latest ? <><b>{latest.score}점</b>{change !== undefined && <span className={change >= 0 ? 'up' : 'down'}><TrendingUp size={13} /> {change >= 0 ? '+' : ''}{change}점</span>}</> : <span>기록 없음</span>}</div></div><div className="subject-tabs score-subject-tabs">{SCORE_SUBJECTS.map((item) => <button key={item} className={subject === item ? 'active' : ''} onClick={() => setSubject(item)}>{item}</button>)}</div><ScoreTrend points={points} subject={subject} /></Card>
    <div className="section-title"><h2>실모 기록 목록</h2><span>{data.scores.length}개 기록</span></div>
    {data.scores.length ? <div className="score-list">{[...data.scores].sort((a, b) => b.date.localeCompare(a.date)).map((score) => <Card key={score.id} className="score-row"><div className="score-date"><span>{score.date.slice(5).replace('-', '.')}</span><small>{score.subject}</small></div><div className="score-main"><h3>{score.name}</h3><div className="score-values">{score.korean !== undefined && <span>국어 <b>{score.korean}점</b></span>}{score.math !== undefined && <span>수학 <b>{score.math}점</b></span>}{score.english !== undefined && <span>영어 <b>{score.english}점</b></span>}<span>시간 <b>{score.duration}분</b></span></div><p><span className="error-chip">{score.errorType}</span>{score.nextAction || '다음 행동 미설정'}</p></div><button className="icon-button danger" onClick={() => remove(score.id)} aria-label="삭제"><Trash2 size={17} /></button></Card>)}</div> : <Empty>아직 실모 기록이 없습니다. 첫 실모 점수를 남겨보세요.</Empty>}
    {open && <div className="modal-backdrop" onClick={() => setOpen(false)}><div className="modal" onClick={(e) => e.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">NEW MOCK EXAM</p><h2>실모 기록</h2></div><button onClick={() => setOpen(false)}><X /></button></div><div className="form-grid two"><Field label="실모명"><input value={draft.name} placeholder="예: 2027 시대인재 서바이벌 3회" onChange={(e) => setDraft({...draft, name:e.target.value})} /></Field><Field label="응시 날짜"><input type="date" value={draft.date} onChange={(e) => setDraft({...draft, date:e.target.value})} /></Field><Field label="주 분석 과목"><select value={draft.subject} onChange={(e) => setDraft({...draft, subject:e.target.value as Subject})}>{SUBJECTS.map((s)=><option key={s}>{s}</option>)}</select></Field><Field label="시험 시간(분)"><input type="number" min="0" value={draft.duration || ''} onChange={(e)=>setDraft({...draft,duration:Number(e.target.value) || 0})}/></Field><Field label="국어 점수 · 0~100"><input type="number" min="0" max="100" value={draft.korean ?? ''} onChange={(e)=>setScore('korean', e.target.value)}/></Field><Field label="수학 점수 · 0~100"><input type="number" min="0" max="100" value={draft.math ?? ''} onChange={(e)=>setScore('math', e.target.value)}/></Field><Field label="영어 점수 · 0~100"><input type="number" min="0" max="100" value={draft.english ?? ''} onChange={(e)=>setScore('english', e.target.value)}/></Field><Field label="대표 오답 원인"><select value={draft.errorType} onChange={(e)=>setDraft({...draft,errorType:e.target.value})}>{ERROR_TYPES.map((x)=><option key={x}>{x}</option>)}</select></Field><Field label="오답 원인"><TextArea value={draft.cause} onChange={(v)=>setDraft({...draft,cause:v})}/></Field><Field label="다음 행동"><TextArea value={draft.nextAction} onChange={(v)=>setDraft({...draft,nextAction:v})} placeholder="다음 시험에서 관찰 가능한 행동"/></Field></div><div className="modal-actions"><SaveButton onClick={save} label="실모 기록 저장" /></div></div></div>}
  </div>;
}
