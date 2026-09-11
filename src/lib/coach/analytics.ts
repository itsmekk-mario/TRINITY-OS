import type { AppData, ScoreEntry, Subject } from '../../types.ts';
import { toDateKey, weekStartKey } from '../date.ts';
import { dateKeyDaysAgo, normalizeLearningText } from './context.ts';
import { diagnoseLearning } from './rules.ts';
import type { BottleneckTrend, LearningAnalysis, LearningAnalysisCore, Trend } from './types.ts';

const SUBJECTS: Subject[] = ['국어', '수학', '영어', '탐구'];

function planMinutes(value: string) {
  const hours = Number(value.match(/(\d+(?:\.\d+)?)\s*시간/)?.[1] ?? 0);
  const minutes = Number(value.match(/(\d+)\s*분/)?.[1] ?? 0);
  if (hours || minutes) return Math.round(hours * 60 + minutes);
  return Number(value.match(/\d+/)?.[0] ?? 0);
}

function scoreFor(entry: ScoreEntry, subject: Subject): number | undefined {
  if (subject === '탐구') return undefined;
  const review = entry.reviews?.[subject];
  const legacy = subject === '국어' ? entry.korean : subject === '수학' ? entry.math : entry.english;
  const value = review?.score ?? legacy;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : undefined;
}

function scoreTrend(scores: ScoreEntry[], subject: Subject, since: string): Trend {
  const points = scores
    .filter((entry) => entry.date >= since)
    .map((entry) => ({ date: entry.date, score: scoreFor(entry, subject) }))
    .filter((entry): entry is { date: string; score: number } => entry.score !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (points.length < 2 || points.at(-1)!.date === points.at(-2)!.date) return 'insufficient';
  const change = points.at(-1)!.score - points.at(-2)!.score;
  return change >= 2 ? 'up' : change <= -2 ? 'down' : 'flat';
}

function repeatedValues(values: (string | undefined)[]) {
  const groups = new Map<string, { label: string; count: number }>();
  for (const raw of values) {
    const label = raw?.trim();
    const key = normalizeLearningText(label);
    if (!label || key.length < 2) continue;
    const current = groups.get(key);
    groups.set(key, { label: current?.label ?? label.slice(0, 60), count: (current?.count ?? 0) + 1 });
  }
  return [...groups.values()].filter((item) => item.count >= 2).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 3).map((item) => `${item.label} ${item.count}회`);
}

function recentUniqueValues(values: (string | undefined)[]) {
  const seen = new Set<string>();
  return values.flatMap((raw) => {
    const value = raw?.trim(); const key = normalizeLearningText(value);
    if (!value || key.length < 2 || seen.has(key)) return [];
    seen.add(key); return [value.slice(0, 120)];
  }).slice(0, 2);
}

function bottleneckTrend(current: number, previous: number, total: number): BottleneckTrend {
  if (total < 2) return 'insufficient';
  if (current >= previous + 2) return 'increasing';
  if (previous >= current + 2) return 'decreasing';
  return 'stable';
}

