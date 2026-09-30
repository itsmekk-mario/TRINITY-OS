import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateArenaBadges } from '../src/lib/arenaBadges.ts';

const data = () => ({ calendar: {}, sessions: [], mockSchedule: [], journals: {}, scores: [], resources: [], goals: [], weeklyCapabilityGoals: [], wrongAnswerDrills: [], dailyDrills: [], monthlyPlans: [], notionPages: [], routine: [], quotes: [], examDate: '', googleClientId: '', plaire: {}, trinity: [] });
const profile = { nickname: 'T', grade: '', targetUniversity: '', targetDepartment: '', targetAdmissionType: '', studyGoal: [], achievementLevel: '' };
const score = { total: 0, breakdown: { execution: 0, problemSolving: 0, consistency: 0, growth: 0 }, metrics: { currentWeekSeconds: 0, previousWeekSeconds: 0, planExecutionRate: 0, activeDays: 0, streakDays: 0, scoreChange: 0, drillCompletionRate: 0, completedTripleDrills: 0, weaknessImprovementRate: 0, growthRate: 0, weakAreas: [], nextActions: [] }, calculatedAt: '2026-09-12T00:00:00Z' };

test('Arena 배지는 빈 데이터에서 임의로 해금되지 않는다', () => {
  const badges = calculateArenaBadges(data(), score, profile, new Set());
  assert.ok(badges.length >= 40);
  assert.equal(badges.filter((badge) => badge.unlocked).length, 0);
  assert.ok(badges.filter((badge) => badge.secret).length >= 5);
});

test('학습·재도전·전이 기록으로 대응 배지만 해금한다', () => {
  const value = data();
  value.sessions.push({ id: 's1', date: '2026-09-12', subject: '수학', seconds: 5400 });
  value.wrongAnswerDrills.push({ id: 'w1', date: '2026-09-01', subject: '수학', source: '실모', question: '1', wrongJudgment: '조건 누락', missedCue: '정의역', correction: '검산', transfer: '유사 문제', retries: [{ id: '3d', label: '3일', dueDate: '2026-09-04', completedDate: '2026-09-04' }] });
  const badges = calculateArenaBadges(value, score, profile, new Set());
  assert.equal(badges.find((badge) => badge.code === 'first-focus')?.unlocked, true);
  assert.equal(badges.find((badge) => badge.code === 'deep-90')?.unlocked, true);
  assert.equal(badges.find((badge) => badge.code === 'retry-3d')?.unlocked, true);
  assert.equal(badges.find((badge) => badge.code === 'retry-14d')?.unlocked, false);
});

test('서버에서 이미 수여된 achievement 코드는 계속 인정한다', () => {
  const badges = calculateArenaBadges(data(), score, profile, new Set(['growth-10']));
  assert.equal(badges.find((badge) => badge.code === 'growth-10')?.unlocked, true);
});
