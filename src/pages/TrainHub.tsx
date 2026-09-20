import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Link2, X } from 'lucide-react';
import type { AppData, WrongAnswerDrill } from '../types';
import { Empty, PageHeader } from '../components/Ui';
import HubLayout from '../components/navigation/HubLayout';
import SegmentedControl from '../components/navigation/SegmentedControl';
import TimerPage from './TimerPage';
import WeeklyDrill from './WeeklyDrill';
import Resources from './Resources';
import { useDialogFocus } from '../components/motion/useDialogFocus';
import { archiveApi, type CoreRule, type RuleRelation } from '../lib/archiveApi';
import QuickCaptureSheet from '../components/learning/QuickCaptureSheet';

export type TrainView = 'timer' | 'drill' | 'wrong' | 'resources';
const tabs = [{ id: 'timer', label: 'Timer' }, { id: 'drill', label: 'Drill' }, { id: 'wrong', label: 'Wrong Answers' }, { id: 'resources', label: 'Resources' }] as const;
const relationLabels:Record<RuleRelation,string>={derived:'도출',applied:'적용',failed:'적용 실패',reinforced:'강화'};
type LinkedCoreRule=CoreRule&{relationType?:RuleRelation};

function WrongAnswers({ data, update, edit }: { data: AppData; update:(fn:(value:AppData)=>AppData)=>void; edit: () => void }) {
  const [selected, setSelected] = useState<WrongAnswerDrill | null>(null);
  const [view, setView] = useState<'all'|'subject'|'source'|'time'>('all');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [linkedRules,setLinkedRules]=useState<LinkedCoreRule[]>([]);
  const [allRules,setAllRules]=useState<CoreRule[]>([]);
  const [ruleToLink,setRuleToLink]=useState('');
  const [linkRelation,setLinkRelation]=useState<RuleRelation>('failed');
  const [linkBusy,setLinkBusy]=useState(false);
  const [linkError,setLinkError]=useState('');
  const [quickCapture,setQuickCapture]=useState(false);
  const sheetRef = useRef<HTMLElement>(null);
  useDialogFocus(Boolean(selected), sheetRef, () => setSelected(null));
  const loadRuleLinks=async(id:string)=>{const [graph,library]=await Promise.all([archiveApi<{coreRules:LinkedCoreRule[]}>(`/api/learning-intelligence/wrong-answers/${encodeURIComponent(id)}`),archiveApi<{rules:CoreRule[]}>('/api/archive/rules')]);setLinkedRules(graph.coreRules);setAllRules(library.rules);};
  useEffect(()=>{if(!selected){setLinkedRules([]);setRuleToLink('');setLinkError('');return}let live=true;setLinkError('');Promise.all([archiveApi<{coreRules:LinkedCoreRule[]}>(`/api/learning-intelligence/wrong-answers/${encodeURIComponent(selected.id)}`),archiveApi<{rules:CoreRule[]}>('/api/archive/rules')]).then(([graph,library])=>{if(!live)return;setLinkedRules(graph.coreRules);setAllRules(library.rules)}).catch(error=>{if(live)setLinkError(error instanceof Error?error.message:'Core Rule 연결 정보를 불러오지 못했습니다.')});return()=>{live=false}},[selected?.id]);
  const linkCoreRule=async()=>{if(!selected||!ruleToLink)return;setLinkBusy(true);setLinkError('');try{await archiveApi('/api/learning-intelligence/wrong-answer-links','POST',{coreRuleId:ruleToLink,wrongAnswerId:selected.id,relationType:linkRelation});await loadRuleLinks(selected.id);setRuleToLink('')}catch(error){setLinkError(error instanceof Error?error.message:'Core Rule 연결 실패')}finally{setLinkBusy(false)}};
  const unlinkCoreRule=async(ruleId:string)=>{if(!selected)return;setLinkBusy(true);setLinkError('');try{await archiveApi(`/api/learning-intelligence/wrong-answer-links/${encodeURIComponent(ruleId)}/${encodeURIComponent(selected.id)}`,'DELETE');await loadRuleLinks(selected.id)}catch(error){setLinkError(error instanceof Error?error.message:'Core Rule 연결 해제 실패')}finally{setLinkBusy(false)}};
  const items = useMemo(() => [...data.wrongAnswerDrills].sort((a, b) => b.date.localeCompare(a.date)), [data.wrongAnswerDrills]);
  const card = (item:WrongAnswerDrill) => <button className="interactive-card" key={item.id} onClick={() => setSelected(item)}><span className={`subject-badge ${item.subject}`}>{item.subject}</span><small>{item.date} · {item.source}</small><h2>{item.question || '문항 미입력'}</h2><p>{item.correction || item.missedCue || '교정 행동을 기록하세요.'}</p><span>상세 보기 <ArrowRight size={14} /></span></button>;
  const subjects = ['국어','수학','영어','탐구','기타'] as const;
  const subjectGroups = subjects.map(subject => ({ key:`subject:${subject}`, label:subject, items: items.filter(item => subject === '기타' ? !['국어','수학','영어','탐구'].includes(item.subject) : item.subject === subject) })).filter(group => group.items.length);
  const sourceGroups = [...new Set(items.map(item=>item.source?.trim()||'출처 미지정'))].map(source=>({key:`source:${source}`,label:source,items:items.filter(item=>(item.source?.trim()||'출처 미지정')===source)})).sort((a,b)=>b.items.length-a.items.length||a.label.localeCompare(b.label));
  const timeGroups = [...new Set(items.map(item=>item.date||'날짜 미지정'))].sort((a,b)=>b.localeCompare(a)).map(date=>({key:`time:${date}`,label:date,items:items.filter(item=>(item.date||'날짜 미지정')===date)}));
  const due = (group:WrongAnswerDrill[]) => group.flatMap(item => item.retries ?? []).filter(retry => !retry.completedDate && retry.dueDate <= new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'})).length;
  const renderGroups=(groups:{key:string;label:string;items:WrongAnswerDrill[]}[])=><div className="wrong-subject-groups">{groups.map((group,index)=>{const expanded=open[group.key]??index===0;const pending=group.items.filter(item=>(item.retries??[]).some(retry=>!retry.completedDate)).length;return <section key={group.key}><button className="wrong-subject-header" onClick={()=>setOpen(value=>({...value,[group.key]:!expanded}))}><span><b>{group.label}</b><small>오답 {group.items.length}개 · 미복습 {pending}개 · 재도전 예정 {due(group.items)}개</small></span><span>{expanded?'접기':'펼치기'}</span></button>{expanded&&<div className="wrong-library">{group.items.map(card)}</div>}</section>})}</div>;
  return <div><PageHeader eyebrow="WRONG ANSWERS" title="오답을 행동으로 바꿉니다" description="저장한 판단·놓친 단서·교정 행동을 한 번 입력하고 재도전까지 이어갑니다." action={<div className="button-row"><button className="button" onClick={()=>setQuickCapture(true)}>빠른 오답 기록</button><button className="button primary" onClick={edit}>오답 Drill 작성 <ArrowRight size={16} /></button></div>} />
    {items.length ? <><div className="wrong-view-toggle"><button className={view==='all'?'active':''} onClick={()=>setView('all')}>전체</button><button className={view==='subject'?'active':''} onClick={()=>setView('subject')}>과목별</button><button className={view==='source'?'active':''} onClick={()=>setView('source')}>출처별</button><button className={view==='time'?'active':''} onClick={()=>setView('time')}>시간별</button></div>{view==='all'?<div className="wrong-library">{items.map(card)}</div>:view==='subject'?renderGroups(subjectGroups):view==='source'?renderGroups(sourceGroups):renderGroups(timeGroups)}</> : <Empty title="아직 오답 Drill이 없습니다." description="틀린 판단을 기록하면 3/7/14일 재도전이 자동 생성됩니다." action={<button className="button" onClick={edit}>오답 기록</button>} />}
    {quickCapture&&<QuickCaptureSheet data={data} update={update} onClose={()=>setQuickCapture(false)}/>} {selected && <div className="sheet-backdrop" onClick={() => setSelected(null)}><aside ref={sheetRef} tabIndex={-1} className="detail-sheet" role="dialog" aria-modal="true" aria-labelledby="wrong-detail-title" onClick={(event) => event.stopPropagation()}><header><div><span className="card-label">WRONG ANSWER</span><h2 id="wrong-detail-title">{selected.question || selected.source}</h2></div><button className="icon-button" aria-label="상세 닫기" onClick={() => setSelected(null)}><X /></button></header><div className="sheet-content"><section><b>잘못된 판단</b><p>{selected.wrongJudgment || '미기록'}</p></section><section><b>놓친 단서</b><p>{selected.missedCue || '미기록'}</p></section><section><b>교정 행동</b><p>{selected.correction || '미기록'}</p></section><section><b>전이 Drill</b><p>{selected.transfer || '미기록'}</p></section><section><b>재도전</b><p>{selected.retries?.map((retry) => `${retry.label} ${retry.completedDate ? '✓' : retry.dueDate}`).join(' · ') || '일정 없음'}</p></section><section><b>연결된 Core Rule</b>{linkError&&<p className="team-error">{linkError}</p>}{linkedRules.length?<div className="record-links">{linkedRules.map(rule=><span key={rule.id}><b>[{relationLabels[(rule.relationType??'failed') as RuleRelation]}]</b> {rule.title} <button className="button small" disabled={linkBusy} onClick={()=>void unlinkCoreRule(rule.id)}>해제</button></span>)}</div>:<p>연결된 Core Rule이 없습니다.</p>}<div className="form-grid two"><select aria-label="Core Rule 관계" value={linkRelation} onChange={event=>setLinkRelation(event.target.value as RuleRelation)}><option value="failed">적용 실패</option><option value="applied">적용</option><option value="derived">도출</option><option value="reinforced">강화</option></select><select aria-label="연결할 Core Rule" value={ruleToLink} onChange={event=>setRuleToLink(event.target.value)}><option value="">Core Rule 선택</option>{allRules.filter(rule=>!linkedRules.some(linked=>linked.id===rule.id)).map(rule=><option key={rule.id} value={rule.id}>{rule.title}</option>)}</select></div><button className="button" disabled={linkBusy||!ruleToLink} onClick={()=>void linkCoreRule()}><Link2 size={14}/>Core Rule 연결</button></section></div><button className="button primary" onClick={() => { setSelected(null); edit(); }}>Drill에서 수정</button></aside></div>}
  </div>;
}

export default function TrainHub({ data, update, view, onView }: { data: AppData; update: (fn: (value: AppData) => AppData) => void; view: TrainView; onView: (view: TrainView) => void }) {
  return <HubLayout eyebrow="TRAIN" title="계획을 실행하고, 행동을 교정합니다" description="집중 학습에서 오답 연습과 재도전까지 이어갑니다." controls={<SegmentedControl label="Train 화면" options={tabs} value={view} onChange={onView} />}>{view === 'timer' ? <TimerPage data={data} update={update} /> : view === 'drill' ? <WeeklyDrill data={data} update={update} /> : view === 'wrong' ? <WrongAnswers data={data} update={update} edit={() => onView('drill')} /> : <Resources data={data} update={update} />}</HubLayout>;
}
