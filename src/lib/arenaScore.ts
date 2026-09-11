import type { AppData, ArenaScore, ScoreEntry } from '../types';

const DAY_MS = 86_400_000;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number) => Math.round(value);
const key = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const monday = (date: Date) => { const out = startOfDay(date); const day = out.getDay() || 7; out.setDate(out.getDate() - day + 1); return out; };
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);
const inRange = (date: string, start: Date, end: Date) => date >= key(start) && date <= key(end);
const sessionsIn = (data: AppData, start: Date, end: Date) => data.sessions.filter(item => inRange(item.date, start, end));
const secondsIn = (data: AppData, start: Date, end: Date) => sessionsIn(data, start, end).reduce((sum, item) => sum + Math.max(0, item.seconds), 0);
const numericScores = (entry: ScoreEntry) => [entry.korean, entry.math, entry.english].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
const examAverage = (entries: ScoreEntry[]) => { const values = entries.flatMap(numericScores); return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; };

function continuousStudyDays(data: AppData, now: Date) {
  const active = new Set(data.sessions.filter(item => item.seconds > 0).map(item => item.date));
  let cursor = startOfDay(now);
  if (!active.has(key(cursor))) cursor = addDays(cursor, -1);
  let streak = 0;
  while (active.has(key(cursor))) { streak += 1; cursor = addDays(cursor, -1); }
  return streak;
}

function plansIn(data: AppData, start: Date, end: Date) {
  const calendar = Object.entries(data.calendar).filter(([date]) => inRange(date, start, end)).flatMap(([, entry]) => entry.plans ?? []);
  const drills = data.dailyDrills.filter(item => inRange(item.date, start, end));
  return [...calendar, ...drills];
}

function scoreChange(data: AppData, now: Date) {
  const recent = data.scores.filter(item => inRange(item.date, addDays(now, -27), now));
  const current = examAverage(recent.filter(item => inRange(item.date, addDays(now, -13), now)));
  const previous = examAverage(recent.filter(item => inRange(item.date, addDays(now, -27), addDays(now, -14))));
  return current !== null && previous !== null ? current - previous : 0;
}

function drillRate(data: AppData, start: Date, end: Date) {
  const drills = data.wrongAnswerDrills.filter(item => inRange(item.date, start, end));
  const retries = drills.flatMap(item => item.retries ?? []);
  if (retries.length) return retries.filter(item => Boolean(item.completedDate)).length / retries.length;
  if (!drills.length) return 0;
  return drills.filter(item => item.correction.trim() && item.transfer.trim()).length / drills.length;
}

function plaireLevel(data: AppData, start: Date, end: Date) {
  const entries = Object.entries(data.plaire).filter(([date]) => inRange(date, start, end)).map(([, item]) => item.levels);
  if (!entries.length) return null;
  return entries.reduce((sum, item) => sum + item.criterion + item.immersion + item.embodiment, 0) / (entries.length * 3);
}

