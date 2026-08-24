export const toDateKey = (date = new Date()) => {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
};
export const formatKoreanDate = (date = new Date()) => new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(date);
export const formatMinutes = (minutes: number) => `${Math.floor(minutes / 60)}시간 ${Math.round(minutes % 60)}분`;
export const weekStartKey = (date = new Date()) => {
  const value = new Date(date);
  const day = value.getDay() || 7;
  value.setDate(value.getDate() - day + 1);
  return toDateKey(value);
};
export const uid = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
