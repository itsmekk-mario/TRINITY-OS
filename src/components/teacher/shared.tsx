import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Feedback, FeedbackContextType } from '../../lib/feedback';
import type { Subject } from '../../types';
import type { TeacherRole, TeacherSignal } from '../../lib/teacherSignals';
import { signalPriority, subjectList } from '../../lib/teacherSignals';
import { makeDailyDrill, makeWeeklyGoal } from '../../lib/feedbackDrafts';
import { Card, Empty, Field, SectionTitle, TextArea } from '../Ui';

export type FeedbackDraft = { title:string; observation:string; bottleneck:string; action:string; successCriterion:string; categories:string[]; contextType:FeedbackContextType; contextTargetId:string; signal?:TeacherSignal };
export type EvidenceTarget = { type:FeedbackContextType; id:string; title:string; evidence?:string };
export function StatusBadge({ value }: { value:string }) { return <span className={`teacher-status status-${value.toLowerCase()}`}>{value}</span>; }
export function Insight({ label, title, children }: { label:string; title:string; children?:ReactNode }) { return <section className="teacher-insight"><span className="eyebrow">{label}</span><h2>{title}</h2>{children}</section>; }
export function TeacherDialog({ title, onClose, children, inspector=false }: { title:string; onClose:()=>void; children:ReactNode; inspector?:boolean }) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const dialog=ref.current;const previous=document.activeElement as HTMLElement|null;dialog?.showModal();return()=>{dialog?.close();previous?.focus();};},[]);
  return <dialog ref={ref} className={inspector?'teacher-dialog teacher-inspector':'teacher-dialog'} aria-label={title} onCancel={onClose}><header><h2>{title}</h2><button className="button" type="button" autoFocus onClick={onClose} aria-label="닫기">닫기</button></header>{children}</dialog>;
}
export function FeedbackComposer({ role, subject, target, onSubmit, busy }: { role:TeacherRole; subject:Subject; target?:EvidenceTarget; onSubmit:(draft:FeedbackDraft)=>Promise<void>; busy:boolean }) {
  const [form,setForm]=useState({ title:target?.title??'', observation:target?.evidence??'', bottleneck:'', action:'', successCriterion:'', category:'조건', subject, priority:'medium' as TeacherSignal['priority'], sendSignal:true });
  const [error,setError]=useState(''),[proposal,setProposal]=useState<'weekly'|'daily'>();
  const compose=():FeedbackDraft=>({title:form.title,observation:form.observation,bottleneck:form.bottleneck,action:form.action,successCriterion:form.successCriterion,categories:[form.category],contextType:target?.type??'general',contextTargetId:target?.id??'',signal:form.sendSignal?{sourceRole:role,targetRole:role==='subject_teacher'?'academic_manager':'subject_teacher',subject:form.subject,priority:form.priority,type:role==='subject_teacher'?'diagnosis':'reassessment_request',evidenceRefs:target?.id?[target.type+':'+target.id]:[],status:'open'}:undefined});
  const send=async(draft:FeedbackDraft)=>{await onSubmit(draft);setForm(value=>({...value,title:'',observation:'',bottleneck:'',action:'',successCriterion:''}));};
  const current=compose();
  const preview:Feedback={id:'',type:role==='subject_teacher'?'subject':'academic_management',subject:form.subject,title:form.title,observation:form.observation,bottleneck:form.bottleneck,action:form.action,success_criterion:form.successCriterion,status:'normal',progress:'active',acknowledgedByStudent:false,created_at:'',signal:current.signal};
  return <Card className="teacher-composer"><h3>{role==='subject_teacher'?'Teacher Diagnosis':'학습 운영 판단'}</h3><p>Evidence → Diagnosis → Intervention · 학생 원본 기록은 변경하지 않습니다.</p><form onSubmit={async event=>{event.preventDefault();setError('');try{await send(compose());}catch(reason){setError(reason instanceof Error?reason.message:'전송 실패');}}}>
    <Field label="제목"><input required maxLength={160} value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></Field>
    <div className="teacher-form-pair"><Field label="Category"><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{['개념','조건','논리','계산','시간','문제 오독','재현성','실행'].map(value=><option key={value}>{value}</option>)}</select></Field><Field label="Priority"><select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value as TeacherSignal['priority']})}>{['high','medium','low'].map(value=><option key={value}>{value}</option>)}</select></Field></div>
    {role==='academic_manager'&&<Field label="진단 요청 과목"><select value={form.subject} onChange={e=>setForm({...form,subject:e.target.value as Subject})}>{subjectList.map(value=><option key={value}>{value}</option>)}</select></Field>}
    <Field label="Evidence · 관찰 내용"><TextArea value={form.observation} onChange={value=>setForm({...form,observation:value})}/></Field>
    <Field label="Diagnosis · 핵심 병목"><TextArea value={form.bottleneck} onChange={value=>setForm({...form,bottleneck:value})}/></Field>
    <Field label="Intervention · 교정 행동 / 제안"><TextArea value={form.action} onChange={value=>setForm({...form,action:value})}/></Field>
    <Field label="성공 기준"><TextArea value={form.successCriterion} onChange={value=>setForm({...form,successCriterion:value})}/></Field>
    <label className="teacher-check"><input type="checkbox" checked={form.sendSignal} onChange={e=>setForm({...form,sendSignal:e.target.checked})}/>{role==='subject_teacher'?'학습 선생님에게 Signal 전달':'과목 선생님에게 재진단 요청'}</label>
    {error&&<p role="alert" className="team-error">{error}</p>}<div className="teacher-actions"><button className="button primary" disabled={busy}>{busy?'전송 중…':form.sendSignal?'판단 · Signal 전송':'학생 피드백 전송'}</button>{role==='subject_teacher'&&<><button className="button" type="button" disabled={busy||!form.sendSignal} onClick={()=>setProposal('daily')}>Daily Drill 제안</button><button className="button" type="button" disabled={busy||!form.sendSignal} onClick={()=>setProposal('weekly')}>Weekly Goal 제안</button></>}</div>
  </form>{proposal&&<InterventionEditor item={preview} kind={proposal} busy={busy} onClose={()=>setProposal(undefined)} onSave={async value=>{const draft=compose();if(!draft.signal)throw new Error('Signal 전달을 선택하세요.');await send({...draft,title:draft.title||('ability' in value?value.ability:value.title),signal:{...draft.signal,type:'intervention',...('weekStart' in value?{weeklyGoal:value}:{dailyDrill:value})}});}}/>}</Card>;
}

