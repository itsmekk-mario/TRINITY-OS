import type { CoreRule } from './archiveApi';
import type { DrillBottleneck, Subject, WrongAnswerDrill } from '../types';

export const DRILL_BOTTLENECKS: DrillBottleneck[] = [
  '발문·해석',
  '개념 공백',
  '조건 누락',
  '표상 실패',
  '계산 실수',
  '전략·판단',
  '완결성 실패',
  '시간 관리',
  '기타',
];

export type DrillClassificationInput = Pick<WrongAnswerDrill, 'subject' | 'source' | 'question' | 'wrongJudgment' | 'missedCue' | 'correction' | 'transfer'>;

export type CoreRuleDraft = { title: string; content: string; subject: Subject };

export type SimilarCoreRule = CoreRule & { score: number };

export type DrillClassification = {
  primary: DrillBottleneck;
  secondary: DrillBottleneck | null;
  rationale: string;
  scores: Partial<Record<DrillBottleneck, number>>;
  matchedEvidence: Partial<Record<DrillBottleneck, string[]>>;
  draft: CoreRuleDraft;
};

type WeightedTerm = { term: string; weight: number };

const FIELD_WEIGHTS = [
  ['wrongJudgment', 3],
  ['missedCue', 2.4],
  ['correction', 2],
  ['transfer', 1.2],
] as const;

const PATTERNS: Record<Exclude<DrillBottleneck, '기타'>, WeightedTerm[]> = {
  '발문·해석': [
    { term: '발문', weight: 4 }, { term: '오독', weight: 4 }, { term: '무엇을묻', weight: 3 },
    { term: '질문의도', weight: 3 }, { term: '해석실패', weight: 3 }, { term: '문항해석', weight: 3 },
  ],
  '개념 공백': [
    { term: '개념공백', weight: 5 }, { term: '정의를모름', weight: 4 }, { term: '공식이비었', weight: 4 },
    { term: '원리미숙', weight: 3 }, { term: '정리의미', weight: 3 }, { term: '개념', weight: 2 },
    { term: '정의', weight: 2 }, { term: '공식', weight: 2 }, { term: '주기', weight: 1.2 },
  ],
  '조건 누락': [
    { term: '조건누락', weight: 6 }, { term: '조건을빠', weight: 5 }, { term: '놓친조건', weight: 5 },
    { term: '빠진조건', weight: 4 }, { term: '정의역', weight: 3 }, { term: '범위조건', weight: 3 },
    { term: '전제조건', weight: 3 },
  ],
  '표상 실패': [
    { term: '표상실패', weight: 6 }, { term: '표상하지', weight: 5 }, { term: '표상', weight: 4 },
    { term: '좌표평면', weight: 4 }, { term: '그래프로옮', weight: 4 }, { term: '그래프', weight: 3 },
    { term: '개형', weight: 2.5 }, { term: '시각화', weight: 3 }, { term: '그림으로', weight: 3 },
    { term: '표로옮', weight: 3.5 }, { term: '표로', weight: 2.2 }, { term: '좌표', weight: 2.2 },
  ],
  '계산 실수': [
    { term: '계산실수', weight: 6 }, { term: '부호실수', weight: 4 }, { term: '산술', weight: 3 },
    { term: '전개실수', weight: 3 }, { term: '연산실수', weight: 3 }, { term: '계산오류', weight: 4 },
    { term: '계산을틀', weight: 4 },
  ],
  '전략·판단': [
    { term: '전략판단', weight: 6 }, { term: '필요조건만', weight: 5 }, { term: '충분조건', weight: 3.5 },
    { term: '필요조건', weight: 3.5 }, { term: '전략을건너', weight: 4.5 }, { term: '전략을확정', weight: 4 },
    { term: '접근을선택', weight: 3.5 }, { term: '판단했', weight: 3.2 }, { term: '단정했', weight: 3 },
    { term: '전략', weight: 3 }, { term: '판단', weight: 2.4 }, { term: '방법선택', weight: 2.8 },
  ],
  '완결성 실패': [
    { term: '완결성', weight: 5 }, { term: '검산하지', weight: 4 }, { term: '경우나누기', weight: 4 },
    { term: '빠진경우', weight: 4 }, { term: '끝점비교', weight: 3.5 }, { term: '마지막확인', weight: 3 },
    { term: '검산', weight: 2.5 },
  ],
  '시간 관리': [
    { term: '시간부족', weight: 5 }, { term: '시간배분', weight: 4 }, { term: '서둘렀', weight: 3.5 },
    { term: '마감', weight: 3 }, { term: '속도', weight: 2 }, { term: '시간', weight: 1.4 },
  ],
};