export function analyzeLearningData(data: AppData, now = new Date()): LearningAnalysis {
  const today = toDateKey(now);
  const start7 = dateKeyDaysAgo(now, 6);
  const start14 = dateKeyDaysAgo(now, 13);
  const previous7Start = dateKeyDaysAgo(now, 13);
  const previous7End = dateKeyDaysAgo(now, 7);
  const start30 = dateKeyDaysAgo(now, 29);
  const currentWeek = weekStartKey(now);
  const sumMinutes = (start: string, end = today, subject?: Subject) => Math.round(data.sessions
    .filter((item) => item.date >= start && item.date <= end && (!subject || item.subject === subject))
    .reduce((sum, item) => sum + Math.max(0, item.seconds), 0) / 60);

  const todayPlans = data.calendar[today]?.plans ?? [];
  const todayDrills = data.dailyDrills.filter((item) => item.date === today);
  const planItems = [...todayPlans, ...todayDrills];
  const completedPlanItems = planItems.filter((item) => item.done).length;
  const drills7 = data.dailyDrills.filter((item) => item.date >= start7 && item.date <= today);
  const recentWrong = data.wrongAnswerDrills.filter((item) => item.date >= start14 && item.date <= today);

  const bottleneckNames = [...new Set(recentWrong.map((item) => item.bottleneck).filter((value): value is NonNullable<typeof value> => Boolean(value)))];
  const bottlenecks = bottleneckNames.map((name) => {
    const related = recentWrong.filter((item) => item.bottleneck === name);
    const current = related.filter((item) => item.date >= start7).length;
    const previous = related.filter((item) => item.date >= previous7Start && item.date <= previous7End).length;
    const subjectCounts = SUBJECTS.map((subject) => ({ subject, count: related.filter((item) => item.subject === subject).length })).sort((a, b) => b.count - a.count);
    return {
      name,
      subject: subjectCounts[0]?.count ? subjectCounts[0].subject : undefined,
      count7d: current,
      count14d: related.length,
      previous7d: previous,
      trend: bottleneckTrend(current, previous, related.length),
      repeatedCues: repeatedValues(related.map((item) => item.missedCue)),
      repeatedJudgments: repeatedValues(related.map((item) => item.wrongJudgment)),
      correctionActions: recentUniqueValues([...related].sort((a, b) => b.date.localeCompare(a.date)).map((item) => item.correction)),
      transferDrills: recentUniqueValues([...related].sort((a, b) => b.date.localeCompare(a.date)).map((item) => item.transfer)),
    };
  }).sort((a, b) => (b.count7d * 2 + b.count14d) - (a.count7d * 2 + a.count14d) || a.name.localeCompare(b.name));

  const recentRetryDrills = data.wrongAnswerDrills.filter((item) => item.date >= start30 && item.date <= today);
  const scheduledRetries = recentRetryDrills.flatMap((item) => item.retries ?? []).filter((retry) => retry.dueDate <= today);
  const overdueRetries = scheduledRetries.filter((retry) => !retry.completedDate && retry.dueDate < today);

  const core: LearningAnalysisCore = {
    generatedAt: now.toISOString(),
    execution: {
      todayStudyMinutes: sumMinutes(today),
      sevenDayStudyMinutes: sumMinutes(start7),
      previousSevenDayStudyMinutes: sumMinutes(previous7Start, previous7End),
      fourteenDayStudyMinutes: sumMinutes(start14),
      thirtyDayStudyMinutes: sumMinutes(start30),
      plannedMinutesToday: todayPlans.reduce((sum, item) => sum + planMinutes(item.quantity), 0) + todayDrills.reduce((sum, item) => sum + Math.max(0, item.minutes), 0),
      completionRateToday: planItems.length ? Math.round(completedPlanItems / planItems.length * 100) : null,
      dailyDrillCompletionRate7d: drills7.length ? Math.round(drills7.filter((item) => item.done).length / drills7.length * 100) : null,
    },
    subjects: SUBJECTS.map((subject) => {
      const wrong = recentWrong.filter((item) => item.subject === subject);
      const counts = [...new Set(wrong.map((item) => item.bottleneck).filter(Boolean))].map((name) => ({ name: String(name), count: wrong.filter((item) => item.bottleneck === name).length })).sort((a, b) => b.count - a.count);
      return {
        subject,
        studyMinutes7d: sumMinutes(start7, today, subject),
        studyMinutes14d: sumMinutes(start14, today, subject),
        recentScoreTrend: scoreTrend(data.scores, subject, start30),
        wrongCount7d: wrong.filter((item) => item.date >= start7).length,
        wrongCount14d: wrong.length,
        mainBottlenecks: counts.slice(0, 3),
      };
    }),
    bottlenecks,
    retries: {
      scheduled: scheduledRetries.length,
      completed: scheduledRetries.filter((retry) => Boolean(retry.completedDate)).length,
      overdue: overdueRetries.length,
      oldestOverdueDate: overdueRetries.sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]?.dueDate,
    },
    weeklyGoals: data.weeklyCapabilityGoals.filter((item) => item.weekStart === currentWeek).map((item) => ({ subject: item.subject, ability: item.ability, successCriterion: item.successCriterion, drillDesign: item.drillDesign, evidence: item.evidence, done: item.done })),
    plaire: Object.entries(data.plaire).filter(([date]) => date >= start14 && date <= today).sort(([a], [b]) => b.localeCompare(a)).map(([, item]) => ({ criterion: item.levels?.criterion, immersion: item.levels?.immersion, embodiment: item.levels?.embodiment, bottleneck: item.bottleneck || undefined, nextAction: item.nextAction || undefined }))[0],
    supportingSignals: {
      activeMonthlyPlans: data.monthlyPlans.filter((item) => !item.done && item.month <= today.slice(0, 7)).length,
      openGoals: data.goals.filter((item) => !item.done).length,
      resourceUnitsDone: data.resources.reduce((sum, item) => sum + Math.max(0, item.done), 0),
      resourceUnitsTotal: data.resources.reduce((sum, item) => sum + Math.max(0, item.total), 0),
      trinityEntries14d: data.trinity.filter((item) => item.date >= start14 && item.date <= today).length,
    },
  };
  return { ...core, diagnosis: diagnoseLearning(core) };
}
