import type { DailyDrill, Subject, WeeklyCapabilityGoal } from '../types';

export type TeacherRole = 'subject_teacher' | 'academic_manager';
export type TeacherSignal = {
  sourceRole: TeacherRole;
  targetRole: TeacherRole;
  subject: Subject;
  priority: 'low' | 'medium' | 'high';
  type: 'diagnosis' | 'intervention' | 'reassessment_request' | 'execution_issue';
  evidenceRefs: string[];
  status: 'open' | 'accepted' | 'resolved' | 'dismissed';
  weeklyGoal?: Pick<WeeklyCapabilityGoal, 'weekStart' | 'subject' | 'ability' | 'successCriterion' | 'drillDesign' | 'evidence'>;
  dailyDrill?: Pick<DailyDrill, 'date' | 'subject' | 'title' | 'action' | 'successCriterion' | 'minutes' | 'capabilityGoalId'>;
};

export const signalPriority = (priority: TeacherSignal['priority']) => ({ high: 0, medium: 1, low: 2 })[priority];
export const subjectList: Subject[] = ['국어', '수학', '영어', '탐구'];