export function normalizeClassificationText(value: string | undefined) {
  return (value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[\s·ㆍ,./#!$%^&*;:{}=\-_~()[\]"'“”‘’<>?+]+/g, '')
    .trim();
}

function fieldText(input: DrillClassificationInput) {
  return FIELD_WEIGHTS.map(([field, weight]) => ({
    field,
    raw: input[field] ?? '',
    text: normalizeClassificationText(input[field]),
    weight,
  }));
}

function collectMatches(input: DrillClassificationInput) {
  const scores: Partial<Record<DrillBottleneck, number>> = {};
  const matchedEvidence: Partial<Record<DrillBottleneck, string[]>> = {};
  const fields = fieldText(input);

  for (const [bottleneck, terms] of Object.entries(PATTERNS) as [Exclude<DrillBottleneck, '기타'>, WeightedTerm[]][]) {
    const evidence: string[] = [];
    let score = 0;
    for (const { term, weight } of terms) {
      const needle = normalizeClassificationText(term);
      if (!needle) continue;
      for (const field of fields) {
        if (!field.text.includes(needle)) continue;
        score += weight * field.weight;
        const snippet = field.raw.trim().slice(0, 80);
        if (snippet && !evidence.includes(`${labelOf(field.field)}: ${term}`)) evidence.push(`${labelOf(field.field)}: ${term}`);
      }
    }
    if (score > 0) {
      scores[bottleneck] = Math.round(score * 10) / 10;
      matchedEvidence[bottleneck] = evidence.slice(0, 4);
    }
  }

  return { scores, matchedEvidence };
}

function labelOf(field: (typeof FIELD_WEIGHTS)[number][0]) {
  return { wrongJudgment: '틀린 판단', missedCue: '놓친 단서', correction: '교정 행동', transfer: '전이 Drill' }[field];
}

function rankedBottlenecks(scores: Partial<Record<DrillBottleneck, number>>) {
  return (Object.entries(scores) as [DrillBottleneck, number][])
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1] || DRILL_BOTTLENECKS.indexOf(a[0]) - DRILL_BOTTLENECKS.indexOf(b[0]));
}

export function draftCoreRule(input: DrillClassificationInput, primary: DrillBottleneck): CoreRuleDraft {
  const correction = input.correction.trim();
  const transfer = input.transfer.trim();
  const title = correction
    ? correction.split(/[.。\n]/)[0]!.slice(0, 60)
    : `${primary} 교정 기준`;
  const content = [
    correction || `${primary}가 다시 나오지 않도록 다음 문제에서 먼저 할 행동을 한 문장으로 고정한다.`,
    transfer ? `전이: ${transfer}` : '',
  ].filter(Boolean).join('\n');
  return { title, content, subject: input.subject };
}

