import type { Resource } from '../types';
import { getStudyDayKey } from './date.ts';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const utcDay = (key: string) => Date.parse(`${key}T00:00:00Z`) / 86_400_000;
export const normalizeResourceDueDate = (value?: string) => DATE_KEY.test(value?.trim() ?? '') ? value!.trim() : undefined;
export const isCompletedResource = (resource: Resource) => resource.total > 0 && resource.done >= resource.total;
export const resourceDueInDays = (resource: Resource, now: Date | string | number = new Date()) => {
  const dueDate = normalizeResourceDueDate(resource.dueDate);
  return dueDate ? utcDay(dueDate) - utcDay(getStudyDayKey(now)) : undefined;
};
export const isOverdueResource = (resource: Resource, now: Date | string | number = new Date()) => !isCompletedResource(resource) && (resourceDueInDays(resource, now) ?? 0) < 0;
export const formatResourceDeadline = (resource: Resource, now: Date | string | number = new Date()) => {
  const dueDate = normalizeResourceDueDate(resource.dueDate), days = resourceDueInDays(resource, now);
  if (!dueDate || days === undefined) return undefined;
  const date = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' }).format(new Date(`${dueDate}T12:00:00+09:00`));
  if (isCompletedResource(resource)) return `Due ${date}`;
  if (days === 0) return '오늘 마감';
  return days < 0 ? `${date} · ${Math.abs(days)}일 초과` : `Due ${date} · D-${days}`;
};
export const sortResourcesByDeadline = (resources: Resource[], now: Date | string | number = new Date()) => [...resources].sort((a, b) => {
  const rank = (resource: Resource) => isCompletedResource(resource) ? 3 : isOverdueResource(resource, now) ? 0 : resourceDueInDays(resource, now) === undefined ? 2 : 1;
  return rank(a) - rank(b) || (resourceDueInDays(a, now) ?? Infinity) - (resourceDueInDays(b, now) ?? Infinity) || a.name.localeCompare(b.name, 'ko');
});
