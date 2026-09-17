import type { AppData } from '../types';
import resourcesSeed from '../data/resources.json';
import goalsSeed from '../data/goals.json';
import routineSeed from '../data/routine.json';
import quotesSeed from '../data/quotes.json';
import { EXAM_DATE } from '../data/config';
import mockScheduleSeed from '../data/mockSchedule.json';
import { APP_VERSION } from '../data/config';
import { archiveApi, type LearningArchiveBackup } from './archiveApi';
import { parseBackupValue, type BackupV2, type ParsedBackup } from './backupFormat';
export type {BackupV1,BackupV2,ParsedBackup} from './backupFormat';

const LEGACY_STORAGE_KEY = 'trinity-os:data:v1';
export const storageKeyForUser = (userId: number | string) => `trinity-os:data:${userId}:v1`;

export const initialData: AppData = {
  calendar: {},
  sessions: [],
  mockSchedule: mockScheduleSeed as AppData['mockSchedule'],
  journals: {},
  scores: [],
  resources: resourcesSeed as AppData['resources'],
  goals: goalsSeed.flatMap((group, groupIndex) => group.items.map((text, itemIndex) => ({ id: `g-${groupIndex}-${itemIndex}`, subject: group.subject, text, done: false }))) as AppData['goals'],
  weeklyCapabilityGoals: [],
  wrongAnswerDrills: [],
  dailyDrills: [],
  monthlyPlans: [],
  notionPages: [],
  routine: routineSeed.map((item, index) => ({ ...item, id: `routine-${index}` })) as AppData['routine'],
  quotes: quotesSeed,
  examDate: EXAM_DATE,
  googleClientId: '',
  plaire: {},
  trinity: [],
};

export function loadData(userId: number | string): AppData {
  try {
    const value = localStorage.getItem(storageKeyForUser(userId));
    if (!value) return initialData;
    const parsed = JSON.parse(value) as Partial<AppData>;
    return { ...initialData, ...parsed, mockSchedule: Array.isArray(parsed.mockSchedule) ? parsed.mockSchedule : initialData.mockSchedule, resources: parsed.resources?.length ? parsed.resources : initialData.resources, goals: parsed.goals?.length ? parsed.goals : initialData.goals, routine: parsed.routine?.length ? parsed.routine : initialData.routine, weeklyCapabilityGoals: Array.isArray(parsed.weeklyCapabilityGoals) ? parsed.weeklyCapabilityGoals : [], wrongAnswerDrills: Array.isArray(parsed.wrongAnswerDrills) ? parsed.wrongAnswerDrills : [], dailyDrills: Array.isArray(parsed.dailyDrills) ? parsed.dailyDrills : [], monthlyPlans: Array.isArray(parsed.monthlyPlans) ? parsed.monthlyPlans : [], notionPages: Array.isArray(parsed.notionPages) ? parsed.notionPages : [] };
  } catch {
    return initialData;
  }
}

export function saveData(userId: number | string, data: AppData) {
  localStorage.setItem(storageKeyForUser(userId), JSON.stringify(data));
}

/** Legacy data is deliberately never migrated automatically: its owner cannot be proven. */
export function hasLegacyData() { return Boolean(localStorage.getItem(LEGACY_STORAGE_KEY)); }

export function clearUserData(userId: number | string) { localStorage.removeItem(storageKeyForUser(userId)); }

function saveBackupFile(payload:BackupV2) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `trinity-os-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadBackup(data: AppData) {
  // Archive failure is intentionally fatal: silently producing a partial v1 file looks like a successful full backup.
  const learningArchive=await archiveApi<LearningArchiveBackup>('/api/archive/export');
  saveBackupFile({version:2,exportedAt:new Date().toISOString(),app:data,learningArchive,metadata:{appVersion:APP_VERSION,archiveSchemaVersion:1}});
}

export async function parseBackup(file: File): Promise<ParsedBackup> {
  return parseBackupValue(JSON.parse(await file.text()),initialData);
}

export async function restoreBackup(backup:ParsedBackup){
  if(backup.version===2&&backup.learningArchive){
    // Persist AppData first so imported Wrong Answer links are validated against the restored drills.
    await archiveApi<{ok:boolean}>('/api/sync','PUT',{data:backup.app});
    await archiveApi<{ok:boolean;warnings:string[]}>('/api/archive/import','POST',backup.learningArchive);
  }
  return backup.app;
}
