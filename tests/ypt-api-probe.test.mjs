import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi, ProbeError, runProbe } from '../scripts/ypt-api-smoke.mjs';

function fixture({ failAt, breakAccrual = 0, persistFailure = false } = {}) {
  let time = 1_800_000_000_000;
  let total = 100_000;
  let active;
  let starts = 0;
  let stops = 0;
  const calls = [];
  const evidence = [];
  const log = () => ({ sm: total, dt: '2026-09-23' });
  const credentials = { email: 'private@example.invalid', password: 'do-not-log-password', subject: '수학', confirmedIdle: true };
  let token;
  const options = {
    now: () => time,
    sleep: async ms => { time += ms; if (ms === 10_000) total += breakAccrual; },
    persist: async value => {
      if (persistFailure && value.stage === 'study_1') throw new Error('private secret in disk error');
      evidence.push(value);
    },
    api: {
      setToken: value => { token = value; },
      post: async (path, body, auth) => {
        calls.push({ path, body: { ...body }, auth });
        time += 25;
        if (path === failAt) throw new ProbeError('NETWORK_OR_TIMEOUT_OUTCOME_UNKNOWN');
        if (path.endsWith('sign-in-jwt')) return { data: { s: true, jwt: 'do-not-log-jwt' }, elapsedMs: 25 };
        if (path.endsWith('reload/info')) return { data: { s: true, ss: [{ tt: '수학', dl: false }], dl: log() }, elapsedMs: 25 };
        if (path.endsWith('/start')) { assert.equal(evidence.at(-1).stage, `start_${starts + 1}`); active = time - 25; starts++; }
        if (path.endsWith('/stop')) { assert.equal(body.startedAt, active); total += time - 25 - active; active = undefined; stops++; }
        return { data: { s: true, dl: log() }, elapsedMs: 25 };
      },
    },
  };
  return { credentials, options, calls, evidence, counts: () => ({ starts, stops, token }) };
}

test('YPT probe records two real elapsed segments, excludes break, and stores no credentials', async () => {
  const f = fixture();
  const report = await runProbe(f.credentials, f.options);
  assert.equal(report.passed, true);
  assert.equal(report.breakAddedMs, 0);
  assert.equal(report.stopConfirmed, true);
  assert.equal(report.activeStartedAt, null);
  assert.deepEqual(f.counts(), { starts: 2, stops: 2, token: undefined });
  assert.equal(f.credentials.password, undefined);
  const serialized = JSON.stringify(f.evidence);
  for (const secret of ['do-not-log-password', 'do-not-log-jwt', 'private@example.invalid']) assert(!serialized.includes(secret));
});

test('YPT probe never starts before explicit idle confirmation and exact subject match', async () => {
  for (const patch of [{ confirmedIdle: false }, { subject: 'missing' }]) {
    const f = fixture(); Object.assign(f.credentials, patch);
    const report = await runProbe(f.credentials, f.options);
    assert.equal(report.passed, false);
    assert.equal(f.counts().starts, 0);
  }
});

test('YPT ambiguous start retains timestamp and never retries or sends a blind stop', async () => {
  const f = fixture({ failAt: '/study/start' });
  const report = await runProbe(f.credentials, f.options);
  assert.equal(report.requiresAppCheck, true);
  assert.equal(report.stopConfirmed, false);
  assert.equal(typeof report.activeStartedAt, 'number');
  assert.equal(f.calls.filter(call => call.path === '/study/start').length, 1);
  assert.equal(f.calls.filter(call => call.path === '/study/stop').length, 0);
});

test('YPT ambiguous stop preserves evidence and prevents second segment', async () => {
  const f = fixture({ failAt: '/study/stop' });
  const report = await runProbe(f.credentials, f.options);
  assert.equal(report.requiresAppCheck, true);
  assert.equal(report.passed, false);
  assert.equal(f.calls.filter(call => call.path === '/study/start').length, 1);
  assert.equal(f.calls.filter(call => call.path === '/study/stop').length, 1);
});

test('YPT probe stops a confirmed timer even when a local progress write fails', async () => {
  const f = fixture({ persistFailure: true });
  const report = await runProbe(f.credentials, f.options);
  assert.equal(report.error, 'LOCAL_FAILURE_TIMER_STOPPED');
  assert.equal(report.stopConfirmed, true);
  assert.equal(f.counts().stops, 1);
  assert(!JSON.stringify(report).includes('private secret'));
});

test('YPT probe rejects study time accruing during break', async () => {
  const f = fixture({ breakAccrual: 10_000 });
  const report = await runProbe(f.credentials, f.options);
  assert.equal(report.error, 'BREAK_OR_DAY_MISMATCH');
  assert.equal(f.counts().starts, 1);
  assert.equal(report.stopConfirmed, true);
});

test('YPT HTTP 200 with s:false is failure and upstream messages are not exposed', async () => {
  const api = createApi(async () => Response.json({ s: false, c: 'private-server-message' }));
  await assert.rejects(api.post('/study/start', {}), { message: 'API_REJECTED' });
});

test('YPT transport uses fixed host, JWT auth, 15-second cancellation, and rejects redirects', async () => {
  const calls = [];
  const api = createApi(async (url, options) => { calls.push({ url, options }); return Response.json({ s: true }); });
  api.setToken('secret');
  await api.post('/user/sign-in-jwt', {}, false);
  await api.post('/study/start', { subject: '수학' });
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(calls[1].options.headers.Authorization, 'JWT secret');
  assert.equal(calls[1].url, 'https://pi.tgclab.com/study/start');
  assert.equal(calls[1].options.redirect, 'error');
  assert(calls[1].options.signal instanceof AbortSignal);
});

test('YPT network and malformed response errors are sanitized and uncertain', async () => {
  for (const fetcher of [async () => { throw new Error('private jwt'); }, async () => new Response('private password')]) {
    const api = createApi(fetcher);
    await assert.rejects(api.post('/study/stop', {}), error => error instanceof ProbeError && error.message.endsWith('OUTCOME_UNKNOWN') && !error.message.includes('private'));
  }
});
