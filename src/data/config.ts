export const EXAM_DATE = '2026-11-19';
export const APP_VERSION = '1.0.0';
import type { Subject } from '../types';

const baseSubjects: Subject[] = ['국어', '수학', '영어', '통사', '통과'];
export const SUBJECTS: Subject[] = [...baseSubjects];
const CUSTOM_SUBJECTS_KEY = 'trinity-os:custom-subjects';
if (typeof localStorage !== 'undefined') {
  try {
    const stored = JSON.parse(localStorage.getItem(CUSTOM_SUBJECTS_KEY) || '[]') as string[];
    for (const value of stored) {
      const subject = value.trim().slice(0, 24) as Subject;
      if (subject && !SUBJECTS.includes(subject)) SUBJECTS.push(subject);
    }
  } catch { /* Ignore invalid custom subject settings. */ }
}
export function addCustomSubject(value: string) {
  const subject = value.trim().slice(0, 24) as Subject;
  if (!subject || SUBJECTS.includes(subject)) return false;
  SUBJECTS.push(subject);
  try { localStorage.setItem(CUSTOM_SUBJECTS_KEY, JSON.stringify(SUBJECTS.filter(item => !baseSubjects.includes(item)))); } catch { /* Keep this session's selection. */ }
  return true;
}
export function removeCustomSubject(value: string) {
  const subject = value.trim() as Subject;
  if (baseSubjects.includes(subject)) return false;
  const index = SUBJECTS.indexOf(subject);
  if (index < 0) return false;
  SUBJECTS.splice(index, 1);
  try { localStorage.setItem(CUSTOM_SUBJECTS_KEY, JSON.stringify(SUBJECTS.filter(item => !baseSubjects.includes(item)))); } catch { /* Keep this session's selection. */ }
  return true;
}
export const ERROR_TYPES = ['개념 부족', '조건 해석 실패', '표상 실패', '매핑 실패', '계산 오류', '시간 부족', '멘탈'] as const;
