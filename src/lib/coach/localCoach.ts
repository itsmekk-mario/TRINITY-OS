import { formatMinutes } from '../date.ts';
import { normalizeLearningText } from './context.ts';
import type { LearningAnalysis, LocalCoachMessage } from './types.ts';

export function formatLocalCoach(analysis: LearningAnalysis): LocalCoachMessage {
  const primary = analysis.diagnosis.primaryBottleneck;
  return {
    status: analysis.diagnosis.status,
    bottleneck: primary?.title ?? '분석 데이터 부족',
    evidence: primary?.evidence[0] ?? '최근 오답에 병목 분류와 교정 기록을 남기면 분석이 시작됩니다.',
    nextAction: analysis.diagnosis.nextAction.description,
    successCriterion: analysis.diagnosis.nextAction.successCriterion,
  };
}

export function answerLocalCoachQuestion(question: string, analysis: LearningAnalysis): string | null {
  const normalized = normalizeLearningText(question);
  if (!normalized) return null;
  if (/오늘(뭐|무엇).*(해야|할까|하지)|다음행동|지금.*(뭐|무엇).*(해야|할까)/.test(normalized)) {
    return `${analysis.diagnosis.nextAction.title}: ${analysis.diagnosis.nextAction.description}`;
  }
  if (/현재병목|핵심병목|가장많이틀린|많이틀린유형/.test(normalized)) {
    const primary = analysis.diagnosis.primaryBottleneck;
    return primary ? `현재 핵심 병목은 ${primary.title}입니다. ${primary.evidence[0]}` : '분석할 오답 데이터가 아직 부족합니다.';
  }
  if (/오늘.*(공부시간|학습시간)|(?:공부시간|학습시간).*오늘/.test(normalized)) {
    return `오늘 실제 학습시간은 ${formatMinutes(analysis.execution.todayStudyMinutes)}입니다.`;
  }
  if (/재도전.*(밀린|기한|있어|상태)|밀린.*재도전/.test(normalized)) {
    return analysis.retries.overdue
      ? `기한이 지난 재도전이 ${analysis.retries.overdue}개 있습니다. 가장 오래된 것부터 2개만 확인하세요.`
      : '현재 기한이 지난 재도전은 없습니다.';
  }
  return null;
}
