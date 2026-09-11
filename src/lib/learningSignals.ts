import type { AppData, DrillRetry, ScoreEntry } from '../types.ts';
import { parsePlannedMinutes } from './plannedTime.ts';
import { toDateKey, weekStartKey } from './date.ts';

export type LearningSignal = {
  id: string;
  type: 'bottleneck' | 'retry' | 'performance' | 'time' | 'capability' | 'consistency';
  title: string;
  value: string;
  previousValue?: string;
  trend?: 'up' | 'down' | 'stable';
  interpretation?: 'positive' | 'negative' | 'neutral';
  action?: string;
};

export type BottleneckMetric = {
  name: string;
  current: number;
  previous: number;
  changePercent: number | null;
  action?: string;
};

export type RetryMetric = { id: DrillRetry['id']; label: string; due: number; completed: number; rate: number | null };

export type LearningSignalAnalytics = {
  generatedAt: string;
  execution: { todayMinutes: number; plannedMinutes: number; completionRate: number | null; planItemRate: number | null };
  signals: LearningSignal[];
  bottlenecks: BottleneckMetric[];
  recurrenceRate: number | null;
  retries: RetryMetric[];
  transfer: { eligible: number; confirmed: number; rate: number | null };
  capabilityGoals: AppData['weeklyCapabilityGoals'];
  mockPerformance: { id: string; date: string; name: string; score: number | null; duration: number; bottleneck: string }[];
  currentBottleneck?: BottleneckMetric;
  recommendedAction?: string;
};

