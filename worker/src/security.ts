export const LEGACY_PASSWORD_ITERATIONS = 100_000;
// 310k is a substantial upgrade while remaining practical within Workers CPU budgets.
export const PASSWORD_HASH_ITERATIONS = 310_000;
export const DEFAULT_SESSION_TTL_DAYS = 7;
export const MAX_SYNC_BODY = 5 * 1024 * 1024;
export const MAX_JSON_BODY = 256 * 1024;

const encoder = new TextEncoder();
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);

export const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');
export const randomHex = (size = 32) => { const bytes = new Uint8Array(size); crypto.getRandomValues(bytes); return hex(bytes.buffer); };
export const sha256 = async (value: string) => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));

export async function passwordHash(password: string, salt: string, iterations = PASSWORD_HASH_ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations }, key, 256));
}

export async function secretMatches(provided: string, expected?: string) {
  if (!expected) return false;
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(providedHash, expectedHash);
}

export function containsUnsafeKey(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsUnsafeKey);
  return Object.entries(value as Record<string, unknown>).some(([key, child]) => forbiddenKeys.has(key) || containsUnsafeKey(child));
}

export async function boundedJson<T>(request: Request, maxBytes = MAX_JSON_BODY): Promise<T> {
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > maxBytes) throw new RequestError(413, '요청 본문이 너무 큽니다.');
  if(!request.body)throw new RequestError(400,'요청 본문이 필요합니다.');
  const reader=request.body.getReader(),chunks:Uint8Array[]=[]; let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;if(value){size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw new RequestError(413,'요청 본문이 너무 큽니다.');}chunks.push(value);}}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;} const raw=new TextDecoder().decode(bytes);
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new RequestError(400, '올바른 JSON 요청이 아닙니다.'); }
  if (containsUnsafeKey(value)) throw new RequestError(400, '허용되지 않는 데이터 키가 포함되어 있습니다.');
  return value as T;
}

export function validateAppData(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || containsUnsafeKey(value)) return false;
  const data = value as Record<string, unknown>;
  const arrays = ['sessions', 'scores', 'resources', 'goals', 'weeklyCapabilityGoals', 'wrongAnswerDrills', 'dailyDrills', 'monthlyPlans', 'notionPages', 'routine', 'quotes', 'trinity', 'mockSchedule'];
  const records = ['calendar', 'journals', 'plaire'];
  return arrays.every((key) => Array.isArray(data[key])) && records.every((key) => Boolean(data[key]) && typeof data[key] === 'object' && !Array.isArray(data[key]));
}

export class RequestError extends Error {
  constructor(public status: number, message: string, public retryAfter?: number) { super(message); }
}

export function sessionTtlDays(value?: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 30 ? parsed : DEFAULT_SESSION_TTL_DAYS;
}

export function requestOrigin(request: Request, allowedOrigin?: string, environment?: string) {
  const origin = request.headers.get('Origin');
  if (!origin) return { allowed: true, responseOrigin: allowedOrigin || '' };
  if (allowedOrigin && origin === allowedOrigin) return { allowed: true, responseOrigin: origin };
  if (environment !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return { allowed: true, responseOrigin: origin };
  return { allowed: false, responseOrigin: '' };
}
