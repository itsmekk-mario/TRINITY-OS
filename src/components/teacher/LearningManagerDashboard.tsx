import { useMemo, useState } from "react";
import { signalPriority } from "../../lib/teacherSignals";
import { formatStudyTime, learningAnalytics } from "../../lib/teacherAnalytics";
import { Empty, SectionTitle } from "../Ui";
import SegmentedControl from "../navigation/SegmentedControl";
import { FeedbackComposer, FeedbackHistory, Insight, SignalCards, StatusBadge } from "./shared";
import type { TeacherDashboardProps } from "./types";
import { ResourcesPanel } from "./MathPanels";
import ArenaReviewPanel from "./ArenaReviewPanel";
import { EffortOutcomePanel, ExecutionPanel, SubjectStatus, WeeklyGoalsPanel } from "./LearningPanels";
import DailyLearningDetail from "./DailyLearningDetail";

const tabs = ["Overview", "Calendar", "Performance", "Feedback"] as const;
type Tab = (typeof tabs)[number];

export default function LearningManagerDashboard({ data, range, feedback, busy, canFeedback, onFeedback, onEditFeedback, onDeleteFeedback, onSignalAction }: TeacherDashboardProps) {
  const [tab, setTab] = useState<Tab>("Overview");
  const [evidence, setEvidence] = useState<string>();
  const analysis = useMemo(() => learningAnalytics(data, range), [data, range]);
  const unresolved = useMemo(() => feedback.filter(item => item.signal?.targetRole === "academic_manager" && ["open", "accepted"].includes(item.signal.status)).sort((a, b) => signalPriority(a.signal!.priority) - signalPriority(b.signal!.priority)), [feedback]);
  const statuses = <SubjectStatus analysis={analysis} setTab={() => setTab("Performance")} />;
  const execution = <ExecutionPanel analysis={analysis} />;
  const effort = <EffortOutcomePanel analysis={analysis} />;
  const signals = <SignalCards items={feedback} role="academic_manager" onAction={onSignalAction} onEvidence={setEvidence} busy={busy || !canFeedback} />;
  const attention = <section><SectionTitle title="Attention Required" meta={`${unresolved.length} unresolved signal`} />{analysis.subjects.filter(item => item.reassess || item.repeated.length || item.plans.some(plan => !plan.done)).map(item => <article className="teacher-attention" key={item.subject}><StatusBadge value={item.reassess || item.repeated.length ? "high" : "medium"} /><h3>{item.subject}</h3><p>계획 {item.plans.filter(plan => plan.done).length}/{item.plans.length} · 반복 병목 {item.repeated.length} · Drill {item.drills.filter(drill => drill.done).length}/{item.drills.length}</p><button className="button" onClick={() => setTab("Performance")}>성과와 병목 보기</button></article>)}{!analysis.subjects.some(item => item.reassess || item.repeated.length || item.plans.some(plan => !plan.done)) && <Empty title="데이터 부족" description="기록이 없는 과목을 정상으로 추정하지 않습니다." />}</section>;
  return <><nav><div className="teacher-nav-brand"><span className="brand-mark">T</span><div><strong>TRINITY OS</strong><small>Teacher Workspace</small></div></div><SegmentedControl label="Learning Control Center" options={tabs.map(id => ({ id, label: id }))} value={tab} onChange={setTab} className="teacher-tabs" /></nav><div role="tabpanel" aria-label={tab}>{tab === "Overview" && <><Insight label="WEEKLY STATUS" title="이번 주 학습 상태"><div className="teacher-facts"><span>계획 실행률 <b>{analysis.executionRate === undefined ? "데이터 부족" : `${analysis.executionRate}%`}</b></span><span>총 순공 <b>{formatStudyTime(analysis.totalSeconds)}</b></span><span>미완료 Drill <b>{analysis.subjects.reduce((sum, item) => sum + item.drills.filter(drill => !drill.done).length, 0)}</b></span><span>미해결 Signal <b>{unresolved.length}</b></span></div></Insight>{execution}{statuses}{attention}<details className="teacher-secondary-section" open><summary>Weekly Goals · Resources · ARENA</summary><WeeklyGoalsPanel analysis={analysis} data={data} signalCards={signals} /><ResourcesPanel data={data} /><ArenaReviewPanel data={data} range={range} /></details></>}{tab === "Calendar" && <DailyLearningDetail data={data} />}{tab === "Performance" && <>{execution}{statuses}{effort}{attention}</>}{tab === "Feedback" && <>{signals}{canFeedback && <FeedbackComposer role="academic_manager" subject="수학" onSubmit={onFeedback} busy={busy} />}<FeedbackHistory items={feedback} busy={busy} onEdit={onEditFeedback} onDelete={onDeleteFeedback} /></>}</div>{evidence && <p className="teacher-evidence-note">Evidence: {evidence}</p>}</>;
}
