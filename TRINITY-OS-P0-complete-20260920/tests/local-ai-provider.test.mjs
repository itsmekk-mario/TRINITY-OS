import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { LocalQwenProvider } from '../worker/src/lib/ai/providers/local-qwen.ts';
import { AIProviderError } from '../worker/src/lib/ai/types.ts';
import { MAX_LOCAL_AI_CONTEXT_BYTES, parseAndSelectLocalAIContext, selectLocalAIContext } from '../worker/src/lib/ai/context.ts';

const config = { localAIBaseUrl: 'https://ai.example.test', localAIApiKey: 'test-only-secret', localAIModel: 'qwen3:8b' };
const messages = [{ role: 'system', content: 'system' }, { role: 'user', content: 'question' }];
const options = { maxTokens: 100, temperature: 0.2, context: { sessions: [{ subject: 'math' }] } };

async function withFetch(replacement, action) {
  const original = globalThis.fetch;
  globalThis.fetch = replacement;
  try { return await action(); } finally { globalThis.fetch = original; }
}

test('Local AI provider sends bearer authentication and bounded context', async () => {
  let request;
  const result = await withFetch(async (url, init) => {
    request = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ response: '로컬 응답', model: 'qwen3:8b' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }, () => new LocalQwenProvider(config).chat(messages, options));
  assert.equal(result.content, '로컬 응답');
  assert.equal(request.url, 'https://ai.example.test/chat');
  assert.equal(request.init.headers.Authorization, 'Bearer test-only-secret');
  assert.deepEqual(request.body.context, options.context);
});

test('Local AI authentication failure is normalized', async () => {
  await withFetch(async () => new Response(JSON.stringify({ error: 'INVALID_API_KEY' }), { status: 401 }), async () => {
    await assert.rejects(new LocalQwenProvider(config).chat(messages, options), (error) => error instanceof AIProviderError && error.code === 'AI_AUTHENTICATION_FAILED');
  });
});

test('Local AI timeout is normalized', async () => {
  await withFetch((_, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))), async () => {
    await assert.rejects(new LocalQwenProvider(config).chat(messages, { ...options, timeoutMs: 5 }), (error) => error instanceof AIProviderError && error.code === 'LOCAL_AI_TIMEOUT');
  });
});

test('Local AI network failure is normalized', async () => {
  await withFetch(async () => { throw new TypeError('offline'); }, async () => {
    await assert.rejects(new LocalQwenProvider(config).chat(messages, options), (error) => error instanceof AIProviderError && error.code === 'LOCAL_AI_UNAVAILABLE');
  });
});

test('malformed Local AI response is rejected', async () => {
  await withFetch(async () => new Response('{}', { status: 200 }), async () => {
    await assert.rejects(new LocalQwenProvider(config).chat(messages, options), (error) => error instanceof AIProviderError && error.code === 'LOCAL_AI_INVALID_RESPONSE');
  });
});

test('D1 context selector uses actual AppData fields and remains bounded', () => {
  const huge = 'x'.repeat(10_000);
  const data = {
    sessions: Array.from({ length: 100 }, (_, index) => ({ date: `2026-09-${String((index % 28) + 1).padStart(2, '0')}`, subject: '수학', seconds: 3600, note: huge })),
    scores: Array.from({ length: 20 }, () => ({ date: '2026-09-15', name: huge, math: 70, cause: huge })),
    wrongAnswerDrills: Array.from({ length: 30 }, () => ({ date: '2026-09-15', subject: '수학', bottleneck: huge, correction: huge })),
    weeklyCapabilityGoals: [{ subject: '수학', ability: huge, done: false }], dailyDrills: [], goals: [], plaire: {}, trinity: [],
  };
  const selected = selectLocalAIContext(data);
  assert.equal(selected.sessions.length <= 24, true);
  assert.equal(selected.scores.length <= 8, true);
  assert.equal(new TextEncoder().encode(JSON.stringify(selected)).byteLength <= MAX_LOCAL_AI_CONTEXT_BYTES, true);
  assert.deepEqual(parseAndSelectLocalAIContext('{broken'), {});
});

async function sourceFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory() ? sourceFiles(path.join(root, entry.name)) : [path.join(root, entry.name)]));
  return nested.flat();
}

test('frontend bundle source contains no Local AI endpoint or secret binding', async () => {
  const files = (await sourceFiles(fileURLToPath(new URL('../src', import.meta.url)))).filter((file) => /\.(ts|tsx)$/.test(file));
  const source = (await Promise.all(files.map((file) => readFile(file, 'utf8')))).join('\n');
  assert.doesNotMatch(source, /LOCAL_AI_API_KEY|ai\.trinityos\.mcv\.kr|127\.0\.0\.1:8765/);
});
