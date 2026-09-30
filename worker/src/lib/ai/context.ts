type Item = Record<string, unknown>;

export const MAX_LOCAL_AI_CONTEXT_BYTES = 24_000;

const object = (value: unknown): Item | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Item : null;
const text = (value: unknown, limit = 160) => typeof value === 'string' ? value.slice(0, limit) : undefined;
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const boolean = (value: unknown) => typeof value === 'boolean' ? value : undefined;
const array = (value: unknown) => Array.isArray(value) ? value.map(object).filter((item): item is Item => Boolean(item)) : [];
const recent = (items: Item[], limit: number) => [...items].sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? ''))).slice(0, limit);
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

export function selectLocalAIContext(value: unknown): Record<string, unknown> {
  const data = object(value);
  if (!data) return {};
  const context: Record<string, unknown> = {
    sessions: recent(array(data.sessions), 24).map((item) => ({ date: text(item.date, 10), subject: text(item.subject, 20), seconds: number(item.seconds) })),
    scores: recent(array(data.scores), 8).map((item) => ({ date: text(item.date, 10), name: text(item.name, 80), subject: text(item.subject, 20), korean: number(item.korean), math: number(item.math), english: number(item.english), errorType: text(item.errorType), cause: text(item.cause), nextAction: text(item.nextAction) })),
    wrongAnswerDrills: recent(array(data.wrongAnswerDrills), 12).map((item) => ({ date: text(item.date, 10), subject: text(item.subject, 20), bottleneck: text(item.bottleneck, 80), wrongJudgment: text(item.wrongJudgment), missedCue: text(item.missedCue), correction: text(item.correction), transfer: text(item.transfer), retries: array(item.retries).slice(0, 3).map((retry) => ({ id: text(retry.id, 8), dueDate: text(retry.dueDate, 10), completedDate: text(retry.completedDate, 10) })) })),
    weeklyCapabilityGoals: array(data.weeklyCapabilityGoals).filter((item) => item.done !== true).slice(-6).map((item) => ({ weekStart: text(item.weekStart, 10), subject: text(item.subject, 20), ability: text(item.ability), successCriterion: text(item.successCriterion), drillDesign: text(item.drillDesign), done: boolean(item.done) })),
    dailyDrills: recent(array(data.dailyDrills), 10).map((item) => ({ date: text(item.date, 10), subject: text(item.subject, 20), title: text(item.title), action: text(item.action), successCriterion: text(item.successCriterion), minutes: number(item.minutes), done: boolean(item.done) })),
    goals: array(data.goals).filter((item) => item.done !== true).slice(-6).map((item) => ({ subject: text(item.subject, 20), text: text(item.text), done: boolean(item.done) })),
    plaire: recent(Object.values(object(data.plaire) ?? {}).map(object).filter((item): item is Item => Boolean(item)), 3).map((item) => ({ date: text(item.date, 10), bottleneck: text(item.bottleneck), nextAction: text(item.nextAction), criterion: text(item.criterion), focus: text(item.focus) })),
    trinity: recent(array(data.trinity), 3).map((item) => ({ date: text(item.date, 10), subject: text(item.subject, 20), mode: text(item.mode, 20), fields: Object.fromEntries(Object.entries(object(item.fields) ?? {}).slice(0, 10).map(([key, field]) => [key.slice(0, 60), text(field, 120)])) })),
  };

  const shrinkOrder = ['sessions', 'wrongAnswerDrills', 'dailyDrills', 'scores', 'trinity', 'plaire'];
  while (bytes(context) > MAX_LOCAL_AI_CONTEXT_BYTES) {
    const key = shrinkOrder.find((name) => Array.isArray(context[name]) && (context[name] as unknown[]).length > 1);
    if (!key) break;
    (context[key] as unknown[]).pop();
  }
  return context;
}

export function parseAndSelectLocalAIContext(payload: string | null | undefined): Record<string, unknown> {
  if (!payload) return {};
  try { return selectLocalAIContext(JSON.parse(payload)); } catch { return {}; }
}
