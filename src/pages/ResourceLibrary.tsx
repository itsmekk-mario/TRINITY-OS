import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, BookOpen, Check, ChevronRight, Clock3, ExternalLink, FileText, Filter, Link2, Minus, Plus, Search, Upload, X, Download, Trash2 } from 'lucide-react';
import { archiveAllEntries, archiveApi, type ArchiveEntry, type CoreRule } from '../lib/archiveApi';
import type { AppData, Resource, Subject } from '../types';
import { loadCloudflareConfig } from '../lib/cloudflare';
import { toDateKey, uid } from '../lib/date';
import { emptyDay } from '../lib/planGraph';
import { Progress } from '../components/Ui';
import PdfViewer from '../components/PdfViewer';
import { SUBJECTS } from '../data/config';
import { normalizeResourceDueDate } from '../lib/resourceDeadline';

async function request(path:string,options:RequestInit={}) {
  const c=loadCloudflareConfig();
  const response=await fetch(`${c.url.replace(/\/$/,'')}/api/library${path}`,{...options,headers:{Authorization:`Bearer ${c.token}`,...options.headers}});
  if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||'자료실 요청 실패');}
  return response;
}

type Mode='mine'|'official';
type AddMode='resource'|'pdf'|'link'|null;

export default function ResourceLibrary({data,update}:{data:AppData;update:(fn:(v:AppData)=>AppData)=>void}) {
 const [mode,setMode]=useState<Mode>('mine');
 const [catalog,setCatalog]=useState<Resource[]>([]),[catalogReady,setCatalogReady]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[pdf,setPdf]=useState('');
 const [query,setQuery]=useState(''),[subjectFilter,setSubjectFilter]=useState(''),[examType,setExamType]=useState(''),[year,setYear]=useState(''),[month,setMonth]=useState(''),[documentType,setDocumentType]=useState('');
 const [selected,setSelected]=useState<string>(''),[addMode,setAddMode]=useState<AddMode>(null);
 const [name,setName]=useState(''),[group,setGroup]=useState(''),[source,setSource]=useState(''),[subject,setSubject]=useState<Subject>('수학'),[total,setTotal]=useState(1),[dueDate,setDueDate]=useState('');
 const [date,setDate]=useState(toDateKey()),[question,setQuestion]=useState(''),[entries,setEntries]=useState<ArchiveEntry[]>([]),[rules,setRules]=useState<CoreRule[]>([]),[linkType,setLinkType]=useState('learning_archive'),[linkId,setLinkId]=useState('');
 const task=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'자료실 오류');}finally{setBusy(false);}};
 const loadCatalog=()=>task(async()=>{setCatalog((await (await request('/catalog')).json()).resources);setCatalogReady(true);});
 useEffect(()=>{void loadCatalog();Promise.all([archiveAllEntries(),archiveApi<{rules:CoreRule[]}>('/api/archive/rules')]).then(([e,r])=>{setEntries(e);setRules(r.rules);}).catch(()=>{});},[]);
 useEffect(()=>()=>{if(pdf)URL.revokeObjectURL(pdf);},[pdf]);
 const patch=(id:string,values:Partial<Resource>)=>update(v=>({...v,resources:v.resources.map(r=>r.id===id?{...r,...values}:r)}));
 const filtered=useMemo(()=>{
   const sourceList=mode==='mine'?data.resources:catalog;
   return sourceList.filter(r=>(!query||`${r.name} ${r.subject} ${r.group} ${r.examType??''}`.toLowerCase().includes(query.toLowerCase()))&&(!subjectFilter||r.subject===subjectFilter)&&(!examType||r.examType===examType)&&(!year||String(r.examYear)===year)&&(!month||String(r.examMonth)===month)&&(!documentType||r.documentType===documentType));
 },[mode,data.resources,catalog,query,subjectFilter,examType,year,month,documentType]);
 const active=(mode==='mine'?data.resources:catalog).find(r=>r.id===selected) ?? filtered[0];
 useEffect(()=>{if(filtered.length&&!filtered.some(r=>r.id===selected))setSelected(filtered[0].id);if(!filtered.length)setSelected('');},[mode,query,subjectFilter,examType,year,month,documentType,filtered.length]);
 const resetForm=()=>{setName('');setGroup('');setSource('');setTotal(1);setDueDate('');setAddMode(null);};
 const examDocumentId=(r:Resource)=>r.officialId||(r.id.startsWith('exam:')?r.id.slice(5):undefined);
 const officialKey=(r:Resource)=>examDocumentId(r)||r.id;
 const fetchResourceFile=async(r:Resource)=>{
  const c=loadCloudflareConfig();
  const examId=examDocumentId(r);
  let response:Response;
  if(examId){
   response=await fetch(`${c.url.replace(/\/$/,'')}/api/exams/${encodeURIComponent(examId)}/file`,{
    headers:{Authorization:`Bearer ${c.token}`}
   });
  }else if(r.fileId){
   response=await request(`/files?id=${encodeURIComponent(r.fileId)}`);
  }else{
   throw new Error('연결된 PDF가 없습니다.');
  }
  if(!response.ok){
   const body=await response.json().catch(()=>({})) as {error?:string};
   throw new Error(body.error||'PDF 요청 실패');
  }
  return response;
 };
 const openResourcePdf=async(r:Resource)=>{
  const response=await fetchResourceFile(r);
  if(pdf)URL.revokeObjectURL(pdf);
  setPdf(URL.createObjectURL(await response.blob()));
 };
 const downloadResourcePdf=async(r:Resource)=>{
  const response=await fetchResourceFile(r);
  const blob=await response.blob();
  const href=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  const clean=(r.name||'TRINITY').replace(/[\\/:*?"<>|]+/g,'_').trim()||'TRINITY';
  anchor.href=href;
  anchor.download=clean.toLowerCase().endsWith('.pdf')?clean:`${clean}.pdf`;
  anchor.style.display='none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(()=>URL.revokeObjectURL(href),2000);
 };
 const deleteResource=async(r:Resource)=>{
  const message=r.fileId
   ? `"${r.name}"을 삭제할까요? 업로드한 PDF 파일도 서버에서 함께 삭제됩니다.`
   : `"${r.name}"을 내 자료실에서 삭제할까요?`;
  if(!window.confirm(message))return;

  if(r.fileId){
   await request(`/files?id=${encodeURIComponent(r.fileId)}`,{method:'DELETE'});
  }

  if(pdf){
   URL.revokeObjectURL(pdf);
   setPdf('');
  }

  update(v=>({
   ...v,
   resources:v.resources.filter(item=>item.id!==r.id),
   sessions:v.sessions.map(session=>session.resourceId===r.id?{...session,resourceId:undefined}:session),
   wrongAnswerDrills:v.wrongAnswerDrills.map(item=>item.resourceId===r.id?{...item,resourceId:undefined}:item),
   calendar:Object.fromEntries(Object.entries(v.calendar).map(([key,entry])=>[
    key,
    {...entry,plans:entry.plans?.map(plan=>plan.resourceId===r.id?{...plan,resourceId:undefined}:plan)}
   ]))
  }));
  setSelected('');
 };
 const addOfficial=(r:Resource)=>{
  const key=officialKey(r);
  update(v=>({...v,resources:v.resources.some(x=>x.officialId===key)?v.resources:[...v.resources,{...r,id:uid(),officialId:key,status:'\uBBF8\uC2DC\uC791'}]}));
 };
 const addLocal=()=>{if(!name.trim())return;const due=normalizeResourceDueDate(dueDate);const r:Resource={id:uid(),subject,group,name:name.trim(),sourceUrl:source||undefined,total:Math.max(1,total),done:0,status:'미시작',...(due?{dueDate:due}:{})};update(v=>({...v,resources:[...v.resources,r]}));resetForm();setSelected(r.id);};
 const progress=(r:Resource,delta:number)=>patch(r.id,{done:Math.max(0,Math.min(Math.max(1,r.total),r.done+delta))});
 const sessions=active&&mode==='mine'?data.sessions.filter(s=>s.resourceId===active.id):[];
 const seconds=sessions.reduce((n,s)=>n+s.seconds,0),wrongs=active&&mode==='mine'?data.wrongAnswerDrills.filter(w=>w.resourceId===active.id):[];
 const archiveCount=active?.links?.filter(l=>l.targetType==='learning_archive').length??0,ruleCount=active?.links?.filter(l=>l.targetType==='core_rule').length??0;
 const relatedOptions=linkType==='learning_archive'?entries:linkType==='core_rule'?rules:data.scores.map(s=>({id:s.id,title:s.name}));
 return <div className="library-workspace">
   <div className="library-commandbar">
     <div className="library-mode" role="tablist" aria-label="자료실 종류"><button role="tab" aria-selected={mode==='mine'} className={mode==='mine'?'active':''} onClick={()=>setMode('mine')}>내 자료실 <span>{data.resources.length}</span></button><button role="tab" aria-selected={mode==='official'} className={mode==='official'?'active':''} onClick={()=>setMode('official')}>공용 기출 <span>{catalog.length}</span></button></div>
     <div className="library-command-actions">{mode==='mine'?<><button className="button" onClick={()=>setAddMode('resource')}><Plus size={15}/>자료</button><button className="button" onClick={()=>setAddMode('pdf')}><Upload size={15}/>PDF</button><button className="button" onClick={()=>setAddMode('link')}><Link2 size={15}/>링크</button></>:<a className="button" href="https://www.ebsi.co.kr/ebs/xip/xipc/previousPaperList.ebs" target="_blank" rel="noreferrer"><ExternalLink size={15}/>EBSi 기출</a>}</div>
   </div>
   {error&&<div className="library-alert" role="alert"><AlertCircle size={17}/><span>{error}</span><button aria-label="닫기" onClick={()=>setError('')}><X size={15}/></button></div>}
   <div className="library-filters"><label className="library-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="자료명, 과목, 분류 검색"/></label><div className="library-filter-row"><Filter size={14}/><select value={subjectFilter} onChange={e=>setSubjectFilter(e.target.value)}><option value="">전체 과목</option>{SUBJECTS.map(s=><option key={s}>{s}</option>)}</select><select value={examType} onChange={e=>setExamType(e.target.value)}><option value="">전체 시험</option>{['학력평가','모의평가','수능'].map(t=><option key={t}>{t}</option>)}</select><input inputMode="numeric" value={year} onChange={e=>setYear(e.target.value.replace(/\D/g,'').slice(0,4))} placeholder="학년도"/><input inputMode="numeric" value={month} onChange={e=>setMonth(e.target.value.replace(/\D/g,'').slice(0,2))} placeholder="월"/><select value={documentType} onChange={e=>setDocumentType(e.target.value)}><option value="">전체 문서</option>{['문제지','정답','해설'].map(t=><option key={t}>{t}</option>)}</select></div></div>
   <div className="library-layout">
     <section className="library-list" aria-label="자료 목록">{!catalogReady&&mode==='official'?<div className="library-empty">공용 자료를 불러오는 중…</div>:filtered.length?filtered.map(r=>{const pct=Math.round((r.done/Math.max(1,r.total))*100);return <button key={r.id} className={`library-list-item ${active?.id===r.id?'active':''}`} onClick={()=>setSelected(r.id)}><span className={`subject-badge ${r.subject}`}>{r.subject}</span><span className="library-list-copy"><b>{r.name}</b><small>{[r.examYear,r.examType||r.group,r.examMonth?`${r.examMonth}월`:'',r.documentType].filter(Boolean).join(' · ')||'분류 없음'}</small></span>{mode==='mine'&&<span className="library-list-progress">{pct}%</span>}<ChevronRight size={16}/></button>}):<div className="library-empty"><BookOpen/><b>조건에 맞는 자료가 없습니다.</b><span>{mode==='mine'?'자료 또는 PDF를 추가해 시작하세요.':'관리자가 등록한 공식 자료가 여기에 표시됩니다.'}</span></div>}</section>
     <aside className="library-detail">{active?<><div className="library-detail-head"><div><span className={`subject-badge ${active.subject}`}>{active.subject}</span><h2>{active.name}</h2><p>{[active.examYear,active.examType||active.group,active.examMonth?`${active.examMonth}월`:'',active.documentType].filter(Boolean).join(' · ')||'개인 학습 자료'}</p></div>{active.sourceUrl&&<a className="icon-button" href={active.sourceUrl} target="_blank" rel="noreferrer" aria-label="원본 열기"><ExternalLink size={17}/></a>}</div>
       {mode==='official'?<div className="library-official-action"><p>{'\uACF5\uC2DD \uC790\uB8CC\uB97C \uBC14\uB85C \uC5F4\uAC70\uB098 \uB0B4 \uD559\uC2B5 \uADF8\uB798\uD504\uC5D0 \uCD94\uAC00\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.'}</p><div className="library-primary-actions"><button className="button primary" disabled={busy||!examDocumentId(active)} onClick={()=>void task(()=>openResourcePdf(active))}><FileText size={15}/>{'PDF \uC5F4\uAE30'}</button><button className="button" disabled={busy||!examDocumentId(active)} onClick={()=>void task(()=>downloadResourcePdf(active))}><Download size={15}/>다운로드</button><button className="button" disabled={data.resources.some(x=>x.officialId===officialKey(active))} onClick={()=>addOfficial(active)}>{data.resources.some(x=>x.officialId===officialKey(active))?<><Check size={16}/>{'\uCD94\uAC00\uB428'}</>:<><Plus size={16}/>{'\uB0B4 \uC790\uB8CC\uC2E4\uC5D0 \uCD94\uAC00'}</>}</button></div></div>:<>
       <div className="library-status-row"><label><span>학습 상태</span><select value={active.status??'미시작'} onChange={e=>patch(active.id,{status:e.target.value})}>{['미시작','진행 중','풀이 완료','오답 분석 중','복기 완료'].map(s=><option key={s}>{s}</option>)}</select></label><div className="library-stepper"><button onClick={()=>progress(active,-1)} disabled={!active.done}><Minus size={15}/></button><strong>{active.done}<small> / {active.total}</small></strong><button onClick={()=>progress(active,1)} disabled={active.done>=active.total}><Plus size={15}/></button></div></div>
       <Progress value={active.done} max={Math.max(1,active.total)}/>
       <dl className="library-metrics"><div><dt><Clock3/>학습</dt><dd>{Math.floor(seconds/60)}분</dd></div><div><dt>Wrong</dt><dd>{wrongs.length}</dd></div><div><dt>Archive</dt><dd>{archiveCount}</dd></div><div><dt>Core Rule</dt><dd>{ruleCount}</dd></div></dl>
       {sessions.length>0&&<p className="library-history">첫 학습 {[...sessions].sort((a,b)=>a.date.localeCompare(b.date))[0].date} · 최근 {[...sessions].sort((a,b)=>b.date.localeCompare(a.date))[0].date}</p>}
       <div className="library-primary-actions">{(active.fileId||examDocumentId(active))&&<><button className="button primary" disabled={busy} onClick={()=>void task(()=>openResourcePdf(active))}><FileText size={15}/>{'PDF \uC5F4\uAE30'}</button><button className="button" disabled={busy} onClick={()=>void task(()=>downloadResourcePdf(active))}><Download size={15}/>다운로드</button></>}<button className="button" onClick={()=>update(v=>{const entry=v.calendar[date]??emptyDay(date);return {...v,calendar:{...v.calendar,[date]:{...entry,plans:[...(entry.plans??[]),{id:uid(),subject:active.subject,title:active.name,detail:'',quantity:'',done:false,resourceId:active.id}]}}};})}><Plus size={15}/>Daily Plan</button><button className="button library-delete-button" disabled={busy} onClick={()=>void task(()=>deleteResource(active))}><Trash2 size={15}/>삭제</button></div>
       <details className="library-connect" open><summary>Learning Graph 연결</summary><div className="library-connect-grid"><label><span>대상 날짜</span><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label><span>오답 문항</span><div className="inline-action"><input value={question} onChange={e=>setQuestion(e.target.value)} placeholder="예: 14"/><button disabled={!question.trim()} onClick={()=>{update(v=>({...v,wrongAnswerDrills:[{id:uid(),date,subject:active.subject,source:active.name,question:question.trim(),resourceId:active.id,wrongJudgment:'',missedCue:'',correction:'',transfer:''},...v.wrongAnswerDrills]}));setQuestion('');}}>생성</button></div></label><label><span>기록 종류</span><select value={linkType} onChange={e=>{setLinkType(e.target.value);setLinkId('');}}>{['learning_archive','core_rule','mock_exam'].map(t=><option key={t} value={t}>{t==='learning_archive'?'Learning Archive':t==='core_rule'?'Core Rule':'Mock Exam'}</option>)}</select></label><label><span>연결할 기록</span><div className="inline-action"><select value={linkId} onChange={e=>setLinkId(e.target.value)}><option value="">선택</option>{relatedOptions.map(r=><option key={r.id} value={r.id}>{r.title}</option>)}</select><button disabled={!linkId} onClick={()=>patch(active.id,{links:[...(active.links??[]).filter(l=>!(l.targetType===linkType&&l.targetId===linkId)),{targetType:linkType,targetId:linkId},...(linkType==='learning_archive'?(entries.find(e=>e.id===linkId)?.coreRules??[]).map(rule=>({targetType:'core_rule',targetId:rule.id})):[])]})}>연결</button></div></label></div></details></>}
     </>:<div className="library-empty detail"><BookOpen/><b>자료를 선택하세요.</b></div>}</aside>
   </div>
   {addMode&&<div className="sheet-backdrop" onClick={()=>setAddMode(null)}><aside className="detail-sheet library-add-sheet" role="dialog" aria-modal="true" aria-labelledby="library-add-title" onClick={e=>e.stopPropagation()}><header><div><p className="eyebrow">ADD RESOURCE</p><h2 id="library-add-title">{addMode==='pdf'?'개인 PDF 업로드':addMode==='link'?'링크 자료 추가':'학습 자료 추가'}</h2></div><button className="icon-button" aria-label="닫기" onClick={()=>setAddMode(null)}><X/></button></header><div className="sheet-content"><div className="form-grid"><label><span>자료명</span><input value={name} onChange={e=>setName(e.target.value)} placeholder={addMode==='pdf'?'비워두면 파일명 사용':'자료명'}/></label><div className="form-grid two"><label><span>과목</span><select value={subject} onChange={e=>setSubject(e.target.value as Subject)}>{SUBJECTS.map(s=><option key={s}>{s}</option>)}</select></label><label><span>분류</span><input value={group} onChange={e=>setGroup(e.target.value)} placeholder="예: 수1 · 기출"/></label></div>{addMode!=='pdf'&&<><label><span>자료 링크 {addMode==='link'?'':'(선택)'}</span><input type="url" required={addMode==='link'} value={source} onChange={e=>setSource(e.target.value)} placeholder="https://"/></label><div className="form-grid two"><label><span>총 분량</span><input type="number" min="1" value={total} onChange={e=>setTotal(Math.max(1,Number(e.target.value)||1))}/></label><label><span>마감일 (선택)</span><input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label></div><button className="button primary" disabled={!name.trim()||busy} onClick={addLocal}><Plus size={16}/>자료 추가</button></>}{addMode==='pdf'&&<label className="pdf-drop"><Upload/><b>PDF 선택</b><span>20MB 이하 · 개인 비공개 저장</span><input type="file" accept="application/pdf" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(!file)return;void task(async()=>{if(file.size>20*1024*1024)throw new Error('PDF는 20MB 이하여야 합니다.');const result=await (await request(`/files?name=${encodeURIComponent(file.name)}`,{method:'POST',headers:{'Content-Type':'application/pdf'},body:file})).json();const r:Resource={id:uid(),subject,group:group||'개인 PDF',name:name.trim()||file.name,total:1,done:0,fileId:result.id,status:'미시작'};update(v=>({...v,resources:[...v.resources,r]}));setSelected(r.id);resetForm();});e.target.value='';}}/></label>}</div></div></aside></div>}
   {pdf&&<PdfViewer url={pdf} title={active?.name??'PDF'} onClose={()=>{URL.revokeObjectURL(pdf);setPdf('');}}/>}
 </div>;
}
