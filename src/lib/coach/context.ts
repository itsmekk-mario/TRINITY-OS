import type { AIStudyCoachContext, LearningAnalysis } from './types.ts';

export function normalizeLearningText(value: string | undefined) {
  return (value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[\s·ㆍ,./#!$%^&*;:{}=\-_~()[\]"'“”‘’<>?]+/g, '')
    .trim();
}

export function dateKeyDaysAgo(now: Date, days: number) {
  const value = new Date(now);
  value.setHours(12, 0, 0, 0);
  value.setDate(value.getDate() - days);
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function coachContextHash(context: AIStudyCoachContext) {
  let hash = 2166136261;
  for (const char of stableStringify(context)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function buildAIStudyCoachContext(analysis: LearningAnalysis): AIStudyCoachContext {
  const primary = analysis.bottlenecks[0];
  const diagnosis = analysis.diagnosis.primaryBottleneck;
  return {
    period: '14d',
    execution: {
      studyMinutes7d: analysis.execution.sevenDayStudyMinutes,
      previousStudyMinutes7d: analysis.execution.previousSevenDayStudyMinutes,
      ...(analysis.execution.completionRateToday === null ? {} : { completionRateToday: analysis.execution.completionRateToday }),
      ...(analysis.execution.dailyDrillCompletionRate7d === null ? {} : { dailyDrillCompletionRate7d: analysis.execution.dailyDrillCompletionRate7d }),
    },
    subjectSummary: analysis.subjects
      .filter((item) => item.studyMinutes7d || item.wrongCount14d || item.recentScoreTrend !== 'insufficient')
      .map((item) => ({ subject: item.subject, studyMinutes7d: item.studyMinutes7d, recentScoreTrend: item.recentScoreTrend })),
    ...(primary ? { primaryBottleneck: {
      name: primary.name,
      count7d: primary.count7d,
      count14d: primary.count14d,
      trend: primary.trend,
      ...(primary.repeatedCues.length ? { repeatedCues: primary.repeatedCues.slice(0, 2) } : {}),
      ...(primary.repeatedJudgments.length ? { repeatedJudgments: primary.repeatedJudgments.slice(0, 2) } : {}),
      ...(primary.correctionActions[0] ? { correctionAction: primary.correctionActions[0] } : {}),
      ...(primary.transferDrills[0] ? { transferDrill: primary.transferDrills[0] } : {}),
    } } : {}),
    ...(analysis.bottlenecks.length > 1 ? { secondaryBottlenecks: analysis.bottlenecks.slice(1, 3).map((item) => ({ name: item.name, count7d: item.count7d, count14d: item.count14d })) } : {}),
    retryStatus: { scheduled: analysis.retries.scheduled, completed: analysis.retries.completed, overdue: analysis.retries.overdue },
    ...(analysis.weeklyGoals.length ? { weeklyGoals: analysis.weeklyGoals.filter((item) => !item.done).slice(0, 3).map((item) => ({ subject: item.subject, ability: item.ability, successCriterion: item.successCriterion })) } : {}),
    ...(analysis.plaire ? { plaire: { bottleneck: analysis.plaire.bottleneck, nextAction: analysis.plaire.nextAction } } : {}),
    localDiagnosis: {
      status: analysis.diagnosis.status,
      ...(diagnosis ? { primaryBottleneck: diagnosis.title } : {}),
      nextAction: analysis.diagnosis.nextAction.description,
      successCriterion: analysis.diagnosis.nextAction.successCriterion,
      evidence: diagnosis?.evidence.slice(0, 3) ?? [],
    },
  };
}
