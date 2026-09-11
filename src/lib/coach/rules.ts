import { normalizeLearningText } from './context.ts';
import type { CoachConfidence, CoachDiagnosis, CoachRuleResult, LearningAnalysisCore } from './types.ts';

const KEYWORDS: Record<string, string[]> = {
  '발문·해석': ['조건', '발문', '해석', '오독', '경계', '단서'],
  '개념 공백': ['개념', '정의', '공식', '원리'],
  '계산 실수': ['계산', '부호', '산술', '전개'],
  '시간 관리': ['시간', '속도', '배분', '마감'],
  '전략·판단': ['판단', '전략', '선택', '필요조건', '충분조건'],
};

function confidence(count: number): CoachConfidence {
  return count >= 4 ? 'high' : count >= 2 ? 'medium' : 'low';
}

function matchingGoal(analysis: LearningAnalysisCore, bottleneck: LearningAnalysisCore['bottlenecks'][number]) {
  const terms = KEYWORDS[bottleneck.name] ?? [bottleneck.name];
  return analysis.weeklyGoals.find((goal) => {
    if (goal.done || (bottleneck.subject && goal.subject !== bottleneck.subject)) return false;
    const text = normalizeLearningText(`${goal.ability} ${goal.successCriterion} ${goal.drillDesign}`);
    return terms.some((term) => text.includes(normalizeLearningText(term)));
  });
}

function bottleneckRule(analysis: LearningAnalysisCore): CoachRuleResult | null {
  const primary = analysis.bottlenecks[0];
  if (!primary) return null;
  const goal = matchingGoal(analysis, primary);
  const evidence = [`최근 7일 ${primary.count7d}회 · 최근 14일 ${primary.count14d}회`];
  if (primary.repeatedCues[0]) evidence.push(`놓친 단서 반복: ${primary.repeatedCues[0]}`);
  if (primary.repeatedJudgments[0]) evidence.push(`틀린 판단 반복: ${primary.repeatedJudgments[0]}`);
  if (primary.correctionActions[0]) evidence.push(`최근 교정 행동: ${primary.correctionActions[0]}`);
  if (analysis.plaire?.bottleneck && (KEYWORDS[primary.name] ?? [primary.name]).some((term) => normalizeLearningText(analysis.plaire?.bottleneck).includes(normalizeLearningText(term)))) evidence.push('Plaire 자기평가에서도 같은 병목이 관찰됨');
  if (goal) evidence.push(`이번 주 능력 목표 '${goal.ability}'와 실제 병목이 연결됨`);
  const low = primary.count14d < 2;
  return {
    id: `bottleneck:${primary.name}`,
    category: 'bottleneck',
    priority: 70 + Math.min(primary.count7d * 5 + primary.count14d * 2, 24),
    title: primary.name,
    reason: low ? '아직 표본은 적지만 최근 오답에서 확인된 병목입니다.' : '최근 오답에서 가장 반복적으로 나타난 병목입니다.',
    evidence,
    action: goal?.drillDesign?.trim() || (primary.correctionActions[0] ? `최근 ${primary.name} 오답 2개에 '${primary.correctionActions[0]}' 행동을 적용해 다시 검증하세요.` : `최근 ${primary.name} 관련 오답 2개를 새 문제 없이 다시 검증하세요.`),
    successCriterion: goal?.successCriterion?.trim() || '해설 없이 놓친 단서를 먼저 표시하고 교정 행동을 재현할 수 있는지 확인합니다.',
    confidence: confidence(primary.count14d),
  };
}

function retryRule(analysis: LearningAnalysisCore): CoachRuleResult | null {
  if (!analysis.retries.overdue) return null;
  return {
    id: 'retry:overdue',
    category: 'retry',
    priority: 82 + Math.min(analysis.retries.overdue * 4, 16),
    title: '오답 재검증 루프 미완료',
    reason: '예정된 재도전이 기한을 지나 병목 교정 여부를 확인하지 못하고 있습니다.',
    evidence: [`예정 ${analysis.retries.scheduled}개 중 완료 ${analysis.retries.completed}개`, `기한이 지난 재도전 ${analysis.retries.overdue}개`],
    action: '오늘 가장 오래된 재도전부터 2개만 처리하세요.',
    successCriterion: '해설 없이 정답 근거와 교정 행동을 다시 설명할 수 있으면 완료로 표시합니다.',
    confidence: analysis.retries.overdue >= 3 ? 'high' : 'medium',
  };
}

export function evaluateCoachRules(analysis: LearningAnalysisCore): CoachRuleResult[] {
  const rules = [retryRule(analysis), bottleneckRule(analysis)].filter((item): item is CoachRuleResult => Boolean(item));
  if (!rules.length) rules.push({
    id: 'data:insufficient', category: 'data', priority: 10, title: '분석 데이터 부족',
    reason: '최근 14일에 분류된 오답이나 재도전 기록이 충분하지 않습니다.',
    evidence: ['근거가 쌓이기 전에는 병목을 추정하지 않습니다.'],
    action: analysis.weeklyGoals.find((goal) => !goal.done)?.drillDesign || '다음 오답 1개에 틀린 판단·놓친 단서·교정 행동을 기록하세요.',
    successCriterion: analysis.weeklyGoals.find((goal) => !goal.done)?.successCriterion || '오답의 원인과 다음 행동이 한 문장씩 기록되면 충분합니다.', confidence: 'low',
  });
  return rules.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

export function diagnoseLearning(analysis: LearningAnalysisCore): CoachDiagnosis {
  const rules = evaluateCoachRules(analysis);
  const primary = rules[0];
  const hasEvidence = primary.category !== 'data';
  const warnings: string[] = [];
  if (analysis.retries.overdue) warnings.push(`기한이 지난 재도전이 ${analysis.retries.overdue}개 있습니다.`);
  if (analysis.execution.dailyDrillCompletionRate7d !== null && analysis.execution.dailyDrillCompletionRate7d < 40) warnings.push('최근 7일 Daily Drill 완료율이 낮습니다. 계획을 늘리기보다 기존 Drill을 줄여서 완료하세요.');
  const keepDoing = analysis.weeklyGoals.find((goal) => !goal.done && primary.evidence.some((item) => item.includes(goal.ability)))
    ? '현재 Weekly Capability Goal이 실제 병목과 연결되어 있으므로 새 계획보다 기존 Drill을 유지하세요.'
    : analysis.execution.dailyDrillCompletionRate7d !== null && analysis.execution.dailyDrillCompletionRate7d >= 70
      ? '최근 Daily Drill 실행 흐름은 유지할 가치가 있습니다.'
      : undefined;
  return {
    status: hasEvidence ? primary.reason : '분석할 오답 데이터가 아직 부족합니다.',
    primaryBottleneck: hasEvidence ? { title: primary.title, reason: primary.reason, evidence: primary.evidence, confidence: primary.confidence } : null,
    nextAction: { title: primary.category === 'retry' ? '재도전 2개 검증' : primary.category === 'data' ? '오답 근거 1개 기록' : `${primary.title} 오답 재검증`, description: primary.action, estimatedMinutes: primary.category === 'data' ? 10 : 20, successCriterion: primary.successCriterion },
    keepDoing,
    warnings: warnings.length ? warnings : undefined,
    rules,
  };
}
