import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleYptApi } from '../worker/src/ypt.ts';

const migration = readFileSync(new URL('../worker/migrations/0021_ypt_connections.sql', import.meta.url), 'utf8');
function harness() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users(id) VALUES(1),(2);');
  db.exec(migration);
  const wrap = (statement, args = []) => ({
    bind: (...values) => wrap(statement, values),
    first: async () => statement.get(...args) ?? null,
    run: async () => ({ meta: { changes: statement.run(...args).changes } }),
  });
  const env = { DB: { prepare: sql => wrap(db.prepare(sql)) }, YPT_ENCRYPTION_KEY: Buffer.alloc(32, 13).toString('base64') };
  const reply = (body, status = 200) => Response.json(body, { status });
  const call = (path, method = 'GET', body, userId = 1) => handleYptApi(new Request(`https://worker.test/api/ypt/${path}`, { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }), env, userId, '', reply);
  const events = [];
  let startReply = () => Response.json({ s: true, dl: { sm: 0 } });
  let stopReply = () => Response.json({ s: true, dl: { sm: 1000 } });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const path = new URL(url).pathname;
    const body = JSON.parse(options.body);
    events.push({ path, body, authorization: options.headers.Authorization, timeout: options.signal instanceof AbortSignal });
    if (path === '/user/sign-in-jwt') return Response.json({ s: true, jwt: 'private-ypt-jwt' });
    if (path === '/user/v2/reload/info') return Response.json({ s: true, ss: [{ tt: '국어' }, { tt: '수학' }, { tt: '물리학1' }] });
    if (path === '/study/start') return startReply();
    if (path === '/study/stop') return stopReply();
    throw new Error('Unexpected external URL');
  };
  return { db, env, call, events, setStart: value => { startReply = value; }, setStop: value => { stopReply = value; }, close: () => { globalThis.fetch = originalFetch; db.close(); } };
}

test('YPT connection encrypts JWT, enforces user isolation, maps subjects and reuses exact stop timestamp', async () => {
  const h = harness();
  try {
    const connected = await (await h.call('connect', 'POST', { email: 'private@example.invalid', password: 'secret' })).json();
    assert.equal(connected.connected, true);
    assert.deepEqual(connected.subjects, ['국어', '수학', '물리학1']);
    assert.equal(connected.mapping['국어'], '국어');
    assert(!JSON.stringify(connected).includes('private-ypt-jwt'));
    const stored = h.db.prepare('SELECT encrypted_jwt FROM ypt_connections WHERE user_id=1').get().encrypted_jwt;
    assert(stored.startsWith('v1:'));
    assert(!stored.includes('private-ypt-jwt'));
    assert.equal((await(await h.call('status', 'GET', undefined, 2)).json()).connected, false);
    assert.equal((await h.call('start', 'POST', { subject: '탐구' })).status, 422);
    assert.equal((await h.call('mapping', 'PUT', { mapping: { 탐구: '물리학1' } })).status, 200);
    const start = await(await h.call('start', 'POST', { subject: '탐구' })).json();
    assert.equal(start.state, 'running');
    assert.equal(h.events.at(-1).body.subject, '물리학1');
    assert.equal(h.events.at(-1).authorization, 'JWT private-ypt-jwt');
    assert.equal((await h.call('start', 'POST', { subject: '탐구' })).status, 409);
    const stop = await(await h.call('stop', 'POST')).json();
    assert.equal(stop.state, 'idle');
    assert.equal(h.events.at(-1).body.startedAt, start.startedAt);
    assert.equal((await h.call('stop', 'POST')).status, 200);
    assert.equal(h.events.filter(item => item.path === '/study/stop').length, 1);
    assert.equal(h.db.prepare('SELECT state,active_started_at FROM ypt_connections WHERE user_id=1').get().state, 'idle');
  } finally { h.close(); }
});

test('YPT rejects unauthorized access and mappings to nonexistent subjects', async () => {
  const h = harness();
  try {
    assert.equal((await h.call('status', 'GET', undefined, null)).status, 401);
    await h.call('connect', 'POST', { email: 'test@invalid.example', password: 'private' });
    assert.equal((await h.call('mapping', 'PUT', { mapping: { 국어: 'made-up' } })).status, 400);
    assert.equal((await h.call('mapping', 'PUT', { mapping: { admin: '국어' } })).status, 400);
    assert.equal((await h.call('start', 'POST', { subject: '수학' }, 2)).status, 404);
    assert.equal((await h.call('start', 'POST', null)).status, 400);
    assert.equal((await h.call('mapping', 'PUT', [])).status, 400);
  } finally { h.close(); }
});

