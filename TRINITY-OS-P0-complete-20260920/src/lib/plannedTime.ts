/**
 * Reads an explicit duration from a legacy free-text quantity field.
 * Counts such as "31문제" are intentionally ignored when no time unit exists.
 */
export function parsePlannedMinutes(value: string | null | undefined): number {
  if (!value) return 0;
  const normalized = value.replace(/,/g, '').trim();
  const hourMatches = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*(?:시간|hours?|hrs?|h)(?![a-z])/gi)];
  const minuteMatches = [...normalized.matchAll(/(\d+)\s*(?:분|minutes?|mins?|m)(?![a-z])/gi)];
  const hours = hourMatches.reduce((sum, match) => sum + Number(match[1]), 0);
  const minutes = minuteMatches.reduce((sum, match) => sum + Number(match[1]), 0);
  return Math.max(0, Math.round(hours * 60 + minutes));
}