export function classifyWrongAnswerDrill(input: DrillClassificationInput): DrillClassification {
  const { scores, matchedEvidence } = collectMatches(input);
  const ranked = rankedBottlenecks(scores);
  const hasText = FIELD_WEIGHTS.some(([field]) => (input[field] ?? '').trim());
  const primary = ranked[0]?.[0] ?? '기타';
  const secondary = ranked[1] && ranked[1][1] >= ranked[0]![1] * 0.28 ? ranked[1][0] : ranked[1]?.[0] ?? null;
  const rationale = !hasText
    ? '틀린 판단·놓친 단서·교정 행동·전이 Drill이 비어 있어 기타로 제안합니다.'
    : ranked.length
      ? [
          `1순위 ${primary}은(는) ${matchedEvidence[primary]?.join(', ') || '기록 표현'}에서 가장 강하게 나타났습니다.`,
          secondary ? `2순위 ${secondary}은(는) 보조 원인으로 함께 보입니다.` : '뚜렷한 2순위 병목은 없습니다.',
        ].join(' ')
      : '키워드가 약해 기타로 제안합니다. 기록을 조금 더 구체적으로 적으면 분류가 선명해집니다.';

  return {
    primary,
    secondary: primary === '기타' ? null : secondary && secondary !== primary ? secondary : ranked[1]?.[0] ?? null,
    rationale,
    scores,
    matchedEvidence,
    draft: draftCoreRule(input, primary),
  };
}

export function tokensForSimilarity(value: string) {
  return [...new Set(normalizeClassificationText(value)
    .replace(/[0-9a-z]+/g, ' $& ')
    .match(/[가-힣]{2,}|[a-z]{3,}|[0-9]{4,}/g) ?? [])];
}

export function rankSimilarCoreRules(rules: CoreRule[], input: DrillClassificationInput, classification: DrillClassification, limit = 3): SimilarCoreRule[] {
  const query = tokensForSimilarity([
    input.wrongJudgment, input.missedCue, input.correction, input.transfer, input.source, input.question,
    classification.primary, classification.secondary ?? '', classification.draft.title, classification.draft.content,
  ].join(' '));
  if (!query.length) return [];
  const subject = input.subject === '국어' ? 'korean' : input.subject === '수학' ? 'math' : input.subject === '영어' ? 'english' : undefined;
  return rules
    .map((rule) => {
      const hay = tokensForSimilarity(`${rule.title} ${rule.content} ${rule.tags.join(' ')} ${rule.subject}`);
      const overlap = query.filter((token) => hay.includes(token)).length;
      const subjectBonus = subject && rule.subject === subject ? 1.4 : 0;
      const score = overlap + subjectBonus;
      return { ...rule, score };
    })
    .filter((rule) => rule.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'ko'))
    .slice(0, limit);
}

export const NEURON_THEME9_CASES: Record<'251120' | '220921', DrillClassificationInput> = {
  '251120': {
    subject: '수학',
    source: '수1 뉴런 Theme 9',
    question: '251120',
    wrongJudgment: '그래프 개형만 보고 최댓값이 한 점에서 바로 나온다고 판단했다. 필요조건만 확인하고 끝점과 비교하는 전략을 건너뛰었다.',
    missedCue: '닫힌 구간의 끝점 값을 좌표평면에 표상하지 않았고, 후보점을 표로 정리하지 않았다.',
    correction: '먼저 극값과 끝점을 표로 옮긴 뒤, 그 다음에 최댓값을 고르는 전략을 확정한다.',
    transfer: '닫힌 구간 최댓값 문항에서 표상 후 전략 선택 순서를 3회 재현한다.',
  },
  '220921': {
    subject: '수학',
    source: '수1 뉴런 Theme 9',
    question: '220921',
    wrongJudgment: '삼각함수 식을 그래프로 옮기지 않고 계수 부호만으로 개형을 단정했다.',
    missedCue: '주기와 평행이동을 좌표에 표시하지 않았고, 한 주기의 교점을 표상하지 않았다.',
    correction: '먼저 한 주기 그래프를 그리고 교점을 표시한 다음 계산한다. 주기의 정의를 다시 확인한다.',
    transfer: '삼각함수 그래프 해석 문항에서 표상을 먼저 하는 Drill을 3회 재현한다.',
  },
};
