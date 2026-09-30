import { useMemo } from 'react';
import { BrainCircuit, Crosshair, Timer } from 'lucide-react';
import type { AppData } from '../types';
import { Card, PageHeader } from '../components/Ui';
import DailyCoachCard from '../components/DailyCoachCard';
import { deriveLearningSignals } from '../lib/learningSignals';

export default function CoachPage({ data }: { data: AppData }) {
  const analytics = useMemo(() => deriveLearningSignals(data), [data]);
  return <div><PageHeader eyebrow="CONTEXTUAL COACH" title="AI Coach" description="채팅보다 먼저, 현재 학습 데이터에서 무엇을 바꿔야 하는지 보여줍니다." />
    <Card className="coach-context-hero"><div className="coach-context-title"><BrainCircuit /><div><span>오늘의 데이터 요약</span><h2>{analytics.recommendedAction ?? '분석할 학습 기록이 더 필요합니다.'}</h2></div></div><div className="coach-context-metrics"><div><Timer /><span>오늘 학습</span><b>{analytics.execution.todayMinutes}분</b></div><div><Crosshair /><span>현재 병목</span><b>{analytics.currentBottleneck?.name ?? '기록 대기'}</b></div><div><BrainCircuit /><span>이번 주 Goal</span><b>{analytics.capabilityGoals.find((item) => !item.done)?.ability ?? '미설정'}</b></div></div></Card>
    <DailyCoachCard data={data} />
  </div>;
}
