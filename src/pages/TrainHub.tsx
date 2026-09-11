import { useMemo, useState } from 'react';
import { ArrowRight, Crosshair, X } from 'lucide-react';
import type { AppData, WrongAnswerDrill } from '../types';
import { Card, Empty, PageHeader } from '../components/Ui';
import SegmentedControl from '../components/navigation/SegmentedControl';
import TimerPage from './TimerPage';
import WeeklyDrill from './WeeklyDrill';
import Resources from './Resources';

export type TrainView = 'timer' | 'drill' | 'wrong' | 'resources';
const tabs = [{ id: 'timer', label: 'Timer' }, { id: 'drill', label: 'Drill' }, { id: 'wrong', label: 'Wrong Answers' }, { id: 'resources', label: 'Resources' }] as const;

function WrongAnswers({ data, edit }: { data: AppData; edit: () => void }) {
  const [selected, setSelected] = useState<WrongAnswerDrill | null>(null);
  const items = useMemo(() => [...data.wrongAnswerDrills].sort((a, b) => b.date.localeCompare(a.date)), [data.wrongAnswerDrills]);
  return <div><PageHeader eyebrow="WRONG ANSWERS" title="오답을 행동으로 바꿉니다" description="저장한 판단·놓친 단서·교정 행동을 한 번 입력하고 재도전까지 이어갑니다." action={<button className="button primary" onClick={edit}>오답 Drill 작성 <ArrowRight size={16} /></button>} />
    {items.length ? <div className="wrong-library">{items.map((item) => <button className="interactive-card" key={item.id} onClick={() => setSelected(item)}><span className={`subject-badge ${item.subject}`}>{item.subject}</span><small>{item.date} · {item.source}</small><h2>{item.question || '문항 미입력'}</h2><p>{item.correction || item.missedCue || '교정 행동을 기록하세요.'}</p><span>상세 보기 <ArrowRight size={14} /></span></button>)}</div> : <Empty>아직 오답 Drill이 없습니다.<br />틀린 판단을 기록하면 3/7/14일 재도전이 자동 생성됩니다.</Empty>}
    {selected && <div className="sheet-backdrop" onClick={() => setSelected(null)}><aside className="detail-sheet" role="dialog" aria-modal="true" aria-labelledby="wrong-detail-title" onClick={(event) => event.stopPropagation()}><header><div><span className="card-label">WRONG ANSWER</span><h2 id="wrong-detail-title">{selected.question || selected.source}</h2></div><button className="icon-button" aria-label="상세 닫기" onClick={() => setSelected(null)}><X /></button></header><div className="sheet-content"><section><b>잘못된 판단</b><p>{selected.wrongJudgment || '미기록'}</p></section><section><b>놓친 단서</b><p>{selected.missedCue || '미기록'}</p></section><section><b>교정 행동</b><p>{selected.correction || '미기록'}</p></section><section><b>전이 Drill</b><p>{selected.transfer || '미기록'}</p></section><section><b>재도전</b><p>{selected.retries?.map((retry) => `${retry.label} ${retry.completedDate ? '✓' : retry.dueDate}`).join(' · ') || '일정 없음'}</p></section></div><button className="button primary" onClick={() => { setSelected(null); edit(); }}>Drill에서 수정</button></aside></div>}
  </div>;
}

export default function TrainHub({ data, update, view, onView }: { data: AppData; update: (fn: (value: AppData) => AppData) => void; view: TrainView; onView: (view: TrainView) => void }) {
  return <><SegmentedControl label="Train 화면" options={tabs} value={view} onChange={onView} />{view === 'timer' ? <TimerPage data={data} update={update} /> : view === 'drill' ? <WeeklyDrill data={data} update={update} /> : view === 'wrong' ? <WrongAnswers data={data} edit={() => onView('drill')} /> : <Resources data={data} update={update} />}</>;
}

