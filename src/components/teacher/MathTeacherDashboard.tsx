import { useMemo, useState } from 'react';
import type { Subject } from '../../types';
import type { Feedback } from '../../lib/feedback';
import { mathAnalytics, subjectScore, type DateRange, type TeacherData } from '../../lib/teacherAnalytics';
import { Card, Empty, SectionTitle } from '../Ui';
import SegmentedControl from '../navigation/SegmentedControl';
import { FeedbackComposer, FeedbackHistory, Insight, SignalCards, type EvidenceTarget, type FeedbackDraft } from './shared';

import type { TeacherDashboardProps } from './types';
import { CapabilityPanel, DrillPanel, MockExamPanel, ProblemInspector, ResourcesPanel, WrongAnswerPatterns } from './MathPanels';
const tabs=['Overview','Capability','Bottlenecks','Mock Exams','Wrong Answers','Drill','Resources','Feedback'] as const;
type Tab=typeof tabs[number];
export default function MathTeacherDashboard(props:TeacherDashboardProps) {
  const {data,range,subject,feedback,busy,canFeedback,onFeedback,onSignalAction}=props;
  const [tab,setTab]=useState<Tab>('Overview'),[filter,setFilter]=useState('전체'),[target,setTarget]=useState<EvidenceTarget>(),[notice,setNotice]=useState('');
  const analysis=useMemo(()=>mathAnalytics(data,subject,range),[data,subject,range]);
  const inspect=(id:string,type:EvidenceTarget['type']='wrong_answer')=>{
    const wrong=data.wrongAnswerDrills.find(item=>item.id===id&&item.subject===subject);
    const score=data.scores.find(item=>item.id===id&&subjectScore(item,subject)!==undefined);
    if(type==='subject_progress'&&id===subject){setTarget({type,id,title:subject+' 학습 운영 근거',evidence:'학습량 · 성적 · Drill 비교를 통한 재진단 요청'});setNotice('');}
    else if(type==='wrong_answer'&&wrong){setTarget({type,id,title:wrong.question||wrong.source,evidence:`${wrong.date} · ${wrong.source} · ${wrong.bottleneck??'병목 미분류'}`});setNotice('');}
    else if(type==='mock_exam'&&score){setTarget({type,id,title:score.name,evidence:`${score.date} · ${subjectScore(score,subject)}점`});setNotice('');}
    else {setTab(type==='weekly_goal'?'Capability':type==='drill'?'Drill':'Overview');setNotice('연결 기록이 없거나 이 기록을 열람할 권한이 없습니다.');}
  };
  const evidence=(ref:string)=>{const index=ref.indexOf(':');inspect(ref.slice(index+1),ref.slice(0,index) as EvidenceTarget['type']);};
  const signals=<SignalCards items={feedback} role="subject_teacher" onAction={onSignalAction} onEvidence={evidence} busy={busy||!canFeedback}/>;
  const bottlenecks=<section><SectionTitle title="Current Bottleneck" meta="학생이 기록한 오류 분류 · 빈도순"/>{analysis.repeated.length?analysis.repeated.slice(0,3).map((pattern,index)=><button className="teacher-bottleneck" key={pattern.label} onClick={()=>{setFilter(pattern.label);setTab('Wrong Answers');}}><span>{index+1}</span><div><h3>{pattern.label}</h3><p>선택 기간 {pattern.records.length}회 · 관련 오답 확인 →</p></div></button>):<Empty title="아직 반복되는 오류 패턴이 없습니다." description="학생의 오답 분류와 재도전 기록이 쌓이면 여기에 병목 근거가 표시됩니다."/>}</section>;
  const patterns=data.access?.wrongAnswers===false?<Empty>오답 열람 권한이 없습니다.</Empty>:<WrongAnswerPatterns analysis={analysis} filter={filter} setFilter={setFilter} inspect={inspect}/>;
  const capability=<CapabilityPanel data={data} analysis={analysis} subject={subject} range={range}/>;
  const mock=data.access?.scores===false?<Empty>실모 · 성적 열람 권한이 없습니다.</Empty>:<MockExamPanel analysis={analysis} subject={subject} inspect={inspect}/>;
  const drill=data.access?.drills===false?<Empty>Drill 열람 권한이 없습니다.</Empty>:<DrillPanel data={data} analysis={analysis} feedback={feedback}/>;
  const resources=<ResourcesPanel data={data} subject={subject}/>;
  const diagnosis=feedback.find(item=>item.type==='subject'&&item.subject===subject&&item.progress==='active'&&item.bottleneck&&item.signal?.status!=='dismissed');
  const overview=<><Insight label="CURRENT DIAGNOSIS" title={diagnosis?`현재 교사 판단: ‘${diagnosis.bottleneck}’`:analysis.repeated[0]?`지금 먼저 확인할 병목은 ‘${analysis.repeated[0].label}’입니다.`:'현재 수학 병목을 판단할 기록이 부족합니다.'}><p>{diagnosis?`${diagnosis.teacher_name??'교과 선생님'} · ${diagnosis.created_at.slice(0,10)} · ${diagnosis.observation??'관련 오답 근거를 확인하세요.'}`:analysis.repeated[0]?`선택 기간 같은 분류의 오류가 ${analysis.repeated[0].records.length}회 기록되었습니다. 관련 근거를 검토해 진단을 확정하세요.`:'실모·오답·재도전 근거가 쌓이면 반복되는 병목을 먼저 보여줍니다.'}</p>{feedback.some(item=>item.signal?.targetRole==='subject_teacher'&&['open','accepted'].includes(item.signal.status))&&<button className="text-button" onClick={()=>setTab('Feedback')}>학습 선생님의 재진단 요청 확인 →</button>}<div className="teacher-facts"><span>실모 평균 <b>{data.access?.scores===false?'열람 권한 없음':analysis.average??'데이터 부족'}</b></span><span>오답 <b>{data.access?.wrongAnswers===false?'열람 권한 없음':analysis.wrong.length+'건'}</b></span><span>반복 분류 <b>{data.access?.wrongAnswers===false?'열람 권한 없음':analysis.repeated.length+'개'}</b></span><span>Drill 완료 <b>{data.access?.drills===false?'열람 권한 없음':analysis.drills.length?`${analysis.drills.filter(item=>item.done).length} / ${analysis.drills.length}`:'기록 없음'}</b></span></div></Insight><SignalCards items={feedback.filter(item=>item.signal&&['open','accepted'].includes(item.signal.status))} role='subject_teacher' onAction={onSignalAction} onEvidence={evidence} busy={busy||!canFeedback}/>{bottlenecks}<div className="teacher-support-grid">{mock}<Card><h3>Evidence → Diagnosis → Intervention</h3><p>오답의 잘못된 판단과 놓친 단서를 확인하고, 교정 행동과 성공 기준을 학습 선생님에게 전달하세요.</p><button className="button" onClick={()=>setTab('Wrong Answers')}>오답 근거 검토</button></Card></div></>;
  return <><nav><SegmentedControl label="Math Intelligence" options={tabs.map(id=>({id,label:id}))} value={tab} onChange={setTab} className="teacher-tabs"/></nav><div role="tabpanel" aria-label={tab}>{notice&&<p role="status">{notice}</p>}{tab==='Overview'?overview:tab==='Capability'?capability:tab==='Bottlenecks'?bottlenecks:tab==='Mock Exams'?mock:tab==='Wrong Answers'?patterns:tab==='Drill'?drill:tab==='Resources'?resources:<>{signals}{canFeedback?<FeedbackComposer role="subject_teacher" subject={subject} onSubmit={onFeedback} busy={busy}/>:<Empty>피드백 작성 권한이 없습니다.</Empty>}<FeedbackHistory items={feedback}/></>}</div>
  {target&&<ProblemInspector data={data} target={target} analysis={analysis} subject={subject} range={range} canFeedback={canFeedback} busy={busy} onFeedback={onFeedback} inspect={inspect} onClose={()=>setTarget(undefined)}/>}</>;
}
