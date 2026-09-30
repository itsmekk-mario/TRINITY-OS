import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ArrowRight, BookOpenCheck, Check, CheckCircle2, Clock3, RotateCcw, Sparkles, Target } from 'lucide-react';
import type { AppData, CalendarPlan } from '../types';
import { Empty, PageHeader, Progress } from '../components/Ui';
import { formatKoreanDate, formatMinutes, getCurrentStudyDay, toDateKey, weekStartKey } from '../lib/date';
import { deriveLearningSignals } from '../lib/learningSignals';
import { parsePlannedMinutes } from '../lib/plannedTime';
import { formatResourceDeadline, normalizeResourceDueDate, sortResourcesByDeadline } from '../lib/resourceDeadline';
import { archiveApi, type ActiveCoreRule } from '../lib/archiveApi';

type ReviewItem={id:string;targetType:'wrong_answer'|'core_rule'|'drill'|'learning_item';title:string;reason:string;scheduledAt:string;priority:number};
type ReviewQueue={overdue:ReviewItem[];today:ReviewItem[];upcoming:ReviewItem[];counts:{overdue:number;today:number;upcoming:number}};

const outcomeOf = (item: CalendarPlan) => item.outcome ?? (item.done ? 'achieved' : 'planned');

function LearningLoop({ review, rules, busy, reviewError, ruleError, onOpenQueue, onBegin, onReload }:{
  review:ReviewQueue|null; rules:ActiveCoreRule[]; busy:boolean; reviewError:string; ruleError:string;
  onOpenQueue:()=>void; onBegin:(rule:ActiveCoreRule)=>void; onReload:()=>void;
}) {
  const reviewItem=review?.overdue[0]??review?.today[0];
  const rule=rules[0];
  const dueCount=(review?.counts.overdue??0)+(review?.counts.today??0);
  return <section className="today-loop" aria-labelledby="today-loop-title">
    <div className="today-section-head compact"><div><p className="card-label">LEARNING LOOP</p><h2 id="today-loop-title">오늘 닫아야 할 루프</h2></div><button className="text-button" onClick={reviewError||ruleError?onReload:onOpenQueue}>{reviewError||ruleError?'다시 불러오기':'Review Queue'}<ArrowRight size={15}/></button></div>
    <div className="today-loop-grid">
      <button className={`today-loop-card ${reviewError?'error':''}`} onClick={reviewError?onReload:onOpenQueue}>
        <span className="today-loop-icon"><RotateCcw size={17}/></span><span><small>REVIEW</small><b>{reviewError?'Review를 불러오지 못했습니다':reviewItem?.title??'오늘 Review 없음'}</b><em>{reviewError?'재시도':dueCount?`${dueCount}개 처리 필요`:'Queue clear'}</em></span><ArrowRight size={16}/>
      </button>
      <button className={`today-loop-card ${ruleError?'error':''}`} disabled={busy} onClick={ruleError?onReload:rule?()=>onBegin(rule):onOpenQueue}>
        <span className="today-loop-icon"><Target size={17}/></span><span><small>CORE RULE</small><b>{ruleError?'Core Rule을 불러오지 못했습니다':rule?.title??'우선 Core Rule 없음'}</b><em>{ruleError?'재시도':rule?'오늘 한 번 적용해서 검증':'Archive에서 규칙을 연결하세요'}</em></span><ArrowRight size={16}/>
      </button>
    </div>
  </section>;
}

