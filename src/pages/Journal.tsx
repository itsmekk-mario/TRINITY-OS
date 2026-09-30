import { useEffect, useState } from 'react';
import { Brain, FlaskConical, MoveRight } from 'lucide-react';
import type { AppData, JournalEntry } from '../types';
import { Card, Field, PageHeader, SaveButton, TextArea } from '../components/Ui';
import { toDateKey } from '../lib/date';

const blank = (date: string): JournalEntry => ({ date, studied: '', wins: '', blocked: '', cause: '', hypothesis: '', action: '', event: '' });
export default function Journal({ data, update, embedded = false }: { data: AppData; update: (fn: (value: AppData) => AppData) => void; embedded?: boolean }) {
  const [date, setDate] = useState(toDateKey()); const [entry, setEntry] = useState(data.journals[date] ?? blank(date)); const [saved, setSaved] = useState(false);
  useEffect(() => setEntry(data.journals[date] ?? blank(date)), [date, data.journals]);
  const field = (key: keyof JournalEntry, value: string) => setEntry({ ...entry, [key]: value });
  const save = () => { update((value) => ({ ...value, journals: { ...value.journals, [date]: entry } })); setSaved(true); setTimeout(() => setSaved(false), 1600); };
  return <div>{!embedded && <PageHeader eyebrow="METACOGNITION JOURNAL" title="행동 수정 저널" description="감상을 기록하지 않습니다. 관찰한 현상을 원인·가설·다음 행동으로 변환합니다." action={<input className="date-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />} />}
    {embedded && <div className="embedded-review-head"><div><span className="card-label">DAILY JOURNAL</span><h2>행동 수정 저널</h2><p>관찰한 현상을 원인·가설·다음 행동으로 변환합니다.</p></div><input className="date-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>}
    <div className="journal-flow"><Card><span className="step-icon">01</span><h2>관찰</h2><Field label="오늘 공부한 것"><TextArea value={entry.studied} onChange={(v) => field('studied', v)} placeholder="범위와 수행량을 구체적으로" /></Field><Field label="오늘 잘된 점"><TextArea value={entry.wins} onChange={(v) => field('wins', v)} placeholder="재현하고 싶은 행동" /></Field><Field label="오늘 막힌 점"><TextArea value={entry.blocked} onChange={(v) => field('blocked', v)} placeholder="어느 순간, 어떤 조건에서 막혔는가" /></Field></Card><MoveRight className="flow-arrow" />
      <Card><span className="step-icon"><Brain size={20} /></span><h2>해석</h2><Field label="문제 원인"><TextArea value={entry.cause} onChange={(v) => field('cause', v)} placeholder="표면 현상보다 한 단계 아래 원인" /></Field><Field label="내가 세운 가설"><TextArea value={entry.hypothesis} onChange={(v) => field('hypothesis', v)} placeholder="내일 검증 가능한 형태로" /></Field></Card><MoveRight className="flow-arrow" />
      <Card className="action-stage"><span className="step-icon"><FlaskConical size={20} /></span><h2>수정</h2><Field label="내일 수정 행동"><TextArea value={entry.action} onChange={(v) => field('action', v)} placeholder="관찰 가능한 한 가지 행동" rows={5} /></Field><Field label="오늘 있었던 사건"><TextArea value={entry.event} onChange={(v) => field('event', v)} placeholder="학습에 영향을 준 외부 요인" /></Field></Card></div><div className="sticky-save"><span>{saved ? '저장되었습니다.' : '기록은 이 기기에 자동 보관됩니다.'}</span><SaveButton onClick={save} label={saved ? '저장 완료' : '저널 저장'} /></div>
  </div>;
}
