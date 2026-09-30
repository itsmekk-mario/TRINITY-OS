/** TRINITY's fixed global learning-day boundary (Asia/Seoul). */
export const STUDY_DAY_START_HOUR = 6;
export const STUDY_TIME_ZONE = 'Asia/Seoul';
const dateFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: STUDY_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const asDate = (value: Date | string | number = new Date()) => value instanceof Date ? value : new Date(value);
const addDays = (key: string, days: number) => { const date = new Date(`${key}T12:00:00+09:00`); date.setUTCDate(date.getUTCDate() + days); return dateFormatter.format(date); };

/** Returns the KST Study Day key for a timestamp. 06:00 is the inclusive boundary. */
export const getStudyDayKey = (value: Date | string | number = new Date()) => dateFormatter.format(new Date(asDate(value).getTime() - STUDY_DAY_START_HOUR * 3_600_000));
export const getStudyDate = getStudyDayKey;
export const getCurrentStudyDay = (value: Date | string | number = new Date()) => getStudyDayKey(value);
export const getPreviousStudyDay = (value: Date | string | number = new Date()) => addDays(getStudyDayKey(value), -1);
export const getNextStudyDay = (value: Date | string | number = new Date()) => addDays(getStudyDayKey(value), 1);
export const getStudyDayRange = (studyDay: string) => {
  const start = new Date(`${studyDay}T${String(STUDY_DAY_START_HOUR).padStart(2, '0')}:00:00+09:00`);
  return { start, end: new Date(`${addDays(studyDay, 1)}T${String(STUDY_DAY_START_HOUR).padStart(2, '0')}:00:00+09:00`) };
};
/** Backward-compatible public date key: all learning records now use Study Day. */
export const toDateKey = getStudyDayKey;
export const formatKoreanDate = (date = new Date()) => new Intl.DateTimeFormat('ko-KR', { timeZone: STUDY_TIME_ZONE, year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(date);
export const formatMinutes = (minutes: number) => `${Math.floor(minutes / 60)}시간 ${Math.round(minutes % 60)}분`;
export const weekStartKey = (date = new Date()) => {
  const value = new Date(`${toDateKey(date)}T12:00:00+09:00`);
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() - day + 1);
  return toDateKey(value);
};
/**
 * Keep a weekly screen on the current week after a rollover, without pulling
 * someone away when they intentionally navigated to a different week.
 */
export const shouldAutoAdvanceWeek = (selectedWeekStart: string, previousCurrentWeekStart: string, currentWeekStart: string) =>
  selectedWeekStart === previousCurrentWeekStart && currentWeekStart !== previousCurrentWeekStart;
export const uid = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