export function calculateArenaScore(data: AppData, now = new Date()): ArenaScore {
  const weekStart = monday(now); const weekEnd = addDays(weekStart, 6);
  const previousStart = addDays(weekStart, -7); const previousEnd = addDays(weekStart, -1);
  const currentWeekSeconds = secondsIn(data, weekStart, weekEnd); const previousWeekSeconds = secondsIn(data, previousStart, previousEnd);
  const plans = plansIn(data, weekStart, weekEnd); const previousPlans = plansIn(data, previousStart, previousEnd);
  const planExecutionRate = plans.length ? plans.filter(item => item.done).length / plans.length : 0;
  const previousPlanRate = previousPlans.length ? previousPlans.filter(item => item.done).length / previousPlans.length : 0;
  const activeDays = new Set(sessionsIn(data, weekStart, weekEnd).filter(item => item.seconds > 0).map(item => item.date)).size;
  const streakDays = continuousStudyDays(data, now);
  const change = scoreChange(data, now);
  const drillCompletionRate = drillRate(data, addDays(now, -20), now);
  const completedTripleDrills = data.wrongAnswerDrills.filter(item => (item.retries ?? []).length >= 3 && (item.retries ?? []).slice(0, 3).every(retry => Boolean(retry.completedDate))).length;
  const recentGoals = data.weeklyCapabilityGoals.filter(item => inRange(item.weekStart, addDays(now, -27), now));
  const goalRate = recentGoals.length ? recentGoals.filter(item => item.done).length / recentGoals.length : 0;
  const currentPlaire = plaireLevel(data, addDays(now, -13), now); const previousPlaire = plaireLevel(data, addDays(now, -27), addDays(now, -14));
  const plaireGrowth = currentPlaire !== null && previousPlaire !== null ? clamp((currentPlaire - previousPlaire) / Math.max(previousPlaire, 1), -1, 1) : 0;
  const studyGrowth = previousWeekSeconds ? (currentWeekSeconds - previousWeekSeconds) / previousWeekSeconds : currentWeekSeconds ? .15 : 0;
  const planGrowth = planExecutionRate - previousPlanRate;
  const weaknessImprovementRate = clamp((goalRate * .55 + drillCompletionRate * .35 + Math.max(0, plaireGrowth) * .1) * 100, 0, 100);
  const growthRate = clamp((studyGrowth * .45 + planGrowth * .3 + clamp(change / 10, -.5, .5) * .15 + plaireGrowth * .1) * 100, -99, 200);

  const execution = round(clamp(currentWeekSeconds / (35 * 3600), 0, 1) * 110 + planExecutionRate * 130 + activeDays / 7 * 60);
  const hasScores = data.scores.some(item => numericScores(item).length);
  const problemSolving = round((hasScores ? 45 + clamp(change / 10, -.25, 1) * 75 : 0) + drillCompletionRate * 110 + goalRate * 70);
  const consistency = round(clamp(streakDays / 14, 0, 1) * 120 + planExecutionRate * 80);
  const growth = round(clamp(.35 + studyGrowth * .3 + planGrowth * .35 + clamp(change / 10, -.25, .75) * .2 + Math.max(0, plaireGrowth) * .15, 0, 1) * 200);
  const breakdown = { execution: clamp(execution, 0, 300), problemSolving: clamp(problemSolving, 0, 300), consistency: clamp(consistency, 0, 200), growth: clamp(growth, 0, 200) };

  const weakAreas: string[] = [];
  if (planExecutionRate < .7) weakAreas.push('계획 실행률');
  if (drillCompletionRate < .65) weakAreas.push('오답 재풀이');
  if (activeDays < 5) weakAreas.push('학습 리듬');
  if (hasScores && change <= 0) weakAreas.push('모의고사 성취');
  const nextActions: string[] = weakAreas.slice(0, 2).map(area => area === '계획 실행률' ? '오늘 계획 중 가장 작은 항목 하나를 완료하세요.' : area === '오답 재풀이' ? '최근 오답 Drill 3개를 다시 풀고 완료 표시하세요.' : area === '학습 리듬' ? '내일 시작할 과목과 시간을 미리 한 칸만 정하세요.' : '최근 시험의 반복 오답 유형 1개를 Drill로 전환하세요.');
  if (!nextActions.length) nextActions.push('현재 루틴을 유지하며 이번 주 완료 근거를 하나 더 남기세요.');

  return {
    total: breakdown.execution + breakdown.problemSolving + breakdown.consistency + breakdown.growth,
    breakdown,
    metrics: { currentWeekSeconds, previousWeekSeconds, planExecutionRate: round(planExecutionRate * 100), activeDays, streakDays, scoreChange: Math.round(change * 10) / 10, drillCompletionRate: round(drillCompletionRate * 100), completedTripleDrills, weaknessImprovementRate: round(weaknessImprovementRate), growthRate: Math.round(growthRate * 10) / 10, weakAreas, nextActions },
    calculatedAt: now.toISOString(),
  };
}
