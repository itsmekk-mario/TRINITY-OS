import test from 'node:test';
import assert from 'node:assert/strict';
import { yptClockMismatch } from '../src/lib/yptClock.ts';

test('YPT clock reconciliation accepts a restored matching interval', () => {
  const startedAt = Date.parse('2026-09-23T13:45:00.000Z');
  const remote = { connected: true, state: 'running', activeSubject: '국어', activeStartedAt: startedAt };
  assert.equal(yptClockMismatch(remote, { running: true, subject: '국어', since: new Date(startedAt).toISOString() }), false);
});

test('YPT clock reconciliation catches another tab changing subject or resuming a different interval', () => {
  const startedAt = Date.parse('2026-09-23T13:45:00.000Z');
  const remote = { connected: true, state: 'running', activeSubject: '국어', activeStartedAt: startedAt };
  assert.equal(yptClockMismatch(remote, { running: true, subject: '수학', since: new Date(startedAt).toISOString() }), true);
  assert.equal(yptClockMismatch(remote, { running: true, subject: '국어', since: new Date(startedAt - 60_000).toISOString() }), true);
  assert.equal(yptClockMismatch(remote, { running: false, subject: '국어' }), true);
  assert.equal(yptClockMismatch({ ...remote, state: 'idle' }, { running: true, subject: '국어', since: new Date(startedAt).toISOString() }), true);
});
