import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { AppData, CalendarEntry } from '../types';
import { Card, Field, PageHeader, SaveButton, TextArea } from '../components/Ui';
import { toDateKey } from '../lib/date';

const emptyEntry = (date: string): CalendarEntry => ({ date, study: '', minutes: 0, exam: '', event: '', condition: 3, reflection: '' });
export default function CalendarPage({ data, update }: { data: AppData; update: (fn: (value: AppData) => AppData) => void }) {
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<CalendarEntry | null>(null);
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const cells = useMemo(() => { const first = new Date(year, month, 1); const days = new Date(year, month + 1, 0).getDate(); return [...Array(first.getDay()).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]; }, [year, month]);
  const openDay = (day: number) => { const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; setSelected(key); setDraft(data.calendar[key] ?? emptyEntry(key)); };
  const save = () => { if (!selected || !draft) return; update((value) => ({ ...value, calendar: { ...value.calendar, [selected]: draft } })); setSelected(null); };
  return <div><PageHeader eyebrow="CALENDAR" title="월간 학습 로그" description="날짜별 실행, 사건, 컨디션과 회고를 같은 맥락에 저장합니다." />
    <Card className="calendar-card"><div className="calendar-head"><button aria-label="이전 달" onClick={() => setCursor(new Date(year, month - 1))}><ChevronLeft /></button><h2>{year}년 {month + 1}월</h2><button aria-label="다음 달" onClick={() => setCursor(new Date(year, month + 1))}><ChevronRight /></button></div>
      <div className="weekdays">{['일','월','화','수','목','금','토'].map((d) => <span key={d}>{d}</span>)}</div>
      <div className="calendar-grid">{cells.map((day, index) => day ? (() => { const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; const entry = data.calendar[key]; return <button key={key} className={`${key === toDateKey() ? 'today' : ''} ${entry ? 'has-entry' : ''}`} onClick={() => openDay(day)}><b>{day}</b>{entry && <><small>{entry.study.split('\n')[0]}</small><i style={{ opacity: entry.condition / 5 }} /></>}</button>; })() : <span key={`empty-${index}`} />)}</div>
    </Card>
    {selected && draft && <div className="modal-backdrop" onClick={() => setSelected(null)}><div className="modal" onClick={(e) => e.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">DAILY LOG</p><h2>{selected}</h2></div><button onClick={() => setSelected(null)} aria-label="닫기"><X /></button></div>
      <div className="form-grid"><Field label="공부 내용"><TextArea value={draft.study} onChange={(v) => setDraft({ ...draft, study: v })} placeholder={'국어: AOK 5주차\n수학: Theme 8'} /></Field><Field label="순공 시간(분)"><input type="number" min="0" value={draft.minutes} onChange={(e) => setDraft({ ...draft, minutes: Number(e.target.value) })} /></Field><Field label="시험"><input value={draft.exam} onChange={(e) => setDraft({ ...draft, exam: e.target.value })} placeholder="응시한 시험" /></Field><Field label="사건"><input value={draft.event} onChange={(e) => setDraft({ ...draft, event: e.target.value })} placeholder="학습에 영향을 준 사건" /></Field><Field label={`컨디션 · ${draft.condition}/5`}><input type="range" min="1" max="5" value={draft.condition} onChange={(e) => setDraft({ ...draft, condition: Number(e.target.value) })} /></Field><Field label="회고"><TextArea value={draft.reflection} onChange={(v) => setDraft({ ...draft, reflection: v })} placeholder="조건 검증 부족" /></Field></div><div className="modal-actions"><SaveButton onClick={save} /></div>
    </div></div>}
  </div>;
}
