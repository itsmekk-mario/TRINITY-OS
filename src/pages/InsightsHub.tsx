import { useMemo } from 'react';
import { ArrowRight, CheckCircle2, Crosshair, Gauge, RefreshCw } from 'lucide-react';
import type { AppData } from '../types';
import { Card, Empty, PageHeader, SectionTitle } from '../components/Ui';
import SegmentedControl from '../components/navigation/SegmentedControl';
import HubLayout from '../components/navigation/HubLayout';
import type { ReactNode } from 'react';
import LearningSignalCards from '../components/insights/LearningSignalCards';
import { deriveLearningSignals } from '../lib/learningSignals';
import Statistics from './Statistics';
import PlaireReview from './PlaireReview';

export type InsightsView = 'overview' | 'performance' | 'bottlenecks' | 'review';
const tabs = [{ id: 'overview', label: 'Overview' }, { id: 'performance', label: 'Performance' }, { id: 'bottlenecks', label: 'Bottlenecks' }, { id: 'review', label: 'Review' }] as const;

export default function InsightsHub({ data, update, view, onView }: { data: AppData; update: (fn: (value: AppData) => AppData) => void; view: InsightsView; onView: (view: InsightsView) => void }) {
  const analytics = useMemo(() => deriveLearningSignals(data), [data]);
  const layout = (content: ReactNode) => <HubLayout eyebrow="INSIGHTS" title="무엇이 달라졌는지 확인합니다" description="실행 시간과 능력 개선의 근거를 읽고 다음 행동을 결정합니다." controls={<SegmentedControl label="Insights 화면" options={tabs} value={view} onChange={onView} />}>{content}</HubLayout>;
  if (view === 'performance') return layout(<Statistics data={data} />);
  if (view === 'review') return layout(<PlaireReview data={data} update={update} />);
  if (view === 'bottlenecks') return layout(<div><PageHeader eyebrow="DIAGNOSE" title="병목과 재현" description="빈도만 보지 않고, 교정 행동이 재도전과 전이로 이어졌는지 확인합니다." />
    <div className="capability-summary"><Card><span>동일 오류 재발률</span><strong className="metric-number">{analytics.recurrenceRate === null ? '—' : `${analytics.recurrenceRate}%`}</strong><small>최근 14일 동일 병목·판단·단서 조합</small></Card>{analytics.retries.map((retry) => <Card key={retry.id}><span>{retry.label}</span><strong className="metric-number">{retry.rate === null ? '—' : `${retry.rate}%`}</strong><small>{retry.due ? `${retry.completed}/${retry.due}회 완료` : '도래한 재도전 없음'}</small></Card>)}<Card><span>Transfer 확인</span><strong className="metric-number">{analytics.transfer.rate === null ? '—' : `${analytics.transfer.rate}%`}</strong><small>전이 설계 후 재현 완료 기록</small></Card></div>
    <SectionTitle title="Bottleneck Frequency" meta="최근 14일 vs 이전 14일" />{analytics.bottlenecks.length ? <div className="bottleneck-list">{analytics.bottlenecks.map((item) => <Card key={item.name} className="bottleneck-row"><Crosshair /><div><h2>{item.name}</h2><p>{item.action || '교정 행동이 아직 기록되지 않았습니다.'}</p></div><div><strong>{item.current}회</strong><small>이전 {item.previous}회</small></div><em className={item.current < item.previous ? 'positive' : item.current > item.previous ? 'negative' : ''}>{item.changePercent === null ? '신규' : `${item.changePercent > 0 ? '+' : ''}${item.changePercent}%`}</em></Card>)}</div> : <Empty>아직 병목 데이터가 없습니다.<br />Wrong Answer Drill에서 병목과 놓친 단서를 기록하세요.</Empty>}</div>);
  return layout(<div>
    <LearningSignalCards signals={analytics.signals} limit={4} />
    <div className="insight-path"><Card><Gauge /><span>EXECUTION</span><h2>{analytics.execution.todayMinutes}분</h2><p>오늘 실제 학습 · 계획 {analytics.execution.plannedMinutes || '미설정'}분</p><button className="text-button" onClick={() => onView('performance')}>시간 분석 <ArrowRight /></button></Card><Card><Crosshair /><span>DIAGNOSE</span><h2>{analytics.currentBottleneck?.name ?? '기록 대기'}</h2><p>{analytics.currentBottleneck ? `최근 14일 ${analytics.currentBottleneck.current}회` : '오답 Drill에서 병목을 분류하세요.'}</p><button className="text-button" onClick={() => onView('bottlenecks')}>병목 분석 <ArrowRight /></button></Card><Card><RefreshCw /><span>RETRY</span><h2>{analytics.retries.reduce((sum, item) => sum + item.completed, 0)}회</h2><p>기한이 된 재도전 중 재현 완료</p></Card><Card><CheckCircle2 /><span>NEXT ACTION</span><h2>{analytics.capabilityGoals.find((item) => !item.done)?.ability ?? '능력 목표 설정'}</h2><p>{analytics.recommendedAction ?? 'Review에서 오늘의 교정 행동을 정리하세요.'}</p><button className="text-button" onClick={() => onView('review')}>회고 열기 <ArrowRight /></button></Card></div>
  </div>);
}
