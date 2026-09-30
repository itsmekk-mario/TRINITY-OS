import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {sanitizeLearningGraphAnalysis} from '../worker/src/ai-learning-graph.ts';

test('AI wrong-answer graph rejects hallucinated ids and canonicalizes pairs',()=>{
  const result=sanitizeLearningGraphAnalysis({
    summary:'반복 조건 누락',
    links:[
      {sourceId:'b',targetId:'a',relationType:'same_bottleneck',score:0.91,rationale:'조건 누락'},
      {sourceId:'a',targetId:'ghost',relationType:'same_concept',score:1,rationale:'invalid'},
      {sourceId:'a',targetId:'a',relationType:'same_concept',score:1,rationale:'self'},
    ],
    patterns:[{name:'조건 누락',evidenceIds:['a','ghost','b'],explanation:'반복'}],
    recommendations:[{title:'조건 검증',reason:'반복',action:'경계값을 먼저 확인',successCriterion:'3문제 연속 누락 0회',priority:90,wrongAnswerIds:['a','ghost']}],
  },['a','b']);
  assert.equal(result.links.length,1);
  assert.deepEqual([result.links[0].sourceId,result.links[0].targetId],['a','b']);
  assert.deepEqual(result.patterns[0].evidenceIds,['a','b']);
  assert.deepEqual(result.recommendations[0].wrongAnswerIds,['a']);
});

test('Worker and UI expose backend AI wrong-answer graph',async()=>{
  const worker=await readFile(new URL('../worker/src/index.ts',import.meta.url),'utf8');
  const train=await readFile(new URL('../src/pages/TrainHub.tsx',import.meta.url),'utf8');
  assert.match(worker,/aiLearningGraph/);
  assert.match(train,/AI 연결 분석/);
  assert.match(train,/learning-graph\/analyze/);
  assert.match(train,/AI 연결 오답/);
});
