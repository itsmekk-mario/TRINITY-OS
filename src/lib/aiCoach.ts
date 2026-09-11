import { loadCloudflareConfig } from './cloudflare';
import { coachContextHash } from './coach/context';
import type { AIStudyCoachContext } from './coach/types';

export type CoachReply = { message: string; cached?: boolean };
export type CoachChatMessage = { role: 'user' | 'assistant'; content: string };
type ApiError = { error?: string; code?: string; requestId?: string };
type CachedCoachReply = { value: CoachReply; expiresAt: number };

const AI_CACHE_PREFIX = 'trinity-os:ai-study-analysis:v1:';
const AI_CACHE_TTL_MS = 30 * 60_000;
const inFlight = new Map<string, Promise<unknown>>();

function cacheKey(context: AIStudyCoachContext) {
  return AI_CACHE_PREFIX + coachContextHash(context);
}

export function loadAIAnalysisCache(context: AIStudyCoachContext): CoachReply | null {
  try {
    const raw = localStorage.getItem(cacheKey(context));
    const cached = raw ? JSON.parse(raw) as CachedCoachReply : null;
    if (cached && cached.expiresAt > Date.now()) return { ...cached.value, cached: true };
    if (cached) localStorage.removeItem(cacheKey(context));
  } catch { /* Ignore corrupt or unavailable browser storage. */ }
  return null;
}

export function saveAIAnalysisCache(context: AIStudyCoachContext, value: CoachReply) {
  try { localStorage.setItem(cacheKey(context), JSON.stringify({ value, expiresAt: Date.now() + AI_CACHE_TTL_MS } satisfies CachedCoachReply)); }
  catch { /* The local Coach remains available when storage is unavailable. */ }
}

async function request<T>(path: string, body: unknown): Promise<T> {
  const config = loadCloudflareConfig();
  if (!config.url || !config.token) throw new Error('AI 기능을 사용하려면 먼저 로그인해 주세요. 기본 TRINITY 분석은 계속 사용할 수 있습니다.');
  const requestKey = `${path}:${JSON.stringify(body)}`;
  const pending = inFlight.get(requestKey) as Promise<T> | undefined;
  if (pending) return pending;
  const task = (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 35_000);
    try {
      const response = await fetch(config.url.replace(/\/+$/, '') + path, {
        method: 'POST', signal: controller.signal,
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({})) as T & ApiError;
      if (!response.ok) {
        const suffix = payload.requestId ? ` (참조: ${payload.requestId})` : '';
        throw new Error(`${payload.error || `AI 요청에 실패했습니다. (${response.status})`}${suffix}`);
      }
      return payload;
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') throw new Error('AI 응답 시간이 초과되었습니다. 기본 TRINITY 분석은 정상적으로 사용할 수 있습니다.');
      throw cause;
    } finally { window.clearTimeout(timeout); }
  })();
  inFlight.set(requestKey, task);
  try { return await task; } finally { inFlight.delete(requestKey); }
}

export const requestAIStudyAnalysis = (context: AIStudyCoachContext) =>
  request<CoachReply>('/api/ai/study-analysis', { context });

export const requestCoachChat = (context: AIStudyCoachContext, messages: CoachChatMessage[]) =>
  request<CoachReply>('/api/ai/chat', {
    context,
    messages: messages.slice(-6).map((message) => ({ role: message.role, content: message.content.slice(0, 300) })),
  });
