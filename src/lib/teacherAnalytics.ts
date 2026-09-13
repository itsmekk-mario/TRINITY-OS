import type { AppData, Subject } from '../types';
import { parsePlannedMinutes } from './plannedTime.ts';
export type TeacherData = Pick<AppData, 'sessions' | 'wrongAnswerDrills' | 'weeklyCapabilityGoals' | 'dailyDrills' | 'resources'> & {
  arena?: { snapshots: {id:string;week_start:string;score:number;execution:number;problem_solving:number;consistency:number;growth:number;calculated_at:string;season:string}[]; achievements:{id:string;title:string;description:string;awarded_at:string}[]; groups:{id:string;name:string;type:string}[] };
  scores: (Partial<AppData['scores'][number]> & { id: string; date: string; name: string; subject?: Subject; score?: number })[];
  access?: { sessions:boolean; scores:boolean; wrongAnswers:boolean; weeklyGoals:boolean; drills:boolean; trinity:boolean };
  plans: { id: string; date: string; subject: string; title: string; done: boolean; quantity?: string }[];
  trinity?: Pick<AppData['trinity'][number], 'id' | 'date' | 'subject' | 'fields'>[];
};
export type DateRange = { start: string; end: string };
export const localDate = (date = new Date()) => date.toLocaleDateString('sv-SE');
export function recentRange(days: number, now = new Date()): DateRange {
  const start = new Date(now); start.setDate(start.getDate() - days + 1);
  return { start: localDate(start), end: localDate(now) };
}
export function weekInRange(start: string, range: DateRange) { const end=new Date(start+'T12:00:00');end.setDate(end.getDate()+6);return start<=range.end&&localDate(end)>=range.start; }
export const inRange = (date: string, range: DateRange) => date >= range.start && date <= range.end;
export const formatStudyTime = (seconds: number) => `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`;
export function subjectScore(score: TeacherData['scores'][number], subject: Subject): number | undefined {
  const value = score.subject === subject && score.score !== undefined ? score.score : subject === '수학' ? score.reviews?.수학?.score ?? score.math : subject === '국어' ? score.reviews?.국어?.score ?? score.korean : subject === '영어' ? score.reviews?.영어?.score ?? score.english : undefined;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
export function mathAnalytics(data: TeacherData, subject: Subject, range: DateRange) {
  const wrong = data.wrongAnswerDrills.filter(item => item.subject === subject && inRange(item.date, range));
  const groups = new Map<string, typeof wrong>();
  for (const item of wrong) { const key = item.bottleneck || '미분류'; const entries = groups.get(key) ?? []; entries.push(item); groups.set(key, entries); }
  const patterns = [...groups].map(([label, records]) => ({ label, records: records.slice().sort((a,b) => b.date.localeCompare(a.date)) })).sort((a,b) => b.records.length - a.records.length);
  const scores = data.scores.filter(item => inRange(item.date, range) && subjectScore(item, subject) !== undefined).sort((a,b) => a.date.localeCompare(b.date));
  const drills = data.dailyDrills.filter(item => item.subject === subject && inRange(item.date, range));
  const goals = data.weeklyCapabilityGoals.filter(item => item.subject === subject && weekInRange(item.weekStart, range));
  return { wrong, patterns, scores, drills, goals, average: scores.length ? Math.round(scores.reduce((sum,item) => sum + subjectScore(item, subject)!, 0) / scores.length * 10) / 10 : undefined, repeated: patterns.filter(item => item.label !== '미분류' && item.records.length > 1) };
}
export function learningAnalytics(data: TeacherData, range: DateRange) {
  const days = Math.round((Date.parse(range.end) - Date.parse(range.start)) / 86400000) + 1;
  const prevStart = new Date(`${range.start}T12:00:00`); prevStart.setDate(prevStart.getDate() - days);
  const prevEnd = new Date(`${range.start}T12:00:00`); prevEnd.setDate(prevEnd.getDate() - 1);
  const previous = { start: localDate(prevStart), end: localDate(prevEnd) };
  const subjects = (['국어','수학','영어','탐구'] as Subject[]).map(subject => {
    const plans = data.plans.filter(item => item.subject === subject && inRange(item.date,range));
    const seconds = data.sessions.filter(item => item.subject === subject && inRange(item.date,range)).reduce((sum,item) => sum + item.seconds,0);
    const previousSeconds = data.sessions.filter(item => item.subject === subject && inRange(item.date,previous)).reduce((sum,item) => sum + item.seconds,0);
    const timedPlans = plans.filter(item => parsePlannedMinutes(item.quantity) > 0);
    const plannedMinutes = timedPlans.reduce((sum,item) => sum + parsePlannedMinutes(item.quantity),0);
    const scores = data.scores.filter(item => inRange(item.date,range) && subjectScore(item,subject) !== undefined).sort((a,b) => a.date.localeCompare(b.date));
    const earlierScores = data.scores.filter(item => inRange(item.date,previous) && subjectScore(item,subject) !== undefined);
    const average = scores.length ? scores.reduce((sum,item)=>sum+subjectScore(item,subject)!,0)/scores.length : undefined;
    const earlierAverage = earlierScores.length ? earlierScores.reduce((sum,item)=>sum+subjectScore(item,subject)!,0)/earlierScores.length : undefined;
    const delta = average !== undefined && earlierAverage !== undefined ? average - earlierAverage : undefined;
    const effort = timedPlans.length === plans.length && plannedMinutes > 0 ? seconds / 60 >= plannedMinutes : undefined;
    const outcome = delta !== undefined ? delta > 0 : undefined;
    const drills = data.dailyDrills.filter(item=>item.subject===subject && inRange(item.date,range));
    const repeated = mathAnalytics(data,subject,range).repeated;
    const executionGap = plans.length > 0 && plans.some(item=>!item.done);
    const reassess = previousSeconds > 0 && seconds > previousSeconds && delta !== undefined && delta <= 0 && drills.length > 0 && drills.every(item=>item.done);
    return { subject, plans, seconds, previousSeconds, plannedMinutes, timedPlanCount: timedPlans.length, scores, delta, effort, outcome, drills, repeated, reassess, status: repeated.length || reassess ? 'Attention' : executionGap ? 'Delayed' : plans.length || seconds ? 'Stable' : '데이터 부족' };
  });
  const plans = subjects.flatMap(item=>item.plans);
  const goals = data.weeklyCapabilityGoals.filter(item=>weekInRange(item.weekStart,range));
  return { subjects, goals, totalSeconds: subjects.reduce((sum,item)=>sum+item.seconds,0), plans, executionRate: plans.length ? Math.round(plans.filter(item=>item.done).length/plans.length*100) : undefined };
}
