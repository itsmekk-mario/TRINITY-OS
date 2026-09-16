/** Learning records are keyed to the student's Korean calendar day. */
export const toDateKey = (date = new Date()) => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date);
export const formatKoreanDate = (date = new Date()) => new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(date);
export const formatMinutes = (minutes: number) => `${Math.floor(minutes / 60)}시간 ${Math.round(minutes % 60)}분`;
export const weekStartKey = (date = new Date()) => {
  const value = new Date(`${toDateKey(date)}T12:00:00+09:00`);
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() - day + 1);
  return toDateKey(value);
};
export const uid = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
