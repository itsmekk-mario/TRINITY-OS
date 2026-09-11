import { NvidiaKimiProvider, type NvidiaKimiConfig } from './providers/nvidia-kimi.ts';
import { AIProviderError, type AIProvider, type ChatMessage } from './types.ts';

export type AIOperation = 'study-analysis' | 'teacher-feedback-summary' | 'arena-coach' | 'chat';

export interface AIServiceConfig extends NvidiaKimiConfig {
  provider?: string;
  userDailyLimit?: string;
  globalDailyLimit?: string;
  chatCooldownSeconds?: string;
}

type ProviderFactory = (config: AIServiceConfig) => AIProvider;
type CacheRow = { response: string; expires_at: string };
type CountRow = { count: number };
type RecentUsageRow = { created_at: string };

const CACHE_TTL_MS: Record<AIOperation, number> = {
  'study-analysis': 30 * 60_000,
  'teacher-feedback-summary': 10 * 60_000,
  'arena-coach': 30 * 60_000,
  chat: 5 * 60_000,
};

function boundedInt(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

export class AIService {
  constructor(private readonly makeProvider?: ProviderFactory) {}

  private provider(config: AIServiceConfig): AIProvider {
    if (this.makeProvider) return this.makeProvider(config);
    if (!config.provider || config.provider === 'nvidia-kimi') return new NvidiaKimiProvider(config);
    throw new AIProviderError('설정된 AI provider를 사용할 수 없습니다.', 503, 'AI_NOT_CONFIGURED');
  }

  private async cached(db: D1Database, key: string, nowIso: string) {
    const row = await db.prepare('SELECT response,expires_at FROM ai_cache WHERE cache_key=?').bind(key).first<CacheRow>();
    if (!row) return null;
    if (row.expires_at > nowIso) return row.response;
    await db.prepare('DELETE FROM ai_cache WHERE cache_key=?').bind(key).run();
    return null;
  }

  private async guard(db: D1Database, userId: number, operation: AIOperation, config: AIServiceConfig, now: Date) {
    const userLimit = boundedInt(config.userDailyLimit, 12, 1, 1_000);
    const globalLimit = boundedInt(config.globalDailyLimit, 100, 1, 100_000);
    const [userCount, globalCount] = await Promise.all([
      db.prepare("SELECT COUNT(*) AS count FROM ai_usage WHERE user_id=? AND date(created_at)=date('now')").bind(userId).first<CountRow>(),
      db.prepare("SELECT COUNT(*) AS count FROM ai_usage WHERE date(created_at)=date('now')").first<CountRow>(),
    ]);
    if ((userCount?.count ?? 0) >= userLimit) throw new AIProviderError('오늘 사용할 수 있는 AI 요청 횟수를 모두 사용했습니다. 기본 TRINITY 분석은 계속 사용할 수 있습니다.', 429, 'AI_RATE_LIMITED');
    if ((globalCount?.count ?? 0) >= globalLimit) throw new AIProviderError('오늘의 전체 AI 요청 한도에 도달했습니다. 기본 TRINITY 분석은 계속 사용할 수 있습니다.', 429, 'AI_RATE_LIMITED');
    if (operation !== 'chat') return;
    const cooldownSeconds = boundedInt(config.chatCooldownSeconds, 8, 0, 300);
    if (!cooldownSeconds) return;
    const recent = await db.prepare("SELECT created_at FROM ai_usage WHERE user_id=? AND operation='chat' ORDER BY created_at DESC LIMIT 1").bind(userId).first<RecentUsageRow>();
    const nextAllowed = recent ? Date.parse(recent.created_at) + cooldownSeconds * 1_000 : 0;
    if (nextAllowed > now.getTime()) throw new AIProviderError('AI 상담 요청 간격이 너무 짧습니다. 기본 TRINITY 분석을 먼저 확인해 주세요.', 429, 'AI_RATE_LIMITED', Math.max(1, Math.ceil((nextAllowed - now.getTime()) / 1_000)));
  }

  async complete(input: {
    db: D1Database;
    userId: number;
    user: string;
    operation: AIOperation;
    cacheKey: string;
    messages: ChatMessage[];
    maxTokens: number;
    config: AIServiceConfig;
  }): Promise<{ content: string; cached: boolean }> {
    const now = new Date();
    const nowIso = now.toISOString();
    const persistentKey = `${input.userId}:${input.operation}:${input.cacheKey}`;
    const cached = await this.cached(input.db, persistentKey, nowIso);
    if (cached !== null) return { content: cached, cached: true };

    await this.guard(input.db, input.userId, input.operation, input.config, now);
    const usageId = crypto.randomUUID();
    const providerName = input.config.provider || 'nvidia-kimi';
    await input.db.prepare('INSERT INTO ai_usage(id,user_id,operation,provider,model,created_at,success,status_code) VALUES(?,?,?,?,?,?,0,NULL)')
      .bind(usageId, input.userId, input.operation, providerName, input.config.model ?? null, nowIso).run();

    try {
      // Exactly one provider.chat call. The provider itself never retries.
      const response = await this.provider(input.config).chat(input.messages, { maxTokens: input.maxTokens, temperature: 0.2 });
      const expiresAt = new Date(now.getTime() + CACHE_TTL_MS[input.operation]).toISOString();
      await Promise.all([
        input.db.prepare('INSERT INTO ai_cache(cache_key,user_id,operation,response,created_at,expires_at) VALUES(?,?,?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET response=excluded.response,created_at=excluded.created_at,expires_at=excluded.expires_at')
          .bind(persistentKey, input.userId, input.operation, response.content, nowIso, expiresAt).run(),
        input.db.prepare('UPDATE ai_usage SET provider=?,model=?,success=1,status_code=200 WHERE id=?').bind(response.provider, response.model, usageId).run(),
      ]);
      return { content: response.content, cached: false };
    } catch (cause) {
      const status = cause instanceof AIProviderError ? cause.status : 502;
      await input.db.prepare('UPDATE ai_usage SET status_code=? WHERE id=?').bind(status, usageId).run();
      throw cause;
    }
  }
}

export const aiService = new AIService();
