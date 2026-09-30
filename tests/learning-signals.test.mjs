import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePlannedMinutes } from '../src/lib/plannedTime.ts';
import { deriveLearningSignals } from '../src/lib/learningSignals.ts';

const emptyData = () => ({
  calendar: {}, sessions: [], mockSchedule: [], journals: {}, scores: [], resources: [], goals: [], weeklyCapabilityGoals: [], wrongAnswerDrills: [], dailyDrills: [], monthlyPlans: [], notionPages: [], routine: [], quotes: [], examDate: '2026-11-19', googleClientId: '', plaire: {}, trinity: [],
});

test('계획량에서 명시적인 시간만 읽고 문제 수는 시간으로 오인하지 않는다', () => {
  assert.equal(parsePlannedMinutes('31문제 · 90분'), 90);
  assert.equal(parsePlannedMinutes('2시간'), 120);
  assert.equal(parsePlannedMinutes('1시간 30분'), 90);
  assert.equal(parsePlannedMinutes('31문제'), 0);
});

test('Learning Signal은 원본 AppData를 수정하지 않고 시간과 재도전을 파생한다', () => {
  const data = emptyData();
  data.calendar['2026-09-12'] = { date: '2026-09-12', study: '', minutes: 0, exam: '', event: '', condition: 3, reflection: '', plans: [{ id: 'p1', subject: '수학', title: '훈련', detail: '', quantity: '31문제 · 90분', done: false }] };
  data.sessions.push({ id: 's1', date: '2026-09-12', subject: '수학', seconds: 3600 });
  data.wrongAnswerDrills.push({ id: 'w1', date: '2026-09-09', subject: '수학', source: '실모', question: '28', wrongJudgment: '조건 확인 생략', missedCue: '정의역', correction: '정의역 확인', transfer: '유사 문제 적용', bottleneck: '전략·판단', retries: [{ id: '3d', label: '3일 후 재도전', dueDate: '2026-09-12', completedDate: '2026-09-12' }] });
  const before = JSON.stringify(data);
  const result = deriveLearningSignals(data, new Date('2026-09-12T12:00:00+09:00'));
  assert.equal(result.execution.todayMinutes, 60);
  assert.equal(result.execution.plannedMinutes, 90);
  assert.equal(result.retries[0].rate, 100);
  assert.equal(JSON.stringify(data), before);
});
