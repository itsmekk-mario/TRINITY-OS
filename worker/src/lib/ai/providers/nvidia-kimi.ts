import { AIProviderError, type AIProvider, type AIResponse, type ChatMessage, type ChatOptions } from '../types.ts';

export interface NvidiaKimiConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: string;
  maxRetries?: string;
  debug?: string;
  environment?: string;
}

type NvidiaPayload = {
  choices?: Array<{ message?: { content?: unknown } }>;
  error?: { message?: unknown; code?: unknown };
};

const DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const DEFAULT_MODEL = 'moonshotai/kimi-k3';

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

const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export class NvidiaKimiProvider implements AIProvider {
  readonly name = 'nvidia-kimi';
  private readonly model: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(private readonly config: NvidiaKimiConfig) {
    this.model = config.model || DEFAULT_MODEL;
    this.endpoint = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = boundedInt(config.timeoutMs, 25_000, 1_000, 60_000);
    // Only transient 5xx/network failures are retried. 429/401/403 are never retried.
    this.maxRetries = boundedInt(config.maxRetries, 1, 0, 2);
  }

  async chat(messages: ChatMessage[], options: ChatOptions): Promise<AIResponse> {
    if (!this.config.apiKey) {
      throw new AIProviderError('AI provider is not configured.', 503, 'AI_NOT_CONFIGURED');
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? this.timeoutMs);
      try {
        const response = await fetch(this.endpoint, {
          method: 'POST',
          signal: controller.signal,
          headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.model,
            temperature: options.temperature ?? 0.25,
            max_tokens: options.maxTokens,
            stream: false,
            messages,
          }),
        });
        const responseText = await response.text();
        const payload = parsePayload(responseText);
        const retryAfter = retryAfterSeconds(response.headers.get('Retry-After'));

        if (!response.ok) {
          if (isDebug(this.config)) {
            console.error({ provider: 'nvidia', model: this.model, status: response.status, providerError: payload.error?.message, errorBody: responseText.slice(0, 4_000) });
          }
          const error = new AIProviderError(
            providerMessage(response.status),
            response.status,
            providerCode(response.status),
            retryAfter,
            [500, 502, 503, 504].includes(response.status),
          );
          // Retrying 429 can consume further quota or prolong a queue, so return it immediately.
          if (!error.retryable || attempt === this.maxRetries) throw error;
          lastError = error;
          await wait(250 * (attempt + 1) + Math.floor(Math.random() * 150));
          continue;
        }

        const content = payload.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) {
          if (isDebug(this.config)) console.error({ provider: 'nvidia', model: this.model, status: response.status, errorBody: responseText.slice(0, 4_000) });
          throw new AIProviderError('AI provider returned an invalid response.', 502, 'AI_INVALID_RESPONSE');
        }
        return { content: content.trim(), provider: this.name, model: this.model };
      } catch (error) {
        if (error instanceof AIProviderError) throw error;
        if (error instanceof DOMException && error.name === 'AbortError') {
          if (isDebug(this.config)) console.error({ provider: 'nvidia', model: this.model, error: 'timeout' });
          throw new AIProviderError('AI provider timed out.', 504, 'AI_TIMEOUT');
        }
        lastError = error;
        if (attempt === this.maxRetries) {
          if (isDebug(this.config)) console.error({ provider: 'nvidia', model: this.model, error });
          throw new AIProviderError('AI provider connection failed.', 502, 'AI_PROVIDER_UNAVAILABLE', undefined, true);
        }
        await wait(250 * (attempt + 1) + Math.floor(Math.random() * 150));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError instanceof AIProviderError ? lastError : new AIProviderError('AI provider request failed.', 502, 'AI_REQUEST_FAILED');
  }
}
