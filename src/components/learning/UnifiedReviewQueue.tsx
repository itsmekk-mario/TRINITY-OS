import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, Clock3, RotateCcw, X } from 'lucide-react';
import { archiveApi, type ReviewQueueItem, type ReviewQueueResponse } from '../../lib/archiveApi';
import { Empty, Field, TextArea } from '../Ui';
import { useDialogFocus } from '../motion/useDialogFocus';

type TargetType=ReviewQueueItem['targetType'];
const typeLabel:Record<TargetType,string>={learning_item:'Archive',wrong_answer:'Wrong Answer',core_rule:'Core Rule',drill:'Drill'};
const resultLabel=(value:string|null)=>value==='success'?'성공':value==='fail'?'실패':'첫 Review';
const asText=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim():'';

function DetailContent({item}:{item:ReviewQueueItem}){
  const d=item.detail;
  if(item.targetType==='core_rule')return <><section><b>판단 기준</b><p>{asText(d.content)||'내용 없음'}</p></section><section className="review-detail-metrics"><span>최근 7일 실패 <b>{Number(d.failures7d??0)}회</b></span><span>체화 <b>{asText(d.masteryStatus)||'—'}</b></span></section></>;
  if(item.targetType==='wrong_answer')return <><section><b>출처</b><p>{asText(d.source)||'—'}</p></section><section><b>잘못된 판단</b><p>{asText(d.wrongJudgment)||'미기록'}</p></section><section><b>놓친 단서</b><p>{asText(d.missedCue)||'미기록'}</p></section><section><b>교정 행동</b><p>{asText(d.correction)||'미기록'}</p></section><section><b>전이</b><p>{asText(d.transfer)||'미기록'}</p></section></>;
  if(item.targetType==='drill')return <><section><b>교정 행동</b><p>{asText(d.action)||'미기록'}</p></section><section><b>성공 기준</b><p>{asText(d.successCriterion)||'미기록'}</p></section>{asText(d.reflection)&&<section><b>이전 회고</b><p>{asText(d.reflection)}</p></section>}</>;
  return <><section><b>자료</b><p>{[asText(d.examName),asText(d.sourceName),asText(d.questionNumber)&&`${asText(d.questionNumber)}번`].filter(Boolean).join(' · ')||'—'}</p></section><section><b>핵심 기록</b><p>{asText(d.memo)||asText(d.conditionSummary)||asText(d.mainIdea)||'미기록'}</p></section>{asText(d.firstThought)&&<section><b>첫 생각</b><p>{asText(d.firstThought)}</p></section>}{asText(d.bottleneck)&&<section><b>병목</b><p>{asText(d.bottleneck)}</p></section>}{asText(d.transfer)&&<section><b>전이</b><p>{asText(d.transfer)}</p></section>}</>;
}

