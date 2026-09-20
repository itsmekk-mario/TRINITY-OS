import test from 'node:test';
import assert from 'node:assert/strict';
import { getCurrentStudyDay, getStudyDayKey, getStudyDayRange, shouldAutoAdvanceWeek, STUDY_DAY_START_HOUR } from '../src/lib/date.ts';
import { splitSessionByStudyDay, studyTotals } from '../src/lib/studyTotals.ts';
import { calculateArenaScore } from '../src/lib/arenaScore.ts';

const at = (value) => new Date(value);
test('Study Day uses the fixed 06:00 Asia/Seoul boundary', () => {
  assert.equal(STUDY_DAY_START_HOUR, 6);
  assert.equal(getStudyDayKey(at('2026-09-16T20:59:59Z')), '2026-09-16'); // 05:59:59 KST
  assert.equal(getStudyDayKey(at('2026-09-16T21:00:00Z')), '2026-09-17'); // 06:00:00 KST
  assert.equal(getStudyDayKey(at('2026-09-17T14:59:59Z')), '2026-09-17'); // 23:59:59 KST
  assert.equal(getStudyDayKey(at('2026-09-17T17:30:00Z')), '2026-09-17'); // 02:30:00 KST next day
  assert.equal(getStudyDayKey(at('2026-09-17T20:59:59Z')), '2026-09-17');
  assert.equal(getStudyDayKey(at('2026-09-17T21:00:00Z')), '2026-09-18');
  const range = getStudyDayRange('2026-09-17');
  assert.equal(range.start.toISOString(), '2026-09-16T21:00:00.000Z');
  assert.equal(range.end.toISOString(), '2026-09-17T21:00:00.000Z');
  assert.equal(getCurrentStudyDay(at('2026-09-17T17:00:00Z')), '2026-09-17');
});
const session = (start, end) => ({ id: start, date: 'legacy-date', subject: '수학', seconds: (Date.parse(end) - Date.parse(start)) / 1000, segments: [{ kind: 'focus', start, end }] });
test('sessions are split only at 06:00 KST', () => {
  assert.deepEqual(studyTotals([session('2026-09-16T20:30:00Z', '2026-09-16T20:50:00Z')]), { '2026-09-16': 1200 }); // 05:30-05:50
  assert.deepEqual(studyTotals([session('2026-09-16T20:30:00Z', '2026-09-16T21:30:00Z')]), { '2026-09-16': 1800, '2026-09-17': 1800 });
  assert.deepEqual(studyTotals([session('2026-09-17T14:00:00Z', '2026-09-17T17:00:00Z')]), { '2026-09-17': 10800 }); // 23:00-02:00
  assert.deepEqual(studyTotals([session('2026-09-17T14:00:00Z', '2026-09-17T22:00:00Z')]), { '2026-09-17': 25200, '2026-09-18': 3600 }); // 23:00-07:00
  assert.equal(splitSessionByStudyDay(session('2026-09-16T21:00:00Z', '2026-09-16T22:00:00Z'))[0].date, '2026-09-17');
});
test('Arena derives weekly study seconds from Study Day segments, not stored session dates', () => {
  const data = { sessions: [session('2026-09-17T14:00:00Z', '2026-09-17T17:00:00Z'), session('2026-09-17T19:00:00Z', '2026-09-17T20:00:00Z')], calendar: {}, dailyDrills: [], wrongAnswerDrills: [], scores: [], weeklyCapabilityGoals: [] };
  const score = calculateArenaScore(data, at('2026-09-17T17:00:00Z'));
  assert.equal(score.metrics.currentWeekSeconds, 14_400); // A 23:00–02:00 and B 04:00–05:00 are both Sep 17 Study Day.
});

test('weekly plan follows a new current week without overriding manual navigation', () => {
  assert.equal(shouldAutoAdvanceWeek('2026-09-14', '2026-09-14', '2026-09-21'), true);
  assert.equal(shouldAutoAdvanceWeek('2026-09-07', '2026-09-14', '2026-09-21'), false);
  assert.equal(shouldAutoAdvanceWeek('2026-09-14', '2026-09-14', '2026-09-14'), false);
});