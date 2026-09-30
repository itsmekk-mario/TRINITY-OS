import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { NvidiaKimiProvider } from '../worker/src/lib/ai/providers/nvidia-kimi.ts';

const messages = [{ role: 'system', content: 'system' }, { role: 'user', content: 'question' }];

async function withFetch(replacement, action) {
  const original = globalThis.fetch;
  globalThis.fetch = replacement;
  try { return await action(); } finally { globalThis.fetch = original; }
}

test('NVIDIA NIM provider uses the production Nemotron default', async () => {
  let request;
  const result = await withFetch(async (url, init) => {
    request = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ choices: [{ message: { content: 'NIM response' } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }, () => new NvidiaKimiProvider({ apiKey: 'test-only-secret' }).chat(messages, { maxTokens: 100, temperature: 0.2 }));

  assert.equal(result.provider, 'nvidia-nim');
  assert.equal(result.model, 'nvidia/nemotron-3.5-lightning-30b-a3b');
  assert.equal(request.body.model, 'nvidia/nemotron-3.5-lightning-30b-a3b');
  assert.equal(request.init.headers.Authorization, 'Bearer test-only-secret');
});

test('Worker defaults and production vars agree on nvidia-nim', async () => {
  const [serviceSource, indexSource, wranglerSource] = await Promise.all([
    readFile(new URL('../worker/src/lib/ai/service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../worker/src/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../worker/wrangler.toml', import.meta.url), 'utf8'),
  ]);

  assert.match(serviceSource, /config\.provider === 'nvidia-nim'/);
  assert.match(serviceSource, /input\.config\.provider \|\| 'nvidia-nim'/);
  assert.match(indexSource, /env\.AI_PROVIDER \|\| 'nvidia-nim'/);
  assert.match(wranglerSource, /AI_PROVIDER = "nvidia-nim"/);
  assert.match(wranglerSource, /NVIDIA_MODEL = "nvidia\/nemotron-3\.5-lightning-30b-a3b"/);
});