test('YPT ambiguous start preserves the timestamp, blocks retry, and requires manual resolution', async () => {
  const h = harness();
  try {
    await h.call('connect', 'POST', { email: 'test@invalid.example', password: 'private' });
    h.setStart(() => { throw new Error('network failed after remote start'); });
    assert.equal((await h.call('start', 'POST', { subject: '국어' })).status, 503);
    const state = await(await h.call('status')).json();
    assert.equal(state.state, 'uncertain');
    assert.equal(typeof state.activeStartedAt, 'number');
    assert.equal((await h.call('start', 'POST', { subject: '국어' })).status, 409);
    assert.equal(h.events.filter(item => item.path === '/study/start').length, 1);
    assert.equal((await h.call('resolve', 'POST', { confirmedStopped: false })).status, 400);
    assert.equal((await h.call('resolve', 'POST', { confirmedStopped: true })).status, 200);
    assert.equal((await(await h.call('status')).json()).state, 'idle');
  } finally { h.close(); }
});

test('YPT ambiguous stop preserves state and blocks disconnect and repeated stop', async () => {
  const h = harness();
  try {
    await h.call('connect', 'POST', { email: 'test@invalid.example', password: 'private' });
    await h.call('start', 'POST', { subject: '국어' });
    h.setStop(() => Response.json({ s: false, c: 'private-upstream-code' }));
    assert.equal((await h.call('stop', 'POST')).status, 503);
    assert.equal((await(await h.call('status')).json()).state, 'uncertain');
    assert.equal((await h.call('stop', 'POST')).status, 409);
    assert.equal((await h.call('connect', 'DELETE')).status, 409);
    assert.equal(h.events.filter(item => item.path === '/study/stop').length, 1);
  } finally { h.close(); }
});

test('YPT concurrent starts send only one external request', async () => {
  const h = harness();
  try {
    await h.call('connect', 'POST', { email: 'test@invalid.example', password: 'private' });
    let release;
    const waiting = new Promise(resolve => { release = resolve; });
    h.setStart(() => waiting);
    const first = h.call('start', 'POST', { subject: '국어' });
    while (!h.events.some(item => item.path === '/study/start')) await new Promise(resolve => setImmediate(resolve));
    assert.equal((await h.call('start', 'POST', { subject: '국어' })).status, 409);
    release(Response.json({ s: true, dl: { sm: 0 } }));
    assert.equal((await first).status, 200);
    assert.equal(h.events.filter(item => item.path === '/study/start').length, 1);
  } finally { h.close(); }
});

test('YPT login renewal preserves an active segment and its exact start timestamp', async () => {
  const h = harness();
  try {
    await h.call('connect', 'POST', { email: 'test@invalid.example', password: 'private' });
    const started = await(await h.call('start', 'POST', { subject: '국어' })).json();
    const renewed = await(await h.call('connect', 'POST', { email: 'test@invalid.example', password: 'new-private' })).json();
    assert.equal(renewed.state, 'running');
    assert.equal(renewed.activeStartedAt, started.startedAt);
    assert.equal((await h.call('stop', 'POST')).status, 200);
    assert.equal(h.events.at(-1).body.startedAt, started.startedAt);
  } finally { h.close(); }
});

test('YPT missing decryption key does not send an external call or discard an active timestamp', async () => {
  const h = harness();
  try {
    await h.call('connect', 'POST', { email: 'test@invalid.example', password: 'private' });
    const original = h.env.YPT_ENCRYPTION_KEY;
    h.env.YPT_ENCRYPTION_KEY = Buffer.alloc(32, 14).toString('base64');
    assert.equal((await h.call('start', 'POST', { subject: '국어' })).status, 503);
    assert.equal((await(await h.call('status')).json()).state, 'idle');
    assert.equal(h.events.filter(item => item.path === '/study/start').length, 0);
    h.env.YPT_ENCRYPTION_KEY = original;
    const started = await(await h.call('start', 'POST', { subject: '국어' })).json();
    h.env.YPT_ENCRYPTION_KEY = Buffer.alloc(32, 14).toString('base64');
    assert.equal((await h.call('stop', 'POST')).status, 503);
    assert.equal((await(await h.call('status')).json()).activeStartedAt, started.startedAt);
    assert.equal(h.events.filter(item => item.path === '/study/stop').length, 0);
  } finally { h.close(); }
});