const keyDaysAgo = (now: Date, days: number) => {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  date.setDate(date.getDate() - days);
  return toDateKey(date);
};
const normalize = (value?: string) => (value ?? '').toLocaleLowerCase('ko-KR').replace(/[\s\p{P}\p{S}]+/gu, '');
const percentChange = (current: number, previous: number) => previous ? Math.round((current - previous) / previous * 100) : current ? null : 0;
const trend = (current: number, previous: number): LearningSignal['trend'] => current < previous ? 'down' : current > previous ? 'up' : 'stable';
const scoreOf = (entry: ScoreEntry) => {
  if (entry.subject === '탐구') return null;
  const legacy = entry.subject === '국어' ? entry.korean : entry.subject === '수학' ? entry.math : entry.english;
  const value = entry.reviews?.[entry.subject]?.score ?? legacy;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

export function deriveLearningSignals(data: AppData, now = new Date()): LearningSignalAnalytics {
  const today = toDateKey(now);
  const currentStart = keyDaysAgo(now, 13);
  const previousStart = keyDaysAgo(now, 27);
  const previousEnd = keyDaysAgo(now, 14);
  const todayPlans = data.calendar[today]?.plans ?? [];
  const todayDrills = data.dailyDrills.filter((item) => item.date === today);
  const todayMinutes = Math.round(data.sessions.filter((item) => item.date === today).reduce((sum, item) => sum + Math.max(0, item.seconds), 0) / 60);
  const plannedMinutes = todayPlans.reduce((sum, item) => sum + parsePlannedMinutes(item.quantity), 0) + todayDrills.reduce((sum, item) => sum + Math.max(0, item.minutes), 0);
  const planItems = [...todayPlans, ...todayDrills];
  const planItemRate = planItems.length ? Math.round(planItems.filter((item) => item.done).length / planItems.length * 100) : null;
  const completionRate = plannedMinutes ? Math.min(100, Math.round(todayMinutes / plannedMinutes * 100)) : planItemRate;

  const names = new Set(data.wrongAnswerDrills.map((item) => item.bottleneck).filter(Boolean));
  const bottlenecks = [...names].map((name) => {
    const currentItems = data.wrongAnswerDrills.filter((item) => item.bottleneck === name && item.date >= currentStart && item.date <= today);
    const previous = data.wrongAnswerDrills.filter((item) => item.bottleneck === name && item.date >= previousStart && item.date <= previousEnd).length;
    const latestAction = [...currentItems].sort((a, b) => b.date.localeCompare(a.date)).find((item) => item.correction.trim())?.correction;
    return { name: String(name), current: currentItems.length, previous, changePercent: percentChange(currentItems.length, previous), action: latestAction };
  }).filter((item) => item.current || item.previous).sort((a, b) => b.current - a.current || b.previous - a.previous);

  const recurrenceKeys = data.wrongAnswerDrills.filter((item) => item.date >= currentStart && item.date <= today).map((item) =>
    [item.bottleneck, item.wrongJudgment, item.missedCue].map(normalize).filter(Boolean).join('|')).filter(Boolean);
  const recurrenceCounts = recurrenceKeys.reduce((map, key) => map.set(key, (map.get(key) ?? 0) + 1), new Map<string, number>());
  const recurrenceRate = recurrenceKeys.length ? Math.round([...recurrenceCounts.values()].filter((count) => count > 1).reduce((sum, count) => sum + count, 0) / recurrenceKeys.length * 100) : null;

  const dueRetries = data.wrongAnswerDrills.flatMap((item) => item.retries ?? []).filter((retry) => retry.dueDate <= today);
  const retries = (['3d', '7d', '14d'] as const).map((id) => {
    const due = dueRetries.filter((retry) => retry.id === id);
    const completed = due.filter((retry) => Boolean(retry.completedDate)).length;
    return { id, label: `${id.replace('d', '')}일 재현`, due: due.length, completed, rate: due.length ? Math.round(completed / due.length * 100) : null };
  });
  const transferEligible = data.wrongAnswerDrills.filter((item) => item.transfer.trim());
  const transferConfirmed = transferEligible.filter((item) => item.retries?.some((retry) => Boolean(retry.completedDate))).length;
  const transfer = { eligible: transferEligible.length, confirmed: transferConfirmed, rate: transferEligible.length ? Math.round(transferConfirmed / transferEligible.length * 100) : null };
  const capabilityGoals = data.weeklyCapabilityGoals.filter((item) => item.weekStart === weekStartKey(now));
  const mockPerformance = [...data.scores].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map((entry) => ({ id: entry.id, date: entry.date, name: entry.name, score: scoreOf(entry), duration: entry.duration, bottleneck: entry.errorType || entry.cause }));
  const currentBottleneck = bottlenecks[0];
  const recommendedAction = currentBottleneck?.action || data.plaire[today]?.nextAction || capabilityGoals.find((item) => !item.done)?.drillDesign || undefined;

  const signals: LearningSignal[] = [];
  if (currentBottleneck) {
    const change = currentBottleneck.changePercent;
    signals.push({ id: `bottleneck-${currentBottleneck.name}`, type: 'bottleneck', title: currentBottleneck.name, value: `${currentBottleneck.current}회`, previousValue: `이전 14일 ${currentBottleneck.previous}회`, trend: trend(currentBottleneck.current, currentBottleneck.previous), interpretation: currentBottleneck.current < currentBottleneck.previous ? 'positive' : currentBottleneck.current > currentBottleneck.previous ? 'negative' : 'neutral', action: currentBottleneck.action || (change === null ? undefined : `${Math.abs(change)}% ${change <= 0 ? '감소' : '증가'}`) });
  }
  const retryDue = retries.reduce((sum, item) => sum + item.due, 0);
  if (retryDue) {
    const completed = retries.reduce((sum, item) => sum + item.completed, 0);
    signals.push({ id: 'retry-success', type: 'retry', title: '재현 성공률', value: `${Math.round(completed / retryDue * 100)}%`, previousValue: `${completed}/${retryDue}회 완료`, interpretation: completed === retryDue ? 'positive' : 'neutral', action: completed < retryDue ? '기한이 된 재도전을 완료하세요.' : '교정 행동이 유지되고 있습니다.' });
  }
  if (capabilityGoals.length) {
    const done = capabilityGoals.filter((item) => item.done).length;
    signals.push({ id: 'capability-goal', type: 'capability', title: 'Capability Goal', value: `${done}/${capabilityGoals.length}`, interpretation: done === capabilityGoals.length ? 'positive' : 'neutral', action: capabilityGoals.find((item) => !item.done)?.successCriterion });
  }
  if (data.sessions.some((item) => item.date === today)) signals.push({ id: 'time-today', type: 'time', title: '오늘 학습', value: `${Math.floor(todayMinutes / 60)}시간 ${todayMinutes % 60}분`, previousValue: plannedMinutes ? `계획 ${plannedMinutes}분` : undefined, interpretation: 'neutral' });

  return { generatedAt: now.toISOString(), execution: { todayMinutes, plannedMinutes, completionRate, planItemRate }, signals, bottlenecks, recurrenceRate, retries, transfer, capabilityGoals, mockPerformance, currentBottleneck, recommendedAction };
}
