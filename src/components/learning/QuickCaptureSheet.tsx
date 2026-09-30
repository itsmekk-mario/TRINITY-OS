import { useEffect, useState } from 'react';
import { ImagePlus, Trash2, X } from 'lucide-react';
import type { AppData, DrillBottleneck, Subject, WrongAnswerImage } from '../../types';
import { archiveApi, type CoreRule } from '../../lib/archiveApi';
import { toDateKey } from '../../lib/date';
import { autoSyncCloudflareData, fetchCloudflareData, loadCloudflareConfig, rememberCloudflareSyncBaseline, uploadCloudflareData } from '../../lib/cloudflare';
import { classifyWrongAnswer, suggestCoreRules } from '../../lib/drillClassification';
import { TextArea } from '../Ui';
import { SUBJECTS } from '../../data/config';
import { deleteProblemImage, prepareProblemImage, releasePreparedProblemImage, uploadProblemImage, type PreparedProblemImage } from '../../lib/problemImage';
import ProblemImageView from './ProblemImageView';

const DRILL_BOTTLENECKS: DrillBottleneck[]=['발문·해석','개념 공백','계산 실수','시간 관리','전략·판단','기타'];

export default function QuickCaptureSheet({open,data,update,onClose}:{open:boolean;data:AppData;update:(fn:(value:AppData)=>AppData)=>void;onClose:()=>void}){
 const [subject,setSubject]=useState<Subject>('수학'),[source,setSource]=useState(''),[question,setQuestion]=useState(''),[wrongJudgment,setWrongJudgment]=useState(''),[missedCue,setMissedCue]=useState(''),[correction,setCorrection]=useState(''),[nextAction,setNextAction]=useState(''),[bottleneck,setBottleneck]=useState<DrillBottleneck>('전략·판단'),[ruleId,setRuleId]=useState(''),[rules,setRules]=useState<CoreRule[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false),[requestId,setRequestId]=useState(()=>crypto.randomUUID());
 const [problemImage,setProblemImage]=useState<PreparedProblemImage|null>(null),[uploadedImage,setUploadedImage]=useState<WrongAnswerImage|null>(null),[imageBusy,setImageBusy]=useState(false),[imageError,setImageError]=useState('');
 useEffect(()=>{if(open)void archiveApi<{rules:CoreRule[]}>('/api/archive/rules').then(value=>setRules(value.rules)).catch(()=>setRules([]))},[open]);
 useEffect(()=>{if(open){setSaved(false);setError('');setImageError('');setUploadedImage(null);setRequestId(crypto.randomUUID())}},[open]);
 const input={subject,source,question,wrongJudgment,missedCue,correction,nextAction},suggestion=classifyWrongAnswer(input),ruleSuggestions=suggestCoreRules(rules,input);
 const attachImage=async(file?:File)=>{if(!file)return;setImageBusy(true);setImageError('');try{const prepared=await prepareProblemImage(file);if(problemImage)releasePreparedProblemImage(problemImage);setProblemImage(prepared);setUploadedImage(null)}catch(cause){setImageError(cause instanceof Error?cause.message:'사진 첨부에 실패했습니다.')}finally{setImageBusy(false)}};
 const closeSheet=()=>{if(busy)return;if(problemImage)releasePreparedProblemImage(problemImage);if(uploadedImage&&!saved)void deleteProblemImage(uploadedImage).catch(()=>undefined);setProblemImage(null);setUploadedImage(null);setImageError('');onClose()};
 const submit=async()=>{
  if(busy)return;setBusy(true);setError('');setImageError('');
  try{
   const config=loadCloudflareConfig();
   if(config.userId===undefined)throw new Error('로그인 후 다시 시도해 주세요.');
   const synced=await autoSyncCloudflareData(data,config.userId);
   if(synced.action==='conflict')throw new Error(synced.reason||'동기화 충돌을 해결한 후 다시 시도해 주세요.');
   if(synced.action==='disabled')throw new Error('서버 연결을 확인해 주세요.');
   const result=await archiveApi<{data:AppData;wrongAnswerId:string}>('/api/learning-intelligence/quick-capture','POST',{requestId,subject,coreRuleId:ruleId||undefined,wrongAnswer:{date:toDateKey(),source,question,wrongJudgment,missedCue,correction,nextAction,bottleneck}});
   const remote=await fetchCloudflareData(config);
   if(!remote.data?.wrongAnswerDrills.some(item=>item.id===result.wrongAnswerId))throw new Error('저장된 오답을 서버에서 확인하지 못했습니다.');
   let remoteImage=uploadedImage;
   if(problemImage&&!remoteImage){remoteImage=await uploadProblemImage(problemImage);setUploadedImage(remoteImage);releasePreparedProblemImage(problemImage);setProblemImage(null)}
   let next=remote.data, revision=remote.updatedAt??null;
   if(remoteImage){next={...next,wrongAnswerDrills:next.wrongAnswerDrills.map(item=>item.id===result.wrongAnswerId?{...item,problemImage:remoteImage!}:item)};const saved=await uploadCloudflareData(next,config,{expectedUpdatedAt:revision});revision=saved.updatedAt??null}
   rememberCloudflareSyncBaseline(config.userId,next,revision);
   update(()=>next);setSaved(true);
  }catch(cause){setError(cause instanceof Error?cause.message:'저장에 실패했습니다.')}finally{setBusy(false)}
 };
 if(!open)return null;const code=subject==='국어'?'korean':subject==='수학'?'math':subject==='영어'?'english':subject==='통사'?'social_studies':subject==='통과'?'integrated_science':null;
 return <div className="sheet-backdrop" onClick={()=>!busy&&closeSheet()}><aside className="detail-sheet quick-capture-sheet" role="dialog" aria-modal="true" aria-label="빠른 오답 기록" onClick={event=>event.stopPropagation()}><header><div><span className="eyebrow">QUICK CAPTURE</span><h2>빠른 오답 기록</h2><p>판단 오류와 다음 행동만 기록하면 3·7·14일 재도전이 생성됩니다.</p></div><button className="icon-button" aria-label="닫기" onClick={closeSheet}><X/></button></header><div className="sheet-content">{saved?<section><h3>오답 기록 완료</h3><p>재도전 일정과 선택한 Core Rule 연결을 저장했습니다.</p><button className="button primary" onClick={closeSheet}>완료</button></section>:<><label>과목<select value={subject} onChange={event=>{setSubject(event.target.value as Subject);setRuleId('')}}>{SUBJECTS.map(value=><option key={value}>{value}</option>)}</select></label><label>출처<input value={source} onChange={event=>setSource(event.target.value)} placeholder="뉴런 수2 Theme 9"/></label><label>문항<input value={question} onChange={event=>setQuestion(event.target.value)} placeholder="21번"/></label><label>문제 사진 (선택)<div className="quick-problem-image">{problemImage?<><img src={problemImage.previewUrl} alt="문제 사진"/><div><small>{Math.round(problemImage.size/1024)}KB · 업로드 대기</small><button type="button" className="text-button" onClick={()=>{releasePreparedProblemImage(problemImage);setProblemImage(null)}}>사진 삭제</button></div></>:uploadedImage?<><ProblemImageView image={uploadedImage} alt="업로드된 문제 사진"/><div><small>Supabase Storage 업로드 완료</small><button type="button" className="text-button" onClick={()=>{void deleteProblemImage(uploadedImage);setUploadedImage(null)}}>사진 삭제</button></div></>:<label className="problem-image-drop compact"><ImagePlus size={16}/><b>{imageBusy?'압축 중…':'사진 선택'}</b><small>사진은 AppData가 아니라 private Storage에 저장됩니다.</small><input type="file" accept="image/*" hidden disabled={imageBusy} onChange={event=>{void attachImage(event.target.files?.[0]);event.currentTarget.value='';}}/></label>}{imageError&&<span className="team-error">{imageError}</span>}</div></label><label>잘못된 판단<TextArea value={wrongJudgment} onChange={setWrongJudgment}/></label><label>놓친 단서<TextArea value={missedCue} onChange={setMissedCue}/></label><label>교정 기준<TextArea value={correction} onChange={setCorrection}/></label><label>다음 행동<TextArea value={nextAction} onChange={setNextAction}/></label><section className="quick-capture-suggestion"><b>추천 병목 · {suggestion.primary}</b><p>{suggestion.rationale}</p><button className="button small" type="button" onClick={()=>setBottleneck(suggestion.primary)}>적용</button></section><label>병목<select value={bottleneck} onChange={event=>setBottleneck(event.target.value as DrillBottleneck)}>{DRILL_BOTTLENECKS.map(value=><option key={value}>{value}</option>)}</select></label><label>Core Rule 연결 (선택)<select value={ruleId} onChange={event=>setRuleId(event.target.value)}><option value="">연결 안 함</option>{rules.filter(rule=>rule.subject===code).map(rule=><option key={rule.id} value={rule.id}>{rule.title}</option>)}</select></label>{ruleSuggestions.length>0&&<section className="quick-capture-suggestion"><b>추천 Core Rule</b>{ruleSuggestions.map(({rule})=><button type="button" className="text-button" key={rule.id} onClick={()=>setRuleId(rule.id)}>{rule.title} 적용</button>)}</section>}{error&&<p role="alert" className="team-error">{error}</p>}<button className="button primary" disabled={busy||!source.trim()||!question.trim()||!wrongJudgment.trim()||!missedCue.trim()||!correction.trim()} onClick={()=>void submit()}>{busy?'저장 중…':'저장'}</button></>}</div></aside></div>;
}
