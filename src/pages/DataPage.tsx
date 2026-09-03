import { useState } from 'react';
import { BarChart3, Gauge } from 'lucide-react';
import type { AppData } from '../types';
import { PageHeader } from '../components/Ui';
import Statistics from './Statistics';
import ScoreTracker from './ScoreTracker';

export default function DataPage({ data, update }: { data: AppData; update: (fn: (value: AppData) => AppData) => void }) {
  const [view, setView] = useState<'growth' | 'mock'>('growth');
  return <div><PageHeader eyebrow="DATA" title="성장을 확인한다" description="시간은 보조 지표입니다. 반복 오류가 줄고 능력이 실제로 재현되는지를 먼저 봅니다." /><div className="workspace-tabs"><button className={view === 'growth' ? 'active' : ''} onClick={() => setView('growth')}><BarChart3 size={16}/> 성장 분석</button><button className={view === 'mock' ? 'active' : ''} onClick={() => setView('mock')}><Gauge size={16}/> 실모 분석</button></div>{view === 'growth' ? <Statistics data={data}/> : <ScoreTracker data={data} update={update}/>}</div>;
}
