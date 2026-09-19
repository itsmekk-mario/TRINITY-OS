import type { Subject } from '../../types.ts';

export type CoachConfidence = 'high' | 'medium' | 'low';
export type Trend = 'up' | 'flat' | 'down' | 'insufficient';
export type BottleneckTrend = 'increasing' | 'stable' | 'decreasing' | 'insufficient';

export type CoachRuleResult = {
  id: string;
  category: 'bottleneck' | 'retry' | 'execution' | 'goal' | 'data';
  priority: number;
  title: string;
  reason: string;
  evidence: string[];
  action: string;
  successCriterion?: string;
  confidence: CoachConfidence;
};

export type CoachDiagnosis = {
  status: string;
  primaryBottleneck: {
    title: string;
    reason: string;
    evidence: string[];
    confidence: CoachConfidence;
  } | null;
  nextAction: {
    title: string;
    description: string;
    estimatedMinutes?: number;
    successCriterion?: string;
  };
  keepDoing?: string;
  warnings?: string[];
  rules: CoachRuleResult[];
};

export type LearningAnalysisCore = {
  generatedAt: string;
  execution: {
    todayStudyMinutes: number;
    sevenDayStudyMinutes: number;
    previousSevenDayStudyMinutes: number;
    fourteenDayStudyMinutes: number;
    thirtyDayStudyMinutes: number;
    plannedMinutesToday: number;
    completionRateToday: number | null;
    dailyDrillCompletionRate7d: number | null;
  };
  subjects: {
    subject: Subject;
    studyMinutes7d: number;
    studyMinutes14d: number;
    recentScoreTrend: Trend;
    wrongCount7d: number;
    wrongCount14d: number;
    mainBottlenecks: { name: string; count: number }[];
  }[];
  bottlenecks: {
    name: string;
    subject?: Subject;
    count7d: number;
    count14d: number;
    previous7d: number;
    trend: BottleneckTrend;
    repeatedCues: string[];
    repeatedJudgments: string[];
    correctionActions: string[];
    transferDrills: string[];
  }[];
  retries: {
    scheduled: number;
    completed: number;
    overdue: number;
    oldestOverdueDate?: string;
  };
  weeklyGoals: {
    subject: Subject;
    ability: string;
    successCriterion: string;
    drillDesign: string;
    evidence: string;
    done: boolean;
  }[];
  plaire?: {
    criterion?: number;
    immersion?: number;
    embodiment?: number;
    bottleneck?: string;
    nextAction?: string;
  };
  supportingSignals: {
    activeMonthlyPlans: number;
    openGoals: number;
    resourceUnitsDone: number;
    resourceUnitsTotal: number;
    trinityEntries14d: number;
  };
};

export type LearningAnalysis = LearningAnalysisCore & { diagnosis: CoachDiagnosis };

export type AIStudyCoachContext = {
  period: '14d';
  execution: {
    studyMinutes7d: number;
    previousStudyMinutes7d: number;
    completionRateToday?: number;
    dailyDrillCompletionRate7d?: number;
  };
  subjectSummary: {
    subject: Subject;
    studyMinutes7d: number;
    recentScoreTrend: Trend;
  }[];
  primaryBottleneck?: {
    name: string;
    count7d: number;
    count14d: number;
    trend: BottleneckTrend;
    repeatedCues?: string[];
    repeatedJudgments?: string[];
    correctionAction?: string;
    transferDrill?: string;
  };
  secondaryBottlenecks?: { name: string; count7d: number; count14d: number }[];
  retryStatus?: { scheduled: number; completed: number; overdue: number };
  weeklyGoals?: { subject: Subject; ability: string; successCriterion: string }[];
  plaire?: { bottleneck?: string; nextAction?: string };
  localDiagnosis: {
    status: string;
    primaryBottleneck?: string;
    nextAction: string;
    successCriterion?: string;
    evidence: string[];
  };
};

export type LocalCoachMessage = {
  status: string;
  bottleneck: string;
  evidence: string;
  nextAction: string;
  successCriterion?: string;
};