export default function Dashboard({ data, update, navigate }: { data: AppData; update: (fn: (value: AppData) => AppData) => void; navigate: (page: string) => void }) {
  const today=toDateKey();
  const analytics=useMemo(()=>deriveLearningSignals(data,new Date(`${today}T12:00:00`)),[data,today]);
  const [showCompleted,setShowCompleted]=useState(false);
  const [review,setReview]=useState<ReviewQueue|null>(null),[activeRules,setActiveRules]=useState<ActiveCoreRule[]>([]);
  const [reviewError,setReviewError]=useState(''),[ruleError,setRuleError]=useState(''),[reviewingRuleId,setReviewingRuleId]=useState('');
  const loadLearningExecution=async()=>{
    setReviewError('');setRuleError('');
    const [queueResult,rulesResult]=await Promise.allSettled([
      archiveApi<ReviewQueue>('/api/learning-intelligence/reviews?view=queue'),
      archiveApi<{rules:ActiveCoreRule[]}>('/api/learning-intelligence/active-rules?limit=3'),
    ]);
    if(queueResult.status==='fulfilled')setReview(queueResult.value);else{setReview(null);setReviewError(queueResult.reason instanceof Error?queueResult.reason.message:'Review Queue를 불러오지 못했습니다.');}
    if(rulesResult.status==='fulfilled')setActiveRules(rulesResult.value.rules.slice(0,3));else{setActiveRules([]);setRuleError(rulesResult.reason instanceof Error?rulesResult.reason.message:'Core Rule을 불러오지 못했습니다.');}
  };
  useEffect(()=>{void loadLearningExecution();},[]);
  const beginCoreRuleReview=async(rule:ActiveCoreRule)=>{
    if(reviewingRuleId)return;setReviewingRuleId(rule.id);setRuleError('');
    try{await archiveApi('/api/learning-intelligence/reviews','POST',{targetType:'core_rule',targetId:rule.id,reviewType:'today_core_rule',scheduledAt:`${getCurrentStudyDay()}T06:00:00+09:00`,result:'pending'});await loadLearningExecution();navigate('review:queue');}
    catch(cause){setRuleError(cause instanceof Error?cause.message:'Core Rule Review를 시작하지 못했습니다.');}
    finally{setReviewingRuleId('');}
  };

  const todayPlans=data.calendar[today]?.plans??[];
  const incomplete=todayPlans.filter(item=>outcomeOf(item)!=='achieved').sort((a,b)=>({high:0,normal:1,low:2}[a.priority??'normal']-({high:0,normal:1,low:2}[b.priority??'normal'])));
  const completed=todayPlans.filter(item=>outcomeOf(item)==='achieved');
  const next=incomplete[0];
  const targetMinutes=parsePlannedMinutes(next?.quantity);
  const completionRate=todayPlans.length?Math.round(completed.length/todayPlans.length*100):0;
  const reviewDue=(review?.counts.overdue??0)+(review?.counts.today??0);
  const currentMonth=today.slice(0,7),weekStart=weekStartKey();
  const monthHasPlan=data.monthlyPlans.some(item=>item.month===currentMonth);
  const weekHasPlan=Object.values(data.calendar).some(day=>day.date>=weekStart&&day.date<=today&&(day.plans?.length??0)>0);
  const planEntryView=!monthHasPlan?'plan:monthly':!weekHasPlan?'plan:weekly':'plan:day';

  const countdown=useMemo(()=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(data.examDate))return null;
    const days=Math.round((new Date(`${data.examDate}T00:00:00`).getTime()-new Date(`${today}T00:00:00`).getTime())/86_400_000);
    return Number.isFinite(days)?days===0?'D-DAY':days>0?`D-${days}`:`D+${Math.abs(days)}`:null;
  },[data.examDate,today]);

  const personalTasks=data.notionPages.flatMap(page=>page.blocks.filter(block=>block.type==='todo').map(block=>({page:page.title,block,date:block.status==='postponed'&&block.postponedTo?block.postponedTo:block.date??today})));
  const todayPersonalTasks=personalTasks.filter(item=>item.date===today);
  const upcomingPersonalTask=personalTasks.filter(item=>(item.block.status??(item.block.checked?'done':'open'))!=='done'&&item.date>=today).sort((a,b)=>a.date.localeCompare(b.date))[0];
  const personalDaysAway=upcomingPersonalTask?Math.round((Date.parse(`${upcomingPersonalTask.date}T00:00:00`)-Date.parse(`${today}T00:00:00`))/86_400_000):null;
  const resourceDeadlines=useMemo(()=>sortResourcesByDeadline((data.resources??[]).filter(resource=>!resource.total||resource.done<resource.total).filter(resource=>Boolean(normalizeResourceDueDate(resource.dueDate)))).slice(0,4),[data.resources]);

  const togglePlan=(id:string)=>update(value=>{
    const entry=value.calendar[today];if(!entry)return value;
    return {...value,calendar:{...value.calendar,[today]:{...entry,plans:(entry.plans??[]).map(item=>item.id===id?{...item,done:outcomeOf(item)!=='achieved',outcome:outcomeOf(item)==='achieved'?undefined:'achieved',updatedAt:new Date().toISOString()}:item)}}};
  });

  const planRow=(item:CalendarPlan)=><button key={item.id} className={`today-task-row ${outcomeOf(item)}`} onClick={()=>togglePlan(item.id)} aria-pressed={outcomeOf(item)==='achieved'}>
    <span className="today-task-check">{outcomeOf(item)==='achieved'?<Check size={15}/>:<span/>}</span><span className={`subject-badge ${item.subject}`}>{item.subject}</span><span className="today-task-copy"><b>{item.title}</b><small>{item.detail||'세부 내용 없음'}</small></span><em>{item.quantity||'—'}</em>
  </button>;

  return <div className="today-page today-command-center">
    <PageHeader eyebrow="TODAY" title={formatKoreanDate(new Date(`${today}T12:00:00`))} action={<div className="today-header-badges">{upcomingPersonalTask&&<span className="personal-dday">{personalDaysAway===0?'오늘':`D-${personalDaysAway}`} · {upcomingPersonalTask.block.content||'개인 일정'}</span>}{countdown&&<span className="exam-indicator">수능 {countdown}</span>}</div>}/>

    <section className="today-hero" aria-labelledby="today-next-title">
      <div className="today-hero-main"><p className="card-label">NEXT ACTION</p><h2 id="today-next-title">{next?.title??(todayPlans.length?'오늘 계획 완료':'오늘의 첫 학습을 설계하세요')}</h2><p>{next?`${next.subject} · ${targetMinutes?`목표 ${targetMinutes}분`:next.quantity||'목표량 미설정'}`:todayPlans.length?'Review와 Core Rule을 닫고 오늘 학습을 종료하세요.':'Plan에서 이번 주와 오늘의 계획을 만듭니다.'}</p><div className="today-hero-actions"><button className="button primary" onClick={()=>navigate(next?'train:timer':planEntryView)}>{next?'공부 시작':'계획 만들기'}<ArrowRight size={17}/></button><button className="button" onClick={()=>navigate('review:wrong')}>오답 기록</button></div></div>
      <div className="today-progress-orbit" aria-label={`오늘 계획 ${completionRate}% 완료`}><div className="today-progress-ring" style={{'--today-progress':`${completionRate*3.6}deg`} as CSSProperties}><span><b>{completionRate}%</b><small>{completed.length}/{todayPlans.length||0} 완료</small></span></div></div>
    </section>

    <section className="today-metrics" aria-label="오늘의 핵심 지표">
      <article><span><Clock3 size={15}/>오늘 학습</span><strong>{formatMinutes(analytics.execution.todayMinutes)}</strong><small>실제 타이머 기록</small></article>
      <article><span><CheckCircle2 size={15}/>계획 실행</span><strong>{analytics.execution.completionRate===null?'—':`${analytics.execution.completionRate}%`}</strong><small>{completed.length}/{todayPlans.length} 일정 완료</small></article>
      <article className={reviewDue?'attention':''}><span><RotateCcw size={15}/>Review</span><strong>{reviewDue}</strong><small>{review?.counts.overdue?`연체 ${review.counts.overdue}개`:'오늘 처리 대상'}</small></article>
      <article><span><Sparkles size={15}/>병목</span><strong className="metric-text">{analytics.currentBottleneck?.name??'기록 대기'}</strong><small>{analytics.currentBottleneck?`최근 14일 ${analytics.currentBottleneck.current}회`:'오답 데이터 필요'}</small></article>
    </section>

    <div className="today-main-grid">
      <section className="today-focus-card" aria-labelledby="today-plan-title"><div className="today-section-head compact"><div><p className="card-label">EXECUTION QUEUE</p><h2 id="today-plan-title">오늘의 학습</h2></div><button className="text-button" onClick={()=>navigate('plan:day')}>Plan <ArrowRight size={15}/></button></div>
        {todayPlans.length?<><div className="today-task-list">{incomplete.map(planRow)}</div>{completed.length>0&&<div className="today-completed"><button className="completed-toggle" aria-expanded={showCompleted} onClick={()=>setShowCompleted(v=>!v)}>완료 {completed.length}개 {showCompleted?'접기':'보기'}</button>{showCompleted&&<div className="today-task-list completed">{completed.map(planRow)}</div>}</div>}</>:<Empty title="오늘 학습 계획이 없습니다." description="Weekly Plan에서 오늘 할 일을 배치하세요." action={<button className="button" onClick={()=>navigate(planEntryView)}>계획 추가</button>}/>} 
      </section>
      <aside className="today-side-stack">
        <section className="today-side-card"><div className="today-section-head compact"><div><p className="card-label">PERSONAL</p><h2>개인 일정</h2></div><button className="text-button" onClick={()=>navigate('workspace')}>일정 <ArrowRight size={14}/></button></div>{todayPersonalTasks.length?<div className="today-mini-list">{todayPersonalTasks.slice(0,4).map(({block,page})=><article key={block.id}><span>{block.category||'개인'}</span><b>{block.content||'제목 없는 일정'}</b><small>{page}</small></article>)}</div>:<p className="today-side-empty">오늘 등록된 개인 일정이 없습니다.</p>}</section>
        <section className="today-side-card"><div className="today-section-head compact"><div><p className="card-label">RESOURCES</p><h2>가까운 마감</h2></div><button className="text-button" onClick={()=>navigate('library')}>Library <ArrowRight size={14}/></button></div>{resourceDeadlines.length?<div className="today-mini-list resources">{resourceDeadlines.map(resource=><article key={resource.id}><span className={`subject-badge ${resource.subject}`}>{resource.subject}</span><b>{resource.name}</b><small>{formatResourceDeadline(resource)} · {resource.done}/{resource.total}</small></article>)}</div>:<p className="today-side-empty">마감이 설정된 자료가 없습니다.</p>}</section>
      </aside>
    </div>

    <LearningLoop review={review} rules={activeRules} busy={Boolean(reviewingRuleId)} reviewError={reviewError} ruleError={ruleError} onOpenQueue={()=>navigate('review:queue')} onBegin={rule=>void beginCoreRuleReview(rule)} onReload={()=>void loadLearningExecution()}/>

    <section className="today-system-note"><BookOpenCheck size={17}/><div><b>TRINITY flow</b><p>Plan → Timer → Wrong Answer → Review → Core Rule → 다음 Plan. 오늘 화면은 이 루프에서 지금 해야 할 것만 우선 노출합니다.</p></div></section>
  </div>;
}