export function SignalCards({ items, role, onAction, onEvidence, busy }: { items:Feedback[]; role:TeacherRole; onAction:(item:Feedback,action:'weekly'|'daily'|'resolved'|'dismissed')=>void; onEvidence:(ref:string)=>void; busy:boolean }) {
  const signals=items.filter(item=>item.signal?.targetRole===role).slice().sort((a,b)=>Number(['resolved','dismissed'].includes(a.signal!.status))-Number(['resolved','dismissed'].includes(b.signal!.status))||signalPriority(a.signal!.priority)-signalPriority(b.signal!.priority)||b.created_at.localeCompare(a.created_at));
  return <section className="teacher-signals"><div className="section-title"><h2>{role==='academic_manager'?'Subject Teacher Signals':'Learning Manager Signals'}</h2><small>다른 선생님의 판단 → 다음 개입</small></div>{signals.length?signals.map(item=><Card key={item.id} className="teacher-signal"><div className="teacher-row-head"><span>{item.signal!.subject} · {item.teacher_name??'선생님'}</span><div><StatusBadge value={item.signal!.priority}/><StatusBadge value={item.signal!.status}/></div></div><h3>{item.title||item.bottleneck}</h3><p>{item.bottleneck}</p><details><summary>근거 · 권장 행동 · 성공 기준</summary><p>{item.observation||'관찰 기록 없음'}</p>{item.signal!.evidenceRefs.map(ref=><button type="button" className="text-button" key={ref} onClick={()=>onEvidence(ref)}>근거 기록 확인 · {ref.split(':')[0]}</button>)}<p><b>Recommended Intervention</b><br/>{item.action||'제안 없음'}</p><p><b>성공 기준</b><br/>{item.success_criterion||'기준 미기록'}</p></details><div className="teacher-evidence-links">{item.signal!.weeklyGoal&&<small>Weekly Goal 초안 · {item.linked_weekly_goal_id?'학생 반영 완료':'학생 확인 대기'}</small>}{item.signal!.dailyDrill&&<small>Daily Drill 초안 · {item.linked_daily_drill_id?'학생 반영 완료':'학생 확인 대기'}</small>}</div>{item.signal!.status!=='resolved'&&item.signal!.status!=='dismissed'&&<div className="teacher-actions"><button className="button" disabled={busy||Boolean(item.linked_weekly_goal_id)} onClick={()=>onAction(item,'weekly')}>Weekly Goal 반영</button><button className="button" disabled={busy||Boolean(item.linked_daily_drill_id)} onClick={()=>onAction(item,'daily')}>Daily Drill 제안</button><button className="text-button" disabled={busy} onClick={()=>onAction(item,'resolved')}>검토 완료</button><button className="text-button" disabled={busy} onClick={()=>onAction(item,'dismissed')}>보류</button></div>}</Card>):<Empty title="전달된 Teacher Signal이 없습니다." description="다른 선생님의 진단과 재진단 요청이 여기에 표시됩니다."/>}</section>;
}
export function InterventionEditor({ item, kind, onSave, onClose, student=false, busy=false }: { item:Feedback; kind:'weekly'|'daily'; onSave:(value:NonNullable<TeacherSignal['weeklyGoal']|TeacherSignal['dailyDrill']>)=>Promise<void>; onClose:()=>void; student?:boolean; busy?:boolean }) {
  const prior=kind==='weekly'?item.signal?.weeklyGoal:item.signal?.dailyDrill;
  const [initial]=useState(()=>kind==='weekly'?makeWeeklyGoal(item):makeDailyDrill(item));
  const [date,setDate]=useState('weekStart' in initial?initial.weekStart:initial.date);
  const [subject,setSubject]=useState<Subject>(item.signal?.subject??item.subject??'수학');
  const [title,setTitle]=useState(prior?('ability' in prior?prior.ability:prior.title):item.title??item.bottleneck??'');
  const [action,setAction]=useState(prior?('drillDesign' in prior?prior.drillDesign:prior.action):item.action??'');
  const [success,setSuccess]=useState(prior?.successCriterion??item.success_criterion??'');
  const [evidence,setEvidence]=useState(item.signal?.weeklyGoal?.evidence??item.observation??'');
  const [minutes,setMinutes]=useState(item.signal?.dailyDrill?.minutes??20);
  const [pending,setPending]=useState(false),[error,setError]=useState('');
  return <TeacherDialog title={kind==='weekly'?'Weekly Capability Goal':'Daily Drill'} onClose={onClose}><p>{student?'내용을 확인하고 자신의 학습 목표로 생성합니다.':'Signal의 제안을 초안으로 전달합니다. 학생이 최종 확인 후 생성합니다.'}</p><form onSubmit={async e=>{e.preventDefault();setPending(true);try{await onSave(kind==='weekly'?{weekStart:date,subject,ability:title,drillDesign:action,successCriterion:success,evidence}:{date,subject,title,action,successCriterion:success,minutes});onClose();}catch(reason){setError(reason instanceof Error?reason.message:'저장 실패');}finally{setPending(false);}}}>
    <Field label={kind==='weekly'?'주 시작일':'실행일'}><input type="date" required value={date} onChange={e=>setDate(e.target.value)}/></Field>
    <Field label="과목"><select value={subject} disabled={!student} onChange={e=>setSubject(e.target.value as Subject)}>{subjectList.map(value=><option key={value}>{value}</option>)}</select></Field>
    <Field label={kind==='weekly'?'능력 목표':'Drill 제목'}><input required maxLength={160} value={title} onChange={e=>setTitle(e.target.value)}/></Field>
    <Field label={kind==='weekly'?'Drill 설계':'교정 행동'}><TextArea value={action} onChange={setAction}/></Field>
    <Field label="성공 기준"><TextArea value={success} onChange={setSuccess}/></Field>
    {kind==='weekly'?<Field label="Evidence"><TextArea value={evidence} onChange={setEvidence}/></Field>:<Field label="훈련 시간 · 분"><input type="number" required min={1} max={360} value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/></Field>}
    {error&&<p className="team-error" role="alert">{error}</p>}<div className="teacher-actions"><button className="button" type="button" onClick={onClose}>취소</button><button className="button primary" disabled={pending||busy}>{pending?'저장 중…':student?'확인 후 생성':'초안 확인 · 학생에게 제안'}</button></div>
  </form></TeacherDialog>;
}

export function FeedbackHistory({ items }: { items:Feedback[] }) { return <Card><SectionTitle title="Feedback · Handoff History" meta={`${items.length}건`}/>{items.length?items.map(item=><details key={item.id}><summary>{item.title||'피드백'} · {item.created_at.slice(0,10)} · {item.signal?.status??item.progress}</summary><p>{item.observation}</p><p>{item.action}</p><p>{item.success_criterion}</p>{item.signal&&<small>{item.signal.sourceRole} → {item.signal.targetRole}</small>}</details>):<Empty>아직 전달한 피드백이 없습니다.</Empty>}</Card>; }
