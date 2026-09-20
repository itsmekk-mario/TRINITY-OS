import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';

const archive=readFileSync(new URL('../src/pages/LearningArchive.tsx',import.meta.url),'utf8');
const train=readFileSync(new URL('../src/pages/TrainHub.tsx',import.meta.url),'utf8');
const panel=readFileSync(new URL('../src/components/learning/CoreRuleIntelligencePanel.tsx',import.meta.url),'utf8');
const quickCapture=readFileSync(new URL('../src/components/learning/QuickCaptureSheet.tsx',import.meta.url),'utf8');

test('Learning Intelligence UI exposes active rules, priority and evidence',()=>{
  assert.match(archive,/Intelligence/);
  assert.match(panel,/active-rules/);
  assert.match(panel,/priorityScore/);
  assert.match(panel,/Evidence Timeline/);
  assert.match(panel,/failures7d/);
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

test('Quick Capture keeps one request identity through retry and exposes optional learning links',()=>{
  assert.match(train,/QuickCaptureSheet/);
  assert.match(train,/빠른 오답 기록/);
  assert.match(quickCapture,/quick-capture/);
  assert.match(quickCapture,/useRef\(requestId\(\)\)/);
  assert.match(quickCapture,/Core Rule/);
  assert.match(quickCapture,/Learning Archive/);
  assert.match(quickCapture,/Review/);
  assert.match(quickCapture,/Drill/);
  assert.match(quickCapture,/disabled=\{busy\}/);
  assert.match(quickCapture,/오답 기록 완료/);
});
