import assert from 'node:assert/strict';
import test from 'node:test';
import { NvidiaNimProvider, NVIDIA_NIM_DEFAULT_MODEL } from '../src/lib/ai/providers/nvidia-nim.ts';
import { AIService } from '../src/lib/ai/service.ts';

const messages = [{ role: 'user', content: '질문' }, { role: 'system', content: '규칙' }];
const options = { maxTokens: 100, timeoutMs: 1_000 };
const json = (value, status = 200, headers) => new Response(JSON.stringify(value), { status, headers });

test('uses Nemotron defaults, an OpenAI-compatible payload, and one fetch', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let request;
  globalThis.fetch = async (url, init) => {
    calls += 1;
    request = { url, init, body: JSON.parse(init.body) };
    return json({ choices: [{ message: { content: '  정상 응답  ' } }] });
  };
  try {
    const result = await new NvidiaNimProvider({ apiKey: 'test-key' }).chat(messages, options);
    assert.equal(calls, 1);
    assert.equal(request.url, 'https://integrate.api.nvidia.com/v1/chat/completions');
    assert.equal(request.body.model, NVIDIA_NIM_DEFAULT_MODEL);
    assert.equal(request.body.stream, false);
    assert.equal(request.body.messages[0].role, 'system');
    assert.equal(result.content, '정상 응답');
    assert.equal(result.provider, 'nvidia-nim');
  } finally { globalThis.fetch = originalFetch; }
});

test('nvidia-nim and legacy nvidia-kimi select the NIM provider', () => {
  const service = new AIService();
  assert.equal(service.provider({ provider: 'nvidia-nim' }).name, 'nvidia-nim');
  assert.equal(service.provider({ provider: 'nvidia-kimi' }).name, 'nvidia-nim');
});

test('maps provider status errors without retrying', async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const [status, code] of [[401, 'AI_AUTHENTICATION_FAILED'], [403, 'AI_ACCESS_DENIED'], [429, 'AI_RATE_LIMITED'], [503, 'AI_PROVIDER_UNAVAILABLE']]) {
      let calls = 0;
      globalThis.fetch = async () => { calls += 1; return json({ error: { message: 'secret body' } }, status); };
      await assert.rejects(() => new NvidiaNimProvider({ apiKey: 'test-key' }).chat(messages, options), (error) => error.code === code);
      assert.equal(calls, 1);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('handles missing configuration, timeout, and invalid responses', async () => {
  await assert.rejects(() => new NvidiaNimProvider({}).chat(messages, options), (error) => error.code === 'AI_NOT_CONFIGURED');
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
    await assert.rejects(() => new NvidiaNimProvider({ apiKey: 'test-key', timeoutMs: '1000' }).chat(messages, { ...options, timeoutMs: 1 }), (error) => error.code === 'AI_TIMEOUT');
    globalThis.fetch = async () => json({ choices: [] });
    await assert.rejects(() => new NvidiaNimProvider({ apiKey: 'test-key' }).chat(messages, options), (error) => error.code === 'AI_INVALID_RESPONSE');
  } finally { globalThis.fetch = originalFetch; }
});

test('cache hits do not call NVIDIA', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return json({ choices: [{ message: { content: 'cached' } }] }); };
  try {
    const service = new AIService();
    const input = { user: 'user', operation: 'daily-coach', cacheKey: 'same', messages, maxTokens: 100, config: { apiKey: 'test-key' } };
    assert.equal((await service.complete(input)).cached, false);
    assert.equal((await service.complete(input)).cached, true);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});
