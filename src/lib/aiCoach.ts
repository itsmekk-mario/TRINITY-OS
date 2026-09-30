import { loadCloudflareConfig } from './cloudflare';
import { coachContextHash } from './coach/context';
import type { AIStudyCoachContext } from './coach/types';

export type CoachReply = { message: string; cached?: boolean };
export type CoachChatMessage = { role: 'user' | 'assistant'; content: string };
type ApiError = { error?: string; code?: string; requestId?: string };
type CachedCoachReply = { value: CoachReply; expiresAt: number };

const AI_CACHE_PREFIX = 'trinity-os:ai-study-analysis:v2:';
const AI_CACHE_TTL_MS = 30 * 60_000;
const inFlight = new Map<string, Promise<unknown>>();

function cacheKey(context: AIStudyCoachContext) {
  const userId = loadCloudflareConfig().userId;
  return AI_CACHE_PREFIX + (userId === undefined ? 'anonymous' : userId) + ':' + coachContextHash(context);
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
  if (!config.url || !config.token) throw new Error('AI 湲곕뒫???ъ슜?섎젮硫?癒쇱? 濡쒓렇?명빐 二쇱꽭?? 湲곕낯 TRINITY 遺꾩꽍? 怨꾩냽 ?ъ슜?????덉뒿?덈떎.');
  const requestKey = `${path}:${JSON.stringify(body)}`;
  const pending = inFlight.get(requestKey) as Promise<T> | undefined;
  if (pending) return pending;
  const task = (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 315_000);
    try {
      const response = await fetch(config.url.replace(/\/+$/, '') + path, {
        method: 'POST', signal: controller.signal,
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({})) as T & ApiError;
      if (!response.ok) {
        const suffix = payload.requestId ? ` (李몄“: ${payload.requestId})` : '';
        throw new Error(`${payload.error || `AI ?붿껌???ㅽ뙣?덉뒿?덈떎. (${response.status})`}${suffix}`);
      }
      return payload;
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') throw new Error('AI ?묐떟 ?쒓컙??珥덇낵?섏뿀?듬땲?? 湲곕낯 TRINITY 遺꾩꽍? ?뺤긽?곸쑝濡??ъ슜?????덉뒿?덈떎.');
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
    messages: messages.slice(-4).map((message) => ({ role: message.role, content: message.content.slice(0, 240) })),
  });

