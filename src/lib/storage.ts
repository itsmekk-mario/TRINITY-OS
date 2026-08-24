import type { AppData } from '../types';
import resourcesSeed from '../data/resources.json';
import goalsSeed from '../data/goals.json';
import routineSeed from '../data/routine.json';
import quotesSeed from '../data/quotes.json';
import { EXAM_DATE } from '../data/config';

export const STORAGE_KEY = 'trinity-os:data:v1';

export const initialData: AppData = {
  calendar: {},
  sessions: [],
  journals: {},
  scores: [],
  resources: resourcesSeed as AppData['resources'],
  goals: goalsSeed.flatMap((group, groupIndex) => group.items.map((text, itemIndex) => ({ id: `g-${groupIndex}-${itemIndex}`, subject: group.subject, text, done: false }))) as AppData['goals'],
  routine: routineSeed.map((item, index) => ({ ...item, id: `routine-${index}` })) as AppData['routine'],
  quotes: quotesSeed,
  examDate: EXAM_DATE,
  plaire: {},
  trinity: [],
};

export function loadData(): AppData {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) return initialData;
    const parsed = JSON.parse(value) as Partial<AppData>;
    return { ...initialData, ...parsed, resources: parsed.resources?.length ? parsed.resources : initialData.resources, goals: parsed.goals?.length ? parsed.goals : initialData.goals, routine: parsed.routine?.length ? parsed.routine : initialData.routine };
  } catch {
    return initialData;
  }
}

export function saveData(data: AppData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function downloadBackup(data: AppData) {
  const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), data }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `trinity-os-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function parseBackup(file: File): Promise<AppData> {
  const parsed = JSON.parse(await file.text());
  const candidate = parsed.data ?? parsed;
  if (!candidate || !Array.isArray(candidate.sessions) || !Array.isArray(candidate.scores)) throw new Error('올바른 TRINITY OS 백업이 아닙니다.');
  return { ...initialData, ...candidate };
}
