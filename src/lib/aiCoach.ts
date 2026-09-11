import type { AppData, CalendarPlan, Subject } from '../types';
import { toDateKey, weekStartKey } from './date';
import { loadCloudflareConfig } from './cloudflare';

export type DailyCoachContext = {
  date: string; currentTime: string; greeting: string;
  todaySchedule: { subject: string; title: string; plannedMinutes?: number; completed: boolean }[];
  progress: { plannedMinutes: number; completedMinutes: number; progressPercent: number };
  subjectProgress: { subject: string; plannedMinutes: number; completedMinutes: number }[];
  recentScores: { subject: string; score: string | number; date: string }[];
  recentBottlenecks: string[];
  weeklyGoals: { subject: string; ability: string; successCriterion?: string }[];
  recentPlaire?: { bottleneck?: string; nextAction?: string };
};
export type CoachReply = { summary: string; bottleneck: string; nextAction: string; coachMessage: string; cached?: boolean };
type ApiError = { error?: string; code?: string; requestId?: string };

const subjects: Subject[] = ['국어', '수학', '영어', '탐구'];
const minutesFrom = (value: string) => Number(value.match(/(\d+)\s*분/)?.[1] ?? 0);
const greetingFor = (hour: number) => hour < 5 ? '늦은 시간이네요.' : hour < 12 ? '좋은 아침이에요.' : hour < 18 ? '좋은 오후예요.' : '좋은 저녁이에요.';
const scoreValue = (score: AppData['scores'][number]) => score.korean ?? score.math ?? score.english ?? score.name;

export function buildDailyCoachContext(data: AppData, now = new Date()): DailyCoachContext {
  const date = toDateKey(now); const weekStart = weekStartKey(now); const plans = data.calendar[date]?.plans ?? [];
  const todayDrills = data.dailyDrills.filter((item) => item.date === date);
  const todaySchedule = [...plans.map((item: CalendarPlan) => ({ subject: item.subject, title: item.title, plannedMinutes: minutesFrom(item.quantity), completed: item.done })), ...todayDrills.map((item) => ({ subject: item.subject, title: item.title, plannedMinutes: item.minutes, completed: item.done }))];
  const plannedMinutes = todaySchedule.reduce((sum, item) => sum + (item.plannedMinutes ?? 0), 0);
  const completedMinutes = Math.round(data.sessions.filter((item) => item.date === date).reduce((sum, item) => sum + item.seconds, 0) / 60);
  const plannedItems = todaySchedule.length; const completedItems = todaySchedule.filter((item) => item.completed).length;
  const progressPercent = plannedMinutes > 0 ? Math.min(100, Math.round(completedMinutes / plannedMinutes * 100)) : plannedItems ? Math.round(completedItems / plannedItems * 100) : 0;
  const recentStart = new Date(now); recentStart.setDate(recentStart.getDate() - 6); const recentKey = toDateKey(recentStart);
  const subjectProgress = subjects.map((subject) => ({ subject, plannedMinutes: todaySchedule.filter((item) => item.subject === subject).reduce((sum, item) => sum + (item.plannedMinutes ?? 0), 0), completedMinutes: Math.round(data.sessions.filter((item) => item.date === date && item.subject === subject).reduce((sum, item) => sum + item.seconds, 0) / 60) })).filter((item) => item.plannedMinutes || item.completedMinutes);
  const recentScores = data.scores.filter((item) => item.date >= recentKey).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4).map((item) => ({ subject: item.subject, score: scoreValue(item), date: item.date }));
  const recentBottlenecks = [...new Set(data.wrongAnswerDrills.filter((item) => item.date >= recentKey).map((item) => item.bottleneck).filter(Boolean).map(String))].slice(0, 3);
  const weeklyGoals = data.weeklyCapabilityGoals.filter((item) => item.weekStart === weekStart && !item.done).map((item) => ({ subject: item.subject, ability: item.ability, successCriterion: item.successCriterion })).slice(0, 3);
  const plaire = data.plaire[date] ?? Object.entries(data.plaire).filter(([key]) => key >= recentKey).sort(([a], [b]) => b.localeCompare(a))[0]?.[1];
  return { date, currentTime: new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(now), greeting: greetingFor(now.getHours()), todaySchedule, progress: { plannedMinutes, completedMinutes, progressPercent }, subjectProgress, recentScores, recentBottlenecks, weeklyGoals, recentPlaire: plaire ? { bottleneck: plaire.bottleneck, nextAction: plaire.nextAction } : undefined };
}
export function fallbackCoachMessage(context: DailyCoachContext) { const pending = context.todaySchedule.find((item) => !item.completed); return pending ? '오늘 ' + pending.title + '부터 차분히 완료해 보세요.' : '오늘 기록을 짧게 정리하고, 다음 학습의 기준 한 가지를 남겨보세요.'; }

// Excludes clock/greeting: a re-render or minute tick must not produce another AI call.
export function dailyCoachCacheKey(context: DailyCoachContext) {
  const { currentTime: _currentTime, greeting: _greeting, ...semanticContext } = context;
  let hash = 2166136261;
  for (const char of JSON.stringify(semanticContext)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return 'trinity-os:daily-coach:v2:' + context.date + ':' + (hash >>> 0).toString(36);
}
export function loadCoachCache(context: DailyCoachContext): CoachReply | null { try { const raw = localStorage.getItem(dailyCoachCacheKey(context)); const cached = raw ? JSON.parse(raw) as { expiresAt: number; value: CoachReply } : null; return cached && cached.expiresAt > Date.now() ? cached.value : null; } catch { return null; } }
export function saveCoachCache(context: DailyCoachContext, value: CoachReply) { localStorage.setItem(dailyCoachCacheKey(context), JSON.stringify({ value, expiresAt: Date.now() + 30 * 60_000 })); }

const inFlight = new Map<string, Promise<unknown>>();
async function request<T>(path: string, body: unknown): Promise<T> {
  const config = loadCloudflareConfig();
  if (!config.url || !config.token) throw new Error('AI 코치를 사용하려면 Cloudflare 동기화 로그인이 필요합니다.');
  const requestKey = path + ':' + JSON.stringify(body);
  const existing = inFlight.get(requestKey) as Promise<T> | undefined;
  if (existing) return existing;
  const task = (async () => {
    const controller = new AbortController(); const timeout = window.setTimeout(() => controller.abort(), 35_000);
    try {
      const response = await fetch(config.url.replace(/\/+$/, '') + path, { method: 'POST', signal: controller.signal, headers: { Authorization: 'Bearer ' + config.token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({})) as T & ApiError;
      if (!response.ok) throw new Error((payload.error || 'AI 요청 실패 (' + response.status + ')') + (payload.requestId ? ' (참조: ' + payload.requestId + ')' : ''));
      return payload;
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') throw new Error('AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.');
      throw cause;
    } finally { window.clearTimeout(timeout); }
  })();
  inFlight.set(requestKey, task);
  try { return await task; } finally { inFlight.delete(requestKey); }
}
export const requestDailyCoach = (context: DailyCoachContext, force = false) => request<CoachReply>('/api/ai/daily-coach', { context, force });
export const requestCoachChat = (context: DailyCoachContext, messages: { role: 'user' | 'assistant'; content: string }[]) => request<{ message: string }>('/api/ai/chat', { context, messages });
