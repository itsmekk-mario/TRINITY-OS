import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import type { AppData, DrillBottleneck, Subject } from '../../types';
import { DRILL_BOTTLENECKS } from '../../lib/drillClassification';
import { archiveApi, type ArchiveEntry, type ArchivePage, type ArchiveSubject, type CoreRule } from '../../lib/archiveApi';
import { toDateKey } from '../../lib/date';
import { loadCloudflareConfig, uploadCloudflareData } from '../../lib/cloudflare';
import { Field, TextArea } from '../Ui';
import { useDialogFocus } from '../motion/useDialogFocus';

type QuickCaptureResponse={
  ok:boolean;requestId:string;wrongAnswerId:string;coreRuleId:string|null;archiveEntryId:string|null;reviewId:string|null;drillId:string|null;
  data:AppData;recovered?:boolean;
};
const archiveSubject=(subject:Subject):ArchiveSubject|null=>subject==='국어'?'korean':subject==='수학'?'math':subject==='영어'?'english':null;
const blank=()=>({subject:'수학' as Subject,date:toDateKey(),source:'',question:'',wrongJudgment:'',missedCue:'',correction:'',bottleneck:'전략·판단' as DrillBottleneck,nextAction:''});

export default function QuickCaptureSheet({open,data,update,onClose}:{open:boolean;data:AppData;update:(fn:(value:AppData)=>AppData)=>void;onClose:()=>void}){
  const [form,setForm]=useState(blank()),[requestId,setRequestId]=useState(()=>crypto.randomUUID()),[advanced,setAdvanced]=useState(false);
  const [coreMode,setCoreMode]=useState<'none'|'existing'|'new'>('none'),[coreRuleId,setCoreRuleId]=useState(''),[coreSearch,setCoreSearch]=useState(''),[newRuleTitle,setNewRuleTitle]=useState(''),[newRuleContent,setNewRuleContent]=useState('');
  const [archiveId,setArchiveId]=useState(''),[archiveSearch,setArchiveSearch]=useState(''),[reviewEnabled,setReviewEnabled]=useState(false),[reviewDate,setReviewDate]=useState(toDateKey()),[reviewNotes,setReviewNotes]=useState('');
  const [drillEnabled,setDrillEnabled]=useState(false),[drillTitle,setDrillTitle]=useState(''),[drillMinutes,setDrillMinutes]=useState(15);
  const [rules,setRules]=useState<CoreRule[]>([]),[entries,setEntries]=useState<ArchiveEntry[]>([]),[busy,setBusy]=useState(false),[loadingLinks,setLoadingLinks]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<QuickCaptureResponse|null>(null);
  const ref=useRef<HTMLElement>(null);useDialogFocus(open,ref,()=>{if(!busy)onClose()});
  useEffect(()=>{if(!open)return;let live=true;setLoadingLinks(true);setError('');void Promise.all([
    archiveApi<{rules:CoreRule[]}>('/api/archive/rules'),archiveApi<ArchivePage>('/api/archive/entries?limit=100')
  ]).then(([r,a])=>{if(live){setRules(r.rules);setEntries(a.entries)}}).catch(reason=>{if(live)setError(reason instanceof Error?reason.message:'연결 가능한 학습 기록을 불러오지 못했습니다.')}).finally(()=>{if(live)setLoadingLinks(false)});return()=>{live=false}},[open]);
  const code=archiveSubject(form.subject);
  const subjectRules=useMemo(()=>rules.filter(rule=>rule.subject===code&&(!coreSearch.trim()||`${rule.title} ${rule.content} ${rule.tags.join(' ')}`.toLocaleLowerCase('ko-KR').includes(coreSearch.trim().toLocaleLowerCase('ko-KR')))),[rules,code,coreSearch]);
  const subjectEntries=useMemo(()=>entries.filter(entry=>entry.subject===code&&(!archiveSearch.trim()||`${entry.title} ${entry.examName} ${entry.sourceName} ${entry.questionNumber}`.toLocaleLowerCase('ko-KR').includes(archiveSearch.trim().toLocaleLowerCase('ko-KR')))),[entries,code,archiveSearch]);
  const reset=()=>{setForm(blank());setRequestId(crypto.randomUUID());setAdvanced(false);setCoreMode('none');setCoreRuleId('');setCoreSearch('');setNewRuleTitle('');setNewRuleContent('');setArchiveId('');setArchiveSearch('');setReviewEnabled(false);setReviewDate(toDateKey());setReviewNotes('');setDrillEnabled(false);setDrillTitle('');setDrillMinutes(15);setError('');setResult(null)};
  const submit=async()=>{if(busy||!form.date||(!form.source.trim()&&!form.question.trim()))return;setBusy(true);setError('');try{
    // AppData is locally authoritative between auto-sync ticks. Flush the current snapshot first so
    // Quick Capture never replaces newer local plans/sessions with an older server snapshot.
    await uploadCloudflareData(data,loadCloudflareConfig());
    const payload={requestId,subject:form.subject,wrongAnswer:{date:form.date,source:form.source,question:form.question,wrongJudgment:form.wrongJudgment,missedCue:form.missedCue,correction:form.correction,bottleneck:form.bottleneck,nextAction:form.nextAction},
      coreRule:coreMode==='existing'?{mode:'existing',id:coreRuleId}:coreMode==='new'?{mode:'new',title:newRuleTitle,content:newRuleContent,tags:[]}:{mode:'none'},
      archive:archiveId?{mode:'existing',id:archiveId}:{mode:'none'},review:{enabled:reviewEnabled,scheduledAt:reviewEnabled?reviewDate:undefined,notes:reviewNotes},
      drill:{enabled:drillEnabled,title:drillTitle||form.nextAction||form.correction,date:form.date,estimatedMinutes:drillMinutes}};
    const response=await archiveApi<QuickCaptureResponse>('/api/learning-intelligence/quick-capture','POST',payload);update(()=>response.data);setResult(response);
  }catch(reason){setError(reason instanceof Error?reason.message:'빠른 오답 기록에 실패했습니다.')}finally{setBusy(false)}};
  if(!open)return null;
  return <div className="sheet-backdrop quick-capture-backdrop" onClick={()=>{if(!busy)onClose()}}><aside ref={ref} tabIndex={-1} className="detail-sheet quick-capture-sheet" role="dialog" aria-modal="true" aria-labelledby="quick-capture-title" onClick={event=>event.stopPropagation()}>
    <header><div><span className="card-label">QUICK CAPTURE</span><h2 id="quick-capture-title">빠른 오답 기록</h2><p>오류 → Core Rule → 다음 행동만 빠르게 연결합니다.</p></div><button className="icon-button" aria-label="닫기" disabled={busy} onClick={onClose}><X/></button></header>
    <div className="sheet-content">{result?<section className="quick-capture-success"><span className="card-label">SAVED</span><h3>오답 기록을 저장했습니다.</h3><p>{[result.coreRuleId&&'Core Rule 연결',result.archiveEntryId&&'Archive 연결',result.reviewId&&'Review 예약',result.drillId&&'Drill 생성'].filter(Boolean).join(' · ')||'Wrong Answer 저장'}</p>{result.recovered&&<small>이전 요청을 안전하게 복구해 중복 없이 완료했습니다.</small>}<div className="split-actions"><button className="button" onClick={reset}>새 기록</button><button className="button primary" onClick={onClose}>완료</button></div></section>:<>
      {error&&<p className="team-error" role="alert">{error}</p>}
      <div className="form-grid two"><Field label="과목"><select value={form.subject} onChange={event=>{setForm({...form,subject:event.target.value as Subject});setCoreRuleId('');setArchiveId('')}}><option>국어</option><option>수학</option><option>영어</option><option>탐구</option></select></Field><Field label="날짜"><input type="date" value={form.date} onChange={event=>setForm({...form,date:event.target.value})}/></Field><Field label="문제 / 자료"><input placeholder="뉴런 Theme 9, TRUSS 15회…" value={form.source} onChange={event=>setForm({...form,source:event.target.value})}/></Field><Field label="문항"><input placeholder="22번 / 251120" value={form.question} onChange={event=>setForm({...form,question:event.target.value})}/></Field></div>
      <Field label="잘못된 판단"><TextArea value={form.wrongJudgment} onChange={wrongJudgment=>setForm({...form,wrongJudgment})} placeholder="왜 그 판단을 했는지 한 문장"/></Field><Field label="놓친 단서"><TextArea value={form.missedCue} onChange={missedCue=>setForm({...form,missedCue})} placeholder="조건·발문·표상 중 놓친 것"/></Field><Field label="교정 행동"><TextArea value={form.correction} onChange={correction=>setForm({...form,correction})} placeholder="다음 문제에서 먼저 할 행동"/></Field>
      <div className="form-grid two"><Field label="병목"><select value={form.bottleneck} onChange={event=>setForm({...form,bottleneck:event.target.value as DrillBottleneck})}>{DRILL_BOTTLENECKS.map(item=><option key={item}>{item}</option>)}</select></Field><Field label="다음 행동"><input value={form.nextAction} onChange={event=>setForm({...form,nextAction:event.target.value})} placeholder="관련 기출 2문제 재풀이"/></Field></div>
      <Field label="Core Rule"><select value={coreMode} onChange={event=>setCoreMode(event.target.value as typeof coreMode)} disabled={!code}><option value="none">연결 안 함</option><option value="existing">기존 Rule</option><option value="new">새 Rule</option></select></Field>
      {coreMode==='existing'&&<div className="quick-link-picker"><label className="quick-search"><Search size={14}/><input aria-label="Core Rule 검색" placeholder="Core Rule 검색" value={coreSearch} onChange={event=>setCoreSearch(event.target.value)}/></label><Field label="기존 Core Rule"><select value={coreRuleId} onChange={event=>setCoreRuleId(event.target.value)} disabled={loadingLinks}><option value="">선택</option>{subjectRules.map(rule=><option value={rule.id} key={rule.id}>{rule.title}</option>)}</select></Field></div>}
      {coreMode==='new'&&<><Field label="새 Rule 제목"><input value={newRuleTitle} onChange={event=>setNewRuleTitle(event.target.value)} placeholder="재현할 판단 기준"/></Field><Field label="새 Rule 내용"><TextArea value={newRuleContent} onChange={setNewRuleContent} placeholder="다음 문제에서 그대로 실행할 규칙"/></Field></>}
      <button className="button quick-advanced-toggle" type="button" aria-expanded={advanced} onClick={()=>setAdvanced(value=>!value)}><ChevronDown size={15}/>{advanced?'추가 학습 설정 접기':'추가 학습 설정'}</button>
      {advanced&&<div className="quick-advanced"><div className="quick-link-picker"><label className="quick-search"><Search size={14}/><input aria-label="Learning Archive 검색" placeholder="Archive 검색" value={archiveSearch} onChange={event=>setArchiveSearch(event.target.value)}/></label><Field label="Learning Archive 연결"><select value={archiveId} onChange={event=>setArchiveId(event.target.value)} disabled={!code||loadingLinks}><option value="">연결 안 함</option>{subjectEntries.map(entry=><option value={entry.id} key={entry.id}>{entry.studiedAt.slice(0,10)} · {entry.title}{entry.questionNumber?` · ${entry.questionNumber}번`:''}</option>)}</select></Field></div>
        <label className="check-row"><input type="checkbox" checked={reviewEnabled} onChange={event=>setReviewEnabled(event.target.checked)}/>Review 예약</label>{reviewEnabled&&<div className="form-grid two"><Field label="예정일"><input type="date" value={reviewDate} onChange={event=>setReviewDate(event.target.value)}/></Field><Field label="메모"><input value={reviewNotes} onChange={event=>setReviewNotes(event.target.value)} placeholder="왜 다시 볼지"/></Field></div>}
        <label className="check-row"><input type="checkbox" checked={drillEnabled} onChange={event=>setDrillEnabled(event.target.checked)}/>교정 Drill 생성</label>{drillEnabled&&<div className="form-grid two"><Field label="Drill 제목"><input value={drillTitle} onChange={event=>setDrillTitle(event.target.value)} placeholder={form.nextAction||form.correction||'교정 Drill'}/></Field><Field label="예상 시간"><input type="number" min="0" max="1440" value={drillMinutes} onChange={event=>setDrillMinutes(Number(event.target.value)||0)}/></Field></div>}</div>}
      <button className="button primary quick-capture-submit" disabled={busy||!form.date||(!form.source.trim()&&!form.question.trim())||(coreMode==='existing'&&!coreRuleId)||(coreMode==='new'&&(!newRuleTitle.trim()||!newRuleContent.trim()))} onClick={()=>void submit()}>{busy?'저장 중…':'저장'}</button>
      </>}</div>
  </aside></div>;
}
