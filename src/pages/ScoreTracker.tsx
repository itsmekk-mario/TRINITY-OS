import { useMemo, useState } from 'react';
import { BarChart3, ChevronDown, Plus, Trash2, TrendingUp, X } from 'lucide-react';
import type { AppData, MockExamReview, MockExamSubject, ScoreEntry, Subject } from '../types';
import { SUBJECTS } from '../data/config';
import { Card, Empty, Field, PageHeader, SaveButton, TextArea } from '../components/Ui';
import { toDateKey, uid } from '../lib/date';

const SCORE_SUBJECTS: MockExamSubject[] = ['국어', '수학', '영어'];
const scoreKey = { 국어: 'korean', 수학: 'math', 영어: 'english' } as const;
const emptyReview = (): MockExamReview => ({ score: undefined, duration: undefined, wrongQuestions: '', observation: '', improvement: '' });
const blank = (): ScoreEntry => ({ id: '', name: '', date: toDateKey(), subject: '국어', duration: 0, errorType: '', cause: '', nextAction: '', reviews: { 국어: emptyReview(), 수학: emptyReview(), 영어: emptyReview() }, overallReview: '' });
type Point = { id: string; date: string; name: string; score: number };

function reviewOf(entry: ScoreEntry, subject: MockExamSubject): MockExamReview {
  const modern = entry.reviews?.[subject];
  if (modern) return modern;
  const legacyScore = entry[scoreKey[subject]];
  return { score: legacyScore, duration: entry.subject === subject ? entry.duration : undefined, wrongQuestions: '', observation: entry.subject === subject ? entry.cause : '', improvement: entry.subject === subject ? entry.nextAction : '' };
}
function getPoints(scores: ScoreEntry[], subject: MockExamSubject): Point[] {
  return scores.map((entry) => ({ id: entry.id, date: entry.date, name: entry.name, score: reviewOf(entry, subject).score }))
    .filter((entry): entry is Point => typeof entry.score === 'number').sort((a, b) => a.date.localeCompare(b.date));
}
function ScoreTrend({ points, subject }: { points: Point[]; subject: string }) {
  if (!points.length) return <div className="trend-empty">{subject} 점수를 기록하면 100점 만점 추이 그래프가 표시됩니다.</div>;
  const width = 760; const height = 280; const left = 44; const right = 20; const top = 25; const bottom = 42; const graphWidth = width - left - right; const graphHeight = height - top - bottom;
  const x = (index: number) => points.length === 1 ? left + graphWidth / 2 : left + (graphWidth * index) / (points.length - 1); const y = (value: number) => top + graphHeight * (1 - value / 100);
  const line = points.map((point, index) => `${index ? 'L' : 'M'} ${x(index)} ${y(point.score)}`).join(' '); const labels = points.length > 7 ? points.filter((_, index) => index === 0 || index === points.length - 1 || index % Math.ceil(points.length / 6) === 0) : points;
  return <div className="trend-scroll"><svg className="score-trend" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${subject} 실모 점수 변화 그래프`}>
    {[0, 20, 40, 60, 80, 100].map((value) => <g key={value}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="trend-grid" /><text x={left - 10} y={y(value) + 4} textAnchor="end" className="trend-axis">{value}</text></g>)}
    <path d={line} className="trend-line" />
    {points.map((point, index) => <g key={point.id}><circle cx={x(index)} cy={y(point.score)} r="5" className="trend-point"><title>{`${point.date} · ${point.name || '실모'} · ${point.score}점`}</title></circle><text x={x(index)} y={y(point.score) - 12} textAnchor="middle" className="trend-score">{point.score}</text></g>)}
    {labels.map((point) => { const index = points.indexOf(point); return <text key={point.id} x={x(index)} y={height - 13} textAnchor="middle" className="trend-date">{point.date.slice(5).replace('-', '.')}</text>; })}
  </svg></div>;
}

export default function ScoreTracker({ data, update }: { data: AppData; update: (fn: (value: AppData) => AppData) => void }) {
  const [open, setOpen] = useState(false); const [draft, setDraft] = useState(blank()); const [subject, setSubject] = useState<MockExamSubject>('국어'); const [bottleneckSubject, setBottleneckSubject] = useState<Subject | '전체'>('전체'); const [formError, setFormError] = useState('');
  const points = useMemo(() => getPoints(data.scores, subject), [data.scores, subject]); const latest = points.at(-1); const change = points.length > 1 && latest ? latest.score - points.at(-2)!.score : undefined;
  const bottleneckCounts = useMemo(() => data.wrongAnswerDrills.filter((item) => bottleneckSubject === '전체' || item.subject === bottleneckSubject).reduce<Record<string, number>>((result, item) => ({ ...result, [item.bottleneck ?? '미분류']: (result[item.bottleneck ?? '미분류'] ?? 0) + 1 }), {}), [data.wrongAnswerDrills, bottleneckSubject]);
  const bottleneckItems = useMemo(() => Object.entries(bottleneckCounts).sort((a, b) => b[1] - a[1]), [bottleneckCounts]);
  const bottleneckMax = Math.max(...bottleneckItems.map(([, count]) => count), 1);
  const setReview = (item: MockExamSubject, changeValue: Partial<MockExamReview>) => setDraft((value) => ({ ...value, reviews: { ...value.reviews, [item]: { ...emptyReview(), ...value.reviews?.[item], ...changeValue } } }));
  const setNumber = (item: MockExamSubject, key: 'score' | 'duration', raw: string) => { const number = raw === '' ? undefined : Number(raw); const valid = number !== undefined && Number.isFinite(number); setReview(item, { [key]: key === 'score' && valid ? Math.max(0, Math.min(100, number)) : valid ? Math.max(0, number) : undefined }); };
  const save = () => {
    const reviews = draft.reviews ?? {}; const hasScore = SCORE_SUBJECTS.some((item) => typeof reviews[item]?.score === 'number');
    if (!draft.name.trim() || !hasScore) { setFormError('실모명과 최소 한 과목의 점수를 입력하세요.'); return; }
    update((value) => ({ ...value, scores: [{ ...draft, id: uid(), name: draft.name.trim(), subject: '국어', korean: reviews.국어?.score, math: reviews.수학?.score, english: reviews.영어?.score, duration: SCORE_SUBJECTS.reduce((sum, item) => sum + (reviews[item]?.duration ?? 0), 0) }, ...value.scores] })); setDraft(blank()); setFormError(''); setOpen(false);
  };
  const remove = (id: string) => update((value) => ({ ...value, scores: value.scores.filter((x) => x.id !== id) }));
  return <div><PageHeader eyebrow="MOCK EXAM" title="실모 기록" description="시험의 원인과 개선 방향까지 남기고, 과목별 100점 만점 추이를 확인합니다." action={<button className="button primary" onClick={() => setOpen(true)}><Plus size={17} /> 실모 기록</button>} />
    <Card className="score-trend-card"><div className="score-trend-head"><div><span className="card-label">SCORE TREND · 100점 만점</span><h2>{subject} 실모 점수 변화</h2></div><div className="trend-summary">{latest ? <><b>{latest.score}점</b>{change !== undefined && <span className={change >= 0 ? 'up' : 'down'}><TrendingUp size={13} /> {change >= 0 ? '+' : ''}{change}점</span>}</> : <span>기록 없음</span>}</div></div><div className="subject-tabs score-subject-tabs">{SCORE_SUBJECTS.map((item) => <button key={item} className={subject === item ? 'active' : ''} onClick={() => setSubject(item)}>{item}</button>)}</div><ScoreTrend points={points} subject={subject} /></Card>
    <Card className="bottleneck-dashboard"><div className="score-trend-head"><div><span className="card-label">BOTTLENECK DASHBOARD</span><h2><BarChart3 size={18} /> 반복 병목</h2><p>오답 Drill에서 분류한 원인이 누적됩니다. 가장 높은 항목을 다음 주 능력 목표로 옮기세요.</p></div><strong>{bottleneckItems[0] ? `${bottleneckItems[0][0]} ${bottleneckItems[0][1]}회` : '기록 대기'}</strong></div><div className="subject-tabs bottleneck-tabs"><button className={bottleneckSubject === '전체' ? 'active' : ''} onClick={() => setBottleneckSubject('전체')}>전체</button>{SUBJECTS.map((item) => <button key={item} className={bottleneckSubject === item ? 'active' : ''} onClick={() => setBottleneckSubject(item)}>{item}</button>)}</div>{bottleneckItems.length ? <div className="bottleneck-bars">{bottleneckItems.map(([label, count]) => <div key={label}><span>{label}</span><div><i style={{ width: `${(count / bottleneckMax) * 100}%` }} /></div><b>{count}</b></div>)}</div> : <div className="trend-empty">오답 Drill을 기록할 때 병목을 분류하면 여기에서 누적됩니다.</div>}</Card>
    <div className="section-title"><h2>실모 기록 목록</h2><span>{data.scores.length}개 기록</span></div>
    {data.scores.length ? <div className="mock-record-list">{[...data.scores].sort((a, b) => b.date.localeCompare(a.date)).map((score) => { const linkedDrills = data.wrongAnswerDrills.filter((item) => item.scoreId === score.id); return <Card key={score.id} className="mock-record"><div className="mock-record-head"><div><span className="card-label">{score.date}</span><h3>{score.name}</h3></div><button className="icon-button danger" onClick={() => remove(score.id)} aria-label="삭제"><Trash2 size={17} /></button></div><div className="mock-score-summary">{SCORE_SUBJECTS.map((item) => { const review = reviewOf(score, item); return review.score === undefined ? null : <span key={item}><b>{item}</b> {review.score}점 <small>{review.duration ? `· ${review.duration}분` : ''}</small></span>; })}</div>{linkedDrills.length > 0 && <div className="record-links linked-drills"><span>연결된 오답 Drill {linkedDrills.length}개</span>{linkedDrills.map((item) => <span key={item.id}>{item.subject} · {item.question || item.source}</span>)}</div>}<details className="mock-detail"><summary>시험 분석 보기 <ChevronDown size={16} /></summary><div className="mock-detail-body">{SCORE_SUBJECTS.map((item) => { const review = reviewOf(score, item); return <section key={item} className="mock-review"><h4>{item} <span>{review.score ?? '-'}점 / 100점{review.duration ? ` · ${review.duration}분` : ''}</span></h4><div><b>오답문항</b><p>{review.wrongQuestions || '기록 없음'}</p></div><div><b>객관화</b><p>{review.observation || '기록 없음'}</p></div><div><b>개선방향</b><p>{review.improvement || '기록 없음'}</p></div></section>; })}{score.overallReview && <section className="mock-overall"><b>총평</b><p>{score.overallReview}</p></section>}</div></details></Card>; })}</div> : <Empty>아직 실모 기록이 없습니다. 첫 실모 분석을 남겨보세요.</Empty>}
    {open && <div className="modal-backdrop" onClick={() => setOpen(false)}><div className="modal mock-modal" onClick={(e) => e.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">NEW MOCK EXAM</p><h2>실모 기록</h2></div><button onClick={() => setOpen(false)}><X /></button></div><div className="form-grid two"><Field label="시험 종류 / 실모명"><input value={draft.name} placeholder="예: 서바이벌 프로 8월" onChange={(e) => setDraft({...draft, name:e.target.value})} /></Field><Field label="응시 날짜"><input type="date" value={draft.date} onChange={(e) => setDraft({...draft, date:e.target.value})} /></Field></div>
      {SCORE_SUBJECTS.map((item) => { const review = draft.reviews?.[item] ?? emptyReview(); return <section className="mock-form-section" key={item}><h3>{item}</h3><div className="form-grid two"><Field label="점수 · 0~100"><input type="number" min="0" max="100" value={review.score ?? ''} onChange={(e) => setNumber(item, 'score', e.target.value)} /></Field><Field label="시험 시간(분)"><input type="number" min="0" value={review.duration ?? ''} onChange={(e) => setNumber(item, 'duration', e.target.value)} /></Field></div><Field label="오답문항"><TextArea value={review.wrongQuestions} onChange={(value) => setReview(item, { wrongQuestions: value })} placeholder="예: 비문학 어휘 1, 내용일치 1 / 화작 3" /></Field><Field label="객관화"><TextArea value={review.observation} onChange={(value) => setReview(item, { observation: value })} placeholder="시험에서 드러난 원인과 상태를 사실 중심으로 기록" /></Field><Field label="개선방향"><TextArea value={review.improvement} onChange={(value) => setReview(item, { improvement: value })} placeholder="다음 시험 전 실행할 구체적인 행동" /></Field></section>; })}
      <section className="mock-form-section overall"><Field label="총평"><TextArea value={draft.overallReview ?? ''} onChange={(value) => setDraft({ ...draft, overallReview: value })} placeholder="과목별 병목과 다음 시험 전 최우선 과제를 정리" /></Field></section>{formError && <p className="form-error">{formError}</p>}<div className="modal-actions"><SaveButton onClick={save} label="실모 분석 저장" /></div></div></div>}
  </div>;
}
