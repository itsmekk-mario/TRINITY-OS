import { NvidiaKimiProvider, type NvidiaKimiConfig } from './providers/nvidia-kimi.ts';
import { AIProviderError, type AIProvider, type ChatMessage } from './types.ts';

type CacheEntry = { expiresAt: number; value: string };
type RateEntry = { nextAllowedAt: number };
export type AIOperation = 'daily-coach' | 'teacher-feedback-summary' | 'chat';

export interface AIServiceConfig extends NvidiaKimiConfig { provider?: string; }

export class AIService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<string>>();
  private readonly rateLimits = new Map<string, RateEntry>();

  private prune(now: number) {
    if (this.cache.size > 500) for (const [key, entry] of this.cache) if (entry.expiresAt <= now) this.cache.delete(key);
    if (this.rateLimits.size > 1_000) for (const [key, entry] of this.rateLimits) if (entry.nextAllowedAt <= now) this.rateLimits.delete(key);
    // Isolates are normally short-lived. Caps also protect a long-lived isolate
    // from an unbounded stream of unique client contexts.
    while (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value!);
    while (this.rateLimits.size > 1_000) this.rateLimits.delete(this.rateLimits.keys().next().value!);
  }

  private provider(config: AIServiceConfig): AIProvider {
    // Keep the selection in one place. Adding a provider does not change routes or React components.
    if (!config.provider || config.provider === 'nvidia-kimi') return new NvidiaKimiProvider(config);
    throw new AIProviderError('The configured AI provider is not supported.', 503, 'AI_NOT_CONFIGURED');
  }

  async complete(input: {
    user: string;
    operation: AIOperation;
    cacheKey: string;
    messages: ChatMessage[];
    maxTokens: number;
    force?: boolean;
    config: AIServiceConfig;
  }): Promise<{ content: string; cached: boolean }> {
    const now = Date.now();
    this.prune(now);
    const ttlMs = input.operation === 'daily-coach' ? 30 * 60_000 : input.operation === 'teacher-feedback-summary' ? 10 * 60_000 : 0;
    const key = `${input.user}:${input.operation}:${input.cacheKey}`;
    const cached = this.cache.get(key);
    if (!input.force && cached && cached.expiresAt > now) return { content: cached.value, cached: true };
    if (cached && cached.expiresAt <= now) this.cache.delete(key);

    const pending = this.inFlight.get(key);
    if (pending) return { content: await pending, cached: false };

    const cooldownMs = input.operation === 'chat' ? 2_500 : 15_000;
    const rateKey = `${input.user}:${input.operation}`;
    const rate = this.rateLimits.get(rateKey);
    if (rate && rate.nextAllowedAt > now) {
      const seconds = Math.max(1, Math.ceil((rate.nextAllowedAt - now) / 1_000));
      throw new AIProviderError('AI request is cooling down.', 429, 'AI_RATE_LIMITED', seconds);
    }

    const task = this.provider(input.config)
      .chat(input.messages, { maxTokens: input.maxTokens, temperature: 0.25 })
      .then((response) => {
        if (ttlMs) this.cache.set(key, { value: response.content, expiresAt: Date.now() + ttlMs });
        return response.content;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, task);
    this.rateLimits.set(rateKey, { nextAllowedAt: now + cooldownMs });
    return { content: await task, cached: false };
  }
}

export const aiService = new AIService();