export default function UnifiedReviewQueue({targetType,onCounts}:{targetType?:TargetType;onCounts?:(counts:ReviewQueueResponse['counts'])=>void}){
  const [queue,setQueue]=useState<ReviewQueueResponse|null>(null),[selected,setSelected]=useState<ReviewQueueItem|null>(null),[notes,setNotes]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const ref=useRef<HTMLElement>(null);useDialogFocus(Boolean(selected),ref,()=>{if(!busy)setSelected(null)});
  const load=async()=>{setLoading(true);setError('');try{const value=await archiveApi<ReviewQueueResponse>('/api/learning-intelligence/reviews?view=queue');setQueue(value);onCounts?.(value.counts);setSelected(current=>current?[...value.overdue,...value.today,...value.upcoming].find(item=>item.id===current.id)??null:null)}catch(reason){setError(reason instanceof Error?reason.message:'Review Queue를 불러오지 못했습니다.')}finally{setLoading(false)}};
  useEffect(()=>{void load()},[]);
  const groups=useMemo(()=>{
    const filter=(items:ReviewQueueItem[])=>targetType?items.filter(item=>item.targetType===targetType):items;
    return [
      {id:'overdue',title:'Overdue',description:'예정일이 지난 Review',items:filter(queue?.overdue??[])},
      {id:'today',title:'Today',description:'현재 학습일에 처리할 Review',items:filter(queue?.today??[])},
      {id:'upcoming',title:'Upcoming',description:'앞으로 예정된 Review',items:filter(queue?.upcoming??[])},
    ];
  },[queue,targetType]);
  const complete=async(result:'success'|'fail')=>{if(!selected||busy)return;setBusy(true);setError('');try{await archiveApi(`/api/learning-intelligence/reviews/${encodeURIComponent(selected.id)}`,'PATCH',{result,notes});setSelected(null);setNotes('');await load()}catch(reason){setError(reason instanceof Error?reason.message:'Review 결과 저장에 실패했습니다.')}finally{setBusy(false)}};
  const open=(item:ReviewQueueItem)=>{setSelected(item);setNotes(item.notes??'')};
  if(loading&&!queue)return <p className="review-queue-loading">Review Queue를 불러오는 중…</p>;
  return <div className="unified-review-queue">{error&&<p className="team-error" role="alert">{error} <button className="button small" onClick={()=>void load()}>다시 시도</button></p>}
    <div className="review-queue-summary"><div><span>Overdue</span><strong>{groups[0].items.length}</strong></div><div><span>Today</span><strong>{groups[1].items.length}</strong></div><div><span>Upcoming</span><strong>{groups[2].items.length}</strong></div><button className="button" disabled={loading} onClick={()=>void load()}><RotateCcw size={15}/>새로고침</button></div>
    {groups.map(group=><section className="review-queue-group" key={group.id}><div className="section-title"><div><h2>{group.title}</h2><small>{group.description}</small></div><span>{group.items.length}개</span></div>{group.items.length?<div className="review-queue-list">{group.items.map(item=><button className="review-queue-row" onClick={()=>open(item)} key={item.id}><span className="review-queue-type">{item.subject||'과목 미지정'} · {typeLabel[item.targetType]}</span><span className="review-queue-main"><b>{item.title}</b><small>{item.reason}</small></span><span className="review-queue-state"><small>{item.scheduledAt?.slice(0,10)||'오늘'}</small><em>{resultLabel(item.previousResult)}</em>{item.priority>0&&<b>P{item.priority}</b>}</span><ChevronRight size={17}/></button>)}</div>:<Empty title={`${group.title} Review가 없습니다.`} description={group.id==='today'?'오늘 처리할 복습이 없습니다.':'현재 조건에 해당하는 Review가 없습니다.'}/>}</section>)}
    {selected&&<div className="sheet-backdrop" onClick={()=>{if(!busy)setSelected(null)}}><aside ref={ref} tabIndex={-1} className="detail-sheet review-detail-sheet" role="dialog" aria-modal="true" aria-labelledby="review-detail-title" onClick={event=>event.stopPropagation()}><header><div><span className="card-label">{selected.subject||'학습'} · {typeLabel[selected.targetType]}</span><h2 id="review-detail-title">{selected.title}</h2><p>{selected.scheduledAt?`예정 ${selected.scheduledAt.slice(0,10)}`:'일정 미지정'} · 이전 결과 {resultLabel(selected.previousResult)}</p></div><button className="icon-button" aria-label="Review 닫기" disabled={busy} onClick={()=>setSelected(null)}><X/></button></header><div className="sheet-content review-detail-content"><DetailContent item={selected}/>{selected.notes&&<section><b>예약 메모</b><p>{selected.notes}</p></section>}<Field label="이번 Review 메모"><TextArea value={notes} onChange={setNotes} placeholder="무엇이 재현됐고, 무엇이 다시 막혔는지 짧게 기록"/></Field><div className="review-result-actions"><button className="button" disabled={busy} onClick={()=>void complete('fail')}><Clock3 size={15}/>재현 실패</button><button className="button primary" disabled={busy} onClick={()=>void complete('success')}><Check size={15}/>재현 성공</button></div></div></aside></div>}
  </div>;
}
