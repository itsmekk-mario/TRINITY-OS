import { useMemo, useRef, useState } from 'react';
import { MessageCircle, RefreshCw, Sparkles } from 'lucide-react';
import type { AppData } from '../types';
import { formatMinutes, toDateKey } from '../lib/date';
import { analyzeLearningData } from '../lib/coach/analytics';
import { buildAIStudyCoachContext, coachContextHash } from '../lib/coach/context';
import { formatLocalCoach } from '../lib/coach/localCoach';
import { loadAIAnalysisCache, requestAIStudyAnalysis, saveAIAnalysisCache, type CoachReply } from '../lib/aiCoach';
import CoachChat from './CoachChat';

export default function DailyCoachCard({ data }: { data: AppData }) {
  const [revision, setRevision] = useState(0);
  const analysis = useMemo(() => analyzeLearningData(data, new Date()), [data, revision]);
  const local = useMemo(() => formatLocalCoach(analysis), [analysis]);
  const context = useMemo(() => buildAIStudyCoachContext(analysis), [analysis]);
  const contextKey = useMemo(() => coachContextHash(context), [context]);
  const cached = useMemo(() => loadAIAnalysisCache(context), [context, contextKey]);
  const [aiReply, setAIReply] = useState<{ key: string; value: CoachReply } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const busyRef = useRef(false);
  const precise = aiReply?.key === contextKey ? aiReply.value : cached;

  const refreshLocal = () => {
    setRevision((value) => value + 1);
    setError('');
  };

  const requestPreciseAnalysis = async () => {
    if (busyRef.current) return;
    const existing = loadAIAnalysisCache(context);
    if (existing) { setAIReply({ key: contextKey, value: existing }); setError(''); return; }
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const value = await requestAIStudyAnalysis(context);
      saveAIAnalysisCache(context, value);
      setAIReply({ key: contextKey, value });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'AI 정밀 분석을 사용할 수 없습니다. 기본 TRINITY 분석은 정상입니다.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return <section className="daily-coach" aria-labelledby="daily-coach-title">
    <div className="daily-coach-head">
      <div><span className="card-label">TRINITY COACH</span><h2 id="daily-coach-title">오늘의 학습 진단</h2><p>{toDateKey().replaceAll('-', '.')} · 로컬 분석</p></div>
      <button className="icon-button" onClick={refreshLocal} aria-label="로컬 분석 다시 계산"><RefreshCw size={16} /></button>
    </div>
    <div className="coach-progress"><div><span>오늘 진행률</span><strong>{analysis.execution.completionRateToday ?? 0}%</strong></div><div className="coach-progress-track"><i style={{ width: `${analysis.execution.completionRateToday ?? 0}%` }} /></div><small>{formatMinutes(analysis.execution.todayStudyMinutes)} / {analysis.execution.plannedMinutesToday ? formatMinutes(analysis.execution.plannedMinutesToday) : '계획 시간 미설정'}</small></div>
    <div className="coach-diagnosis"><span>CURRENT BOTTLENECK</span><b>{local.bottleneck}</b><small className={`confidence ${analysis.diagnosis.primaryBottleneck?.confidence ?? 'low'}`}>근거 신뢰도 · {analysis.diagnosis.primaryBottleneck?.confidence === 'high' ? '높음' : analysis.diagnosis.primaryBottleneck?.confidence === 'medium' ? '보통' : '낮음'}</small></div>
    <div className="coach-evidence"><span>EVIDENCE</span><p>{local.evidence}</p></div>
    <div className="coach-action"><span>NEXT ACTION</span><b>{analysis.diagnosis.nextAction.title}</b><p>{local.nextAction}</p>{local.successCriterion && <small>검증 기준 · {local.successCriterion}</small>}</div>
    {analysis.diagnosis.keepDoing && <p className="coach-keep">유지할 것 · {analysis.diagnosis.keepDoing}</p>}
    {precise && <div className="coach-precise"><span>AI 정밀 분석 {precise.cached ? '· 캐시' : ''}</span><p>{precise.message}</p></div>}
    {error && <p className="coach-ai-error">{error}</p>}
    <div className="coach-buttons">
      <button className="button" onClick={requestPreciseAnalysis} disabled={busy}><Sparkles size={16} />{busy ? '정밀 분석 중…' : precise ? 'AI 정밀 분석 보기' : 'AI 정밀 분석'}</button>
      <button className="button coach-chat-button" onClick={() => setChatOpen(true)}><MessageCircle size={16} /> AI에게 상담하기</button>
    </div>
    {chatOpen && <CoachChat analysis={analysis} context={context} onClose={() => setChatOpen(false)} />}
  </section>;
}
