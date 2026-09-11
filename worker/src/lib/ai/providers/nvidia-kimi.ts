import { AIProviderError, type AIProvider, type AIResponse, type ChatMessage, type ChatOptions } from '../types.ts';

export interface NvidiaKimiConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: string;
  /** Kept for configuration compatibility. Provider requests are never retried. */
  maxRetries?: string;
  debug?: string;
  environment?: string;
}

type NvidiaPayload = {
  choices?: Array<{ message?: { content?: unknown } }>;
  error?: { message?: unknown; code?: unknown };
};

const DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-20b';

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

function isDebug(config: NvidiaKimiConfig) {
  return config.debug === 'true' || config.environment === 'development';
}

export class NvidiaKimiProvider implements AIProvider {
  readonly name = 'nvidia-kimi';
  private readonly model: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: NvidiaKimiConfig) {
    this.model = config.model || DEFAULT_MODEL;
    this.endpoint = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = boundedInt(config.timeoutMs, 25_000, 1_000, 60_000);
  }

  async chat(messages: ChatMessage[], options: ChatOptions): Promise<AIResponse> {
    if (!this.config.apiKey) throw new AIProviderError('AI provider is not configured.', 503, 'AI_NOT_CONFIGURED');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? this.timeoutMs);
    try {
      // One user action reaches this fetch at most once. No status, timeout, or network error is retried.
      const response = await fetch(this.endpoint, {
        method: 'POST', signal: controller.signal,
        headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, temperature: options.temperature ?? 0.2, max_tokens: options.maxTokens, stream: false, messages }),
      });
      const responseText = await response.text();
      const payload = parsePayload(responseText);
      if (!response.ok) {
        if (isDebug(this.config)) console.error(JSON.stringify({ event: 'ai_provider_error', provider: 'nvidia', model: this.model, status: response.status, providerError: payload.error?.message }));
        throw new AIProviderError(providerMessage(response.status), response.status, providerCode(response.status), retryAfterSeconds(response.headers.get('Retry-After')), false);
      }
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw new AIProviderError('AI provider returned an invalid response.', 502, 'AI_INVALID_RESPONSE');
      return { content: content.trim(), provider: this.name, model: this.model };
    } catch (cause) {
      if (cause instanceof AIProviderError) throw cause;
      if (cause instanceof DOMException && cause.name === 'AbortError') throw new AIProviderError('AI provider timed out.', 504, 'AI_TIMEOUT');
      if (isDebug(this.config)) console.error(JSON.stringify({ event: 'ai_provider_network_error', provider: 'nvidia', model: this.model, error: cause instanceof Error ? cause.message : String(cause) }));
      throw new AIProviderError('AI provider connection failed.', 502, 'AI_PROVIDER_UNAVAILABLE');
    } finally { clearTimeout(timeout); }
  }
}
