import { AIProviderError, type AIProvider, type AIResponse, type ChatMessage, type ChatOptions } from '../types.ts';

export interface NvidiaNimConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: string;
  debug?: string;
  environment?: string;
}

type NvidiaPayload = { choices?: Array<{ message?: { content?: unknown } }>; };

export const NVIDIA_NIM_DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
export const NVIDIA_NIM_DEFAULT_MODEL = 'nvidia/nemotron-3.5-lightning-30b-a3b';

function boundedInt(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}
function retryAfterSeconds(value: string | null) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(Math.ceil(seconds), 60) : undefined;
}
function providerMessage(status: number) {
  if (status === 401) return 'AI provider authentication failed.';
  if (status === 403) return 'The configured AI model is not available for this account.';
  if (status === 429) return 'The AI provider rate limit has been reached.';
  if ([500, 502, 503, 504].includes(status)) return 'The AI provider is temporarily unavailable.';
  return `AI provider request failed (${status}).`;
}
function providerCode(status: number): AIProviderError['code'] {
  if (status === 401) return 'AI_AUTHENTICATION_FAILED';
  if (status === 403) return 'AI_ACCESS_DENIED';
  if (status === 429) return 'AI_RATE_LIMITED';
  if ([500, 502, 503, 504].includes(status)) return 'AI_PROVIDER_UNAVAILABLE';
  return 'AI_REQUEST_FAILED';
}
function parsePayload(value: string): NvidiaPayload {
  try { return JSON.parse(value) as NvidiaPayload; } catch { return {}; }
}
function isDebug(config: NvidiaNimConfig) {
  return config.debug === 'true' || config.environment === 'development';
}
function withSystemMessageFirst(messages: ChatMessage[]) {
  const system = messages.filter((message) => message.role === 'system');
  return system.length ? [...system, ...messages.filter((message) => message.role !== 'system')] : messages;
}

/** OpenAI-compatible NVIDIA NIM provider. Each chat action performs exactly one fetch. */
export class NvidiaNimProvider implements AIProvider {
  readonly name = 'nvidia-nim';
  private readonly config: NvidiaNimConfig;
  private readonly model: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(config: NvidiaNimConfig) {
    this.config = config;
    this.model = config.model || NVIDIA_NIM_DEFAULT_MODEL;
    this.endpoint = (config.baseUrl || NVIDIA_NIM_DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = boundedInt(config.timeoutMs, 25_000, 1_000, 60_000);
  }

  async chat(messages: ChatMessage[], options: ChatOptions): Promise<AIResponse> {
    if (!this.config.apiKey) throw new AIProviderError('AI provider is not configured.', 503, 'AI_NOT_CONFIGURED');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? this.timeoutMs);
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST', signal: controller.signal,
        headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, temperature: options.temperature ?? 0.25, max_tokens: options.maxTokens, stream: false, messages: withSystemMessageFirst(messages) }),
      });
      const responseText = await response.text();
      const payload = parsePayload(responseText);
      const retryAfter = retryAfterSeconds(response.headers.get('Retry-After'));
      if (!response.ok) {
        // Never log response bodies, prompts, or credentials: provider errors can contain sensitive data.
        if (isDebug(this.config)) console.error({ provider: this.name, model: this.model, status: response.status });
        throw new AIProviderError(providerMessage(response.status), response.status, providerCode(response.status), retryAfter, false);
      }
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        if (isDebug(this.config)) console.error({ provider: this.name, model: this.model, status: response.status, error: 'invalid_response' });
        throw new AIProviderError('AI provider returned an invalid response.', 502, 'AI_INVALID_RESPONSE');
      }
      return { content: content.trim(), provider: this.name, model: this.model };
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') {
        if (isDebug(this.config)) console.error({ provider: this.name, model: this.model, error: 'timeout' });
        throw new AIProviderError('AI provider timed out.', 504, 'AI_TIMEOUT');
      }
      if (isDebug(this.config)) console.error({ provider: this.name, model: this.model, error: 'connection_failed' });
      throw new AIProviderError('AI provider connection failed.', 502, 'AI_PROVIDER_UNAVAILABLE', undefined, true);
    } finally { clearTimeout(timeout); }
  }
}
