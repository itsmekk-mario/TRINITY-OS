import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from 'lucide-react';
import type { LearningSignal } from '../../lib/learningSignals';
import { Empty } from '../Ui';

const icon = (signal: LearningSignal) => signal.trend === 'down' ? <ArrowDownRight /> : signal.trend === 'up' ? <ArrowUpRight /> : signal.trend === 'stable' ? <Minus /> : <ArrowRight />;

export default function LearningSignalCards({ signals, limit = 3 }: { signals: LearningSignal[]; limit?: number }) {
  if (!signals.length) return <Empty>아직 Learning Signal이 없습니다.<br />타이머·실모·오답 Drill을 기록하면 변화와 다음 행동을 확인할 수 있습니다.</Empty>;
  return <div className="learning-signal-grid">{signals.slice(0, limit).map((signal) => <article className={`learning-signal ${signal.interpretation ?? 'neutral'}`} key={signal.id}>
    <div><span>{signal.title}</span><i aria-label={signal.trend ? `추세 ${signal.trend}` : '추세 정보 없음'}>{icon(signal)}</i></div>
    <strong className="metric-number">{signal.value}</strong>
    {signal.previousValue && <small>{signal.previousValue}</small>}
    {signal.action && <p>{signal.action}</p>}
  </article>)}</div>;
}

