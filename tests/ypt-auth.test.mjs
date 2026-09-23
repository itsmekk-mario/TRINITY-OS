import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import worker from '../worker/src/index.ts';

test('YPT routes accept only a TRINITY login session, not an API token', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(readFileSync(new URL('../worker/schema.sql', import.meta.url), 'utf8'));
    db.prepare("INSERT INTO users(id,username,created_at) VALUES(1,'student','2026-09-23')").run();
    const hash = value => createHash('sha256').update(value).digest('hex');
    db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').run(hash('session'), 1, new Date(Date.now() + 60_000).toISOString(), new Date().toISOString());
    db.prepare("INSERT INTO api_tokens(token_hash,user_id,label,created_at,scopes) VALUES(?,1,'token','2026-09-23','sync:read,sync:write')").run(hash('pat'));
    const wrap = (statement, args = []) => ({ bind: (...values) => wrap(statement, values), first: async () => statement.get(...args) ?? null, all: async () => ({ results: statement.all(...args) }), run: async () => ({ meta: { changes: statement.run(...args).changes } }) });
    const env = { DB: { prepare: sql => wrap(db.prepare(sql)), batch: async statements => { const results = []; for (const statement of statements) results.push(await statement.run()); return results; } }, ALLOWED_ORIGIN: 'https://app.test', ENVIRONMENT: 'production' };
    const call = token => worker.fetch(new Request('https://worker.test/api/ypt/status', { ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}) }), env);
    assert.equal((await call()).status, 401);
    assert.equal((await call('pat')).status, 401);
    const response = await call('session');
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).connected, false);
  } finally { db.close(); }
});
