import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { classifyWrongAnswerDrill, NEURON_THEME9_CASES, rankSimilarCoreRules } from '../src/lib/drillClassification.ts';

test('수1 뉴런 Theme 9 / 251120 is strategy plus representation', () => {
  const result = classifyWrongAnswerDrill(NEURON_THEME9_CASES['251120']);
  assert.equal(result.primary, '전략·판단');
  assert.equal(result.secondary, '표상 실패');
  assert.match(result.rationale, /전략·판단/);
  assert.match(result.draft.content, /전략을 확정/);
});

test('수1 뉴런 Theme 9 / 220921 is representation-first with strategy or concept as support', () => {
  const result = classifyWrongAnswerDrill(NEURON_THEME9_CASES['220921']);
  assert.equal(result.primary, '표상 실패');
  assert.ok(result.secondary === '전략·판단' || result.secondary === '개념 공백', result.secondary);
});

test('Core Rule ranking returns at most three similar saved rules', () => {
  const classification = classifyWrongAnswerDrill(NEURON_THEME9_CASES['251120']);
  const ranked = rankSimilarCoreRules([
    { id: '1', subject: 'math', title: '닫힌 구간은 끝점과 극값을 표로 비교한다', content: '그래프 개형만 보고 판단하지 말고 표상 후 전략을 확정한다.', tags: ['표상', '전략'], masteryStatus: 'understanding', usageCount: 2 },
    { id: '2', subject: 'math', title: '삼각함수는 한 주기 그래프부터 그린다', content: '계수 부호만으로 개형을 단정하지 않는다.', tags: ['그래프'], masteryStatus: 'input', usageCount: 1 },
    { id: '3', subject: 'korean', title: '선지 근거 매핑', content: '비문학 선지와 지문을 연결한다.', tags: ['매핑'], masteryStatus: 'input', usageCount: 0 },
    { id: '4', subject: 'math', title: '필요조건만 보고 끝내지 않는다', content: '필요조건 확인 후 충분조건을 검증한다.', tags: ['판단'], masteryStatus: 'reproduction', usageCount: 4 },
    { id: '5', subject: 'english', title: '빈칸 단서', content: '빈칸 앞뒤 논리 관계를 표시한다.', tags: ['단서'], masteryStatus: 'input', usageCount: 0 },
  ], NEURON_THEME9_CASES['251120'], classification, 3);
  assert.ok(ranked.length <= 3);
  assert.equal(ranked[0]?.id, '1');
  assert.ok(ranked.every((rule) => rule.score > 0));
});

test('classification still returns bottlenecks when Core Rule lookup is skipped', () => {
  const result = classifyWrongAnswerDrill(NEURON_THEME9_CASES['220921']);
  assert.equal(result.primary, '표상 실패');
  assert.ok(result.draft.title.length > 0);
});

test('WeeklyDrill exposes a classification suggestion action without auto-applying', () => {
  const source = readFileSync(new URL('../src/pages/WeeklyDrill.tsx', import.meta.url), 'utf8');
  assert.match(source, /분류 제안/);
  assert.match(source, /1순위 적용/);
  assert.match(source, /2순위 적용/);
  assert.doesNotMatch(source, /setDrill\(\{ \.\.\.drill, bottleneck: classified\.primary \}\)/);
  assert.match(source, /\/api\/archive\/rules/);
});
