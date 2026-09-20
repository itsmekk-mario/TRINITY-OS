import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';

const archive=readFileSync(new URL('../src/pages/LearningArchive.tsx',import.meta.url),'utf8');
const train=readFileSync(new URL('../src/pages/TrainHub.tsx',import.meta.url),'utf8');
const panel=readFileSync(new URL('../src/components/learning/CoreRuleIntelligencePanel.tsx',import.meta.url),'utf8');

test('Learning Intelligence UI exposes active rules, priority and evidence',()=>{
  assert.match(archive,/Intelligence/);
  assert.match(panel,/active-rules/);
  assert.match(panel,/priorityScore/);
  assert.match(panel,/Evidence Timeline/);
  assert.match(panel,/failures7d/);
});

test('Active Core Rules connect evidence, linked records, and the unified Review Queue',()=>{
  assert.match(panel,/관련 오답 보기/);
  assert.match(panel,/Drill/);
  assert.match(panel,/onOpenReviewQueue/);
  assert.match(panel,/learning-intelligence\/reviews/);
  assert.match(archive,/insights:review/);
});

test('Core Rules use the same document archive interaction model as Learning Archive',()=>{
  assert.match(archive,/core-rule-document-list/);
  assert.match(archive,/Core Rule 검색/);
  assert.match(archive,/새 Core Rule/);
  assert.match(archive,/selectedRule/);
  assert.match(archive,/ruleEditorOpen/);
  assert.match(archive,/연결 문서/);
  assert.doesNotMatch(archive,/core-rule-workspace/);
});

test('Wrong Answers UI supports subject, source and time grouping',()=>{
  assert.match(train,/'source'/);
  assert.match(train,/'time'/);
  assert.match(train,/출처별/);
  assert.match(train,/시간별/);
});

test('Archive UI uses server cursor and an explicit load-more action',()=>{
  assert.match(archive,/archiveCursor/);
  assert.match(archive,/archiveHasMore/);
  assert.match(archive,/더 보기/);
});
