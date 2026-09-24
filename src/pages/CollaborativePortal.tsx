import { useEffect, useState } from 'react';
import { KeyRound, LogOut, RefreshCw, X } from 'lucide-react';
import { loadCloudflareConfig } from '../lib/cloudflare';
import type { Feedback } from '../lib/feedback';
import type { Subject } from '../types';
import type { TeacherRole, TeacherSignal } from '../lib/teacherSignals';
import { recentRange, type DateRange, type TeacherData } from '../lib/teacherAnalytics';
import { Card, Empty, Field, PageHeader } from '../components/Ui';
import SegmentedControl from '../components/navigation/SegmentedControl';
import MathTeacherDashboard from '../components/teacher/MathTeacherDashboard';
import LearningManagerDashboard from '../components/teacher/LearningManagerDashboard';
import HomeroomDashboard from '../components/teacher/HomeroomDashboard';
import { InterventionEditor, type FeedbackDraft } from '../components/teacher/shared';
type Auth={url:string;token:string;role:TeacherRole};
type Assignment={id:string;student_id:string;student_name?:string;subject?:Subject;role:TeacherRole;permissions?:{createFeedback?:boolean}};
const base=(url:string)=>url.replace(/\/+$/,'');
async function api<T>(auth:Auth,path:string,method='GET',body?:unknown,signal?:AbortSignal):Promise<T>{
  const response=await fetch(base(auth.url)+path,{method,signal,headers:{Authorization:`Bearer ${auth.token}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const value=await response.json() as T&{error?:string};
  if(!response.ok)throw new Error(value.error||`요청 실패 (${response.status})`);
  return value;
}
export default function CollaborativePortal({role, subjectHint}:{role:TeacherRole; subjectHint?:Subject}){
  const key=`trinity-collab:${role}`,saved=loadCloudflareConfig();
  const [auth,setAuth]=useState<Auth|null>(()=>{try{const value=JSON.parse(sessionStorage.getItem(key)||'null');return value?.role===role&&value?.token?value:null;}catch{return null;}});
  const [url,setUrl]=useState(auth?.url||saved.url),[username,setUsername]=useState(''),[password,setPassword]=useState('');
  const [assignments,setAssignments]=useState<Assignment[]>([]),[selected,setSelected]=useState(''),[showList,setShowList]=useState(false);
  const [data,setData]=useState<TeacherData|null>(null),[feedback,setFeedback]=useState<Feedback[]>([]),[loadedStudent,setLoadedStudent]=useState(''),[syncedAt,setSyncedAt]=useState('');
  const [loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState(''),[revision,setRevision]=useState(0);
  const [passwordOpen,setPasswordOpen]=useState(false),[currentPassword,setCurrentPassword]=useState(''),[newPassword,setNewPassword]=useState(''),[confirmPassword,setConfirmPassword]=useState('');
  const [period,setPeriod]=useState('14'),[range,setRange]=useState<DateRange>(()=>recentRange(14));
  const [intervention,setIntervention]=useState<{item:Feedback;kind:'weekly'|'daily'}>();
  const [archive,setArchive]=useState<Array<{id:string;subject:string;title:string;studiedAt:string;masteryStatus:string;category?:string;annotations:Array<{color:string}>;coreRules:Array<{id:string;title:string;content:string}>}>|null>(null);
  useEffect(()=>{
    if(!auth)return;
    const controller=new AbortController();setLoading(true);setError('');
    api<{assignments:Assignment[]}>(auth,'/api/collab/dashboard','GET',undefined,controller.signal).then(value=>{const visible=value.assignments.filter(item=>!subjectHint||item.subject===subjectHint);setAssignments(visible.filter((item,index,all)=>all.findIndex(other=>other.student_id===item.student_id)===index));setSelected(current=>visible.some(item=>item.student_id===current)?current:visible[0]?.student_id??'');}).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'담당 학생 조회 실패');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[auth?.token,subjectHint]);
  useEffect(()=>{
    setData(null);setFeedback([]);setLoadedStudent('');setSyncedAt('');setIntervention(undefined);
    if(!auth||!selected)return;
    const controller=new AbortController();setLoading(true);setError('');
    const studentPath=`/api/collab/students/${encodeURIComponent(selected)}`;
    Promise.all([api<{data:TeacherData|null;syncedAt?:string}>(auth,studentPath+'/data','GET',undefined,controller.signal),api<{feedback:Feedback[]}>(auth,studentPath+'/feedback','GET',undefined,controller.signal)]).then(([student,notes])=>{setData(student.data);setSyncedAt(student.syncedAt??'');setFeedback(notes.feedback);setLoadedStudent(selected);}).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'학습 데이터 조회 실패');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[auth?.token,selected,revision]);
  const assignment=assignments.find(item=>item.student_id===selected);
  const canFeedback=role==='academic_manager'||assignment?.permissions?.createFeedback===true;
  const submit=async(draft:FeedbackDraft)=>{
    if(!auth||!assignment||busy)return;
    setBusy(true);setError('');
    try{await api(auth,`/api/collab/students/${encodeURIComponent(selected)}/feedback`,'POST',{...draft,status:draft.signal?.priority==='high'?'needs_improvement':'normal'});setSuccess('판단과 제안을 전달했습니다.');setRevision(value=>value+1);}
    catch(reason){throw reason;}finally{setBusy(false);}
  };
  const updateSignal=async(item:Feedback,body:Record<string,unknown>)=>{
    if(!auth||busy)return;setBusy(true);setError('');
    try{await api(auth,`/api/collab/students/${encodeURIComponent(selected)}/signals/${encodeURIComponent(item.id)}`,'PATCH',body);setRevision(value=>value+1);}
    finally{setBusy(false);}
  };
  const signalAction=(item:Feedback,action:'weekly'|'daily'|'resolved'|'dismissed')=>{
    if(action==='weekly'||action==='daily')setIntervention({item,kind:action});
    else void updateSignal(item,{status:action}).catch(reason=>setError(reason instanceof Error?reason.message:'상태 변경 실패'));
  };
  const login=async(event:React.FormEvent)=>{
    event.preventDefault();setBusy(true);setError('');
    try{const response=await api<{token:string;role?:string}>({url,token:'',role},'/api/support/login','POST',{username,password,role});const next={url:base(url),token:response.token,role};sessionStorage.setItem(key,JSON.stringify(next));setAuth(next);setPassword('');}
    catch(reason){setError(reason instanceof Error?reason.message:'로그인 실패');}finally{setBusy(false);}
  };
  const changePassword=async(event:React.FormEvent)=>{event.preventDefault();if(!auth||busy)return;if(newPassword.length<9){setError('새 비밀번호는 9자 이상이어야 합니다.');return;}if(newPassword!==confirmPassword){setError('새 비밀번호가 일치하지 않습니다.');return;}setBusy(true);setError('');try{await api(auth,'/api/support/change-password','POST',{currentPassword,newPassword});setSuccess('비밀번호를 변경했습니다.');setCurrentPassword('');setNewPassword('');setConfirmPassword('');setPasswordOpen(false);}catch(reason){setError(reason instanceof Error?reason.message:'비밀번호 변경 실패');}finally{setBusy(false);}};
  const title=role==='academic_manager'?'담임 대시보드':`${subjectHint??assignment?.subject??'교과'} Intelligence`;
  const openArchive=async()=>{if(!auth||!selected)return;setLoading(true);setError('');try{const value=await api<{entries:NonNullable<typeof archive>}>(auth,`/api/collab/students/${encodeURIComponent(selected)}/archive`);setArchive(value.entries);}catch(reason){setError(reason instanceof Error?reason.message:'Archive 조회 실패')}finally{setLoading(false)}};
  if(!auth)return <main className="team-page teacher-login"><PageHeader eyebrow="TEACHER ACCESS" title={role==='academic_manager'?'담임 선생님':`${subjectHint??'교과'} Intelligence`} description={role==='academic_manager'?'학생을 선택하고 학습 시간, 계획, 목표, 실모 기록을 확인합니다.':`${subjectHint??'교과'} 학습 기록과 반복되는 병목을 분석합니다.`}/><form className="team-panel" onSubmit={login}><Field label="Worker 주소"><input required type="url" value={url} onChange={e=>setUrl(e.target.value)}/></Field><Field label="아이디"><input required autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)}/></Field><Field label="비밀번호"><input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></Field><button className="button primary" disabled={busy}>{busy?'로그인 중…':'로그인'}</button></form>{error&&<p role="alert" className="team-error">{error}</p>}</main>;
  return <main className={`team-page learning-shell teacher-page teacher-${role}`}><header className="teacher-page-heading"><div><p className="eyebrow">HOMEROOM</p><h1>{role==='academic_manager'?'담임 대시보드':'담당 학생 대시보드'}</h1><p>학생별 학습 시간, 계획 실행, 주간·월간 목표와 실모 기록을 확인합니다.</p></div><div className="teacher-actions"><button className="button" disabled={loading||busy} onClick={()=>setRevision(value=>value+1)}><RefreshCw size={15}/>새로고침</button><button className="button" onClick={()=>setPasswordOpen(true)}><KeyRound size={15}/>비밀번호 변경</button><button className="button" onClick={()=>{sessionStorage.removeItem(key);setAuth(null);setAssignments([]);setSelected('');setData(null);setFeedback([]);}}><LogOut size={15}/>로그아웃</button></div></header>
    <section className="teacher-context" aria-label="학생 컨텍스트"><div><button type="button" className="text-button" onClick={()=>setShowList(value=>!value)}>← 학생 목록</button><strong>{assignment?.student_name??'담당 학생'}</strong><small>{assignment?.subject??'전체 과목'} · 최근 Sync {syncedAt?new Date(syncedAt).toLocaleString():'확인 불가'}</small>{role!=='academic_manager'&&<button className="text-button" onClick={()=>void openArchive()}>Archive · Core Rules 읽기 전용 →</button>}</div><Field label="학생 선택"><select value={selected} disabled={busy} onChange={e=>{setSuccess('');setArchive(null);setSelected(e.target.value);}}>{assignments.map(item=><option key={item.id} value={item.student_id}>{item.student_name??item.student_id} · {item.subject??'전체 과목'}</option>)}</select></Field><div><SegmentedControl label="학습 기간 선택" options={[{id:'7',label:'7일'},{id:'14',label:'14일'},{id:'30',label:'30일'},{id:'custom',label:'직접 설정'}]} value={period} onChange={value=>{setPeriod(value);if(value!=='custom')setRange(recentRange(Number(value)));}}/>{period==='custom'&&<div className="teacher-form-pair"><Field label="시작일"><input type="date" value={range.start} max={range.end} onChange={e=>{if(e.target.value&&e.target.value<=range.end)setRange({...range,start:e.target.value});}}/></Field><Field label="종료일"><input type="date" value={range.end} min={range.start} onChange={e=>{if(e.target.value&&e.target.value>=range.start)setRange({...range,end:e.target.value});}}/></Field></div>}<small>{range.start} — {range.end}</small></div></section>
    {archive&&<Card><div className="section-title"><h2>Learning Archive · 읽기 전용</h2><button className="text-button" onClick={()=>setArchive(null)}>닫기</button></div>{archive.length?archive.map(entry=><details key={entry.id}><summary>{entry.studiedAt?.slice(0,10)} · {entry.title} · {entry.masteryStatus}</summary><p>{entry.category||'미분류'} · Annotation {entry.annotations.length}개</p>{entry.coreRules.map(rule=><p key={rule.id}><b>{rule.title}</b><br/>{rule.content}</p>)}</details>):<p>Archive 기록이 없습니다.</p>}</Card>}
    {error&&<div role="alert" className="team-error">{error}<button className="button" onClick={()=>setRevision(value=>value+1)}>다시 시도</button></div>}{success&&<p role="status">{success}</p>}
    {showList?<Card><h2>담당 학생</h2>{assignments.map(item=><button className="row-link" key={item.id} disabled={busy} onClick={()=>{setSelected(item.student_id);setShowList(false);}}>{item.student_name??item.student_id} · {item.subject??'전체 과목'} →</button>)}</Card>:loading?<section className="teacher-loading" aria-live="polite" aria-busy="true">학습 기록을 불러오는 중…</section>:!assignment?<Empty title="연결된 담당 학생이 없습니다." description="관리자에게 담당 배정을 요청하세요."/>:loadedStudent===selected&&data?<div className="teacher-homeroom-layout" key={selected}><HomeroomDashboard data={data} range={range}/></div>:!error?<Empty title="동기화된 학습 기록이 없습니다." description="학생의 Sync가 완료되면 실제 학습 기록을 확인할 수 있습니다."/>:null}
    {intervention&&<InterventionEditor item={intervention.item} kind={intervention.kind} busy={busy} onClose={()=>setIntervention(undefined)} onSave={async value=>{await updateSignal(intervention.item,intervention.kind==='weekly'?{weeklyGoal:value}:{dailyDrill:value});setSuccess('목표·Drill 초안을 전달했습니다. 학생 피드백함에서 최종 확인 후 생성합니다.');}}/>}
    {passwordOpen&&<div className="teacher-password-backdrop" onClick={()=>setPasswordOpen(false)}><form className="teacher-password-dialog" onSubmit={changePassword} onClick={event=>event.stopPropagation()}><header><div><span className="card-label">ACCOUNT SECURITY</span><h2>비밀번호 변경</h2></div><button type="button" className="icon-button" aria-label="닫기" onClick={()=>setPasswordOpen(false)}><X size={18}/></button></header><Field label="현재 비밀번호"><input type="password" autoComplete="current-password" required value={currentPassword} onChange={event=>setCurrentPassword(event.target.value)}/></Field><Field label="새 비밀번호 · 9자 이상"><input type="password" autoComplete="new-password" minLength={9} required value={newPassword} onChange={event=>setNewPassword(event.target.value)}/></Field><Field label="새 비밀번호 확인"><input type="password" autoComplete="new-password" minLength={9} required value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)}/></Field><button className="button primary" disabled={busy}>변경 저장</button></form></div>}
  </main>;
}
