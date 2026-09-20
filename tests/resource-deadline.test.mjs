import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBackupValue } from '../src/lib/backupFormat.ts';
import { formatResourceDeadline, isOverdueResource, resourceDueInDays } from '../src/lib/resourceDeadline.ts';

const resource = (overrides = {}) => ({ id: 'r1', subject: '수학', group: '수2', name: '뉴런', total: 42, done: 34, ...overrides });
const now = '2026-09-20T03:00:00+09:00'; // before 06:00, so study day is 9/19
const app = (resources) => ({ calendar: {}, sessions: [], mockSchedule: [], journals: {}, scores: [], resources, goals: [], weeklyCapabilityGoals: [], wrongAnswerDrills: [], dailyDrills: [], monthlyPlans: [], notionPages: [], routine: [], quotes: [], examDate: '', googleClientId: '', plaire: {}, trinity: [] });

test('Resource without dueDate remains valid and legacy resources load unchanged', () => {
  const legacy = resource();
  assert.equal(resourceDueInDays(legacy, now), undefined);
  assert.equal(parseBackupValue({ version: 1, data: app([legacy]) }, app([])).app.resources[0].dueDate, undefined);
});
test('D-N and today due use the 06:00 Study Day boundary', () => {
  assert.equal(resourceDueInDays(resource({ dueDate: '2026-09-23' }), now), 4);
  assert.equal(formatResourceDeadline(resource({ dueDate: '2026-09-19' }), now), '오늘 마감');
});
test('overdue excludes completed resources', () => {
  assert.equal(isOverdueResource(resource({ dueDate: '2026-09-18' }), now), true);
  assert.equal(isOverdueResource(resource({ dueDate: '2026-09-18', done: 42 }), now), false);
});
test('Backup v2 preserves resource dueDate', () => {
  const due = resource({ dueDate: '2026-09-24' });
  const parsed = parseBackupValue({ version: 2, app: app([due]), learningArchive: { entries: [], annotations: [], coreRules: [], ruleLinks: [], reviews: [] } }, app([]));
  assert.equal(parsed.app.resources[0].dueDate, '2026-09-24');
});
