import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { analyzeLearningData } from '../src/lib/coach/analytics.ts';
import { answerLocalCoachQuestion } from '../src/lib/coach/localCoach.ts';
import { AIService } from '../worker/src/lib/ai/service.ts';
import { AIProviderError } from '../worker/src/lib/ai/types.ts';

const NOW = new Date('2026-09-11T12:00:00+09:00');
const baseData = () => ({
  calendar: {}, sessions: [], mockSchedule: [], journals: {}, scores: [], resources: [], goals: [],
  weeklyCapabilityGoals: [], wrongAnswerDrills: [], dailyDrills: [], monthlyPlans: [], notionPages: [], routine: [], quotes: [],
  examDate: '2028-11-16', googleClientId: '', plaire: {}, trinity: [],
});
const wrong = (id, date, bottleneck = '발문·해석', extra = {}) => ({
  id, date, subject: '수학', source: '테스트', question: id, bottleneck,
  wrongJudgment: '필요조건만 확인', missedCue: '조건 누락', correction: '조건에 밑줄', transfer: '유사 문제 재검증', ...extra,
});

test('최근 조건 관련 오답을 핵심 병목으로 탐지한다', () => {
  const data = baseData();
  data.wrongAnswerDrills = [wrong('a', '2026-09-10'), wrong('b', '2026-09-09'), wrong('c', '2026-09-07'), wrong('d', '2026-09-08', '시간 관리')];
  const analysis = analyzeLearningData(data, NOW);
  assert.equal(analysis.diagnosis.primaryBottleneck?.title, '발문·해석');
  assert.equal(analysis.diagnosis.primaryBottleneck?.confidence, 'medium');
  assert.match(analysis.diagnosis.primaryBottleneck?.evidence.join(' ') ?? '', /조건 누락/);
});

test('오답 표본이 하나면 낮은 신뢰도를 표시한다', () => {
  const data = baseData();
  data.wrongAnswerDrills = [wrong('a', '2026-09-10')];
  const analysis = analyzeLearningData(data, NOW);
  assert.equal(analysis.diagnosis.primaryBottleneck?.confidence, 'low');
  assert.match(analysis.diagnosis.status, /표본은 적지만/);
});

test('기한이 지난 3d/7d 재도전을 높은 우선순위로 진단한다', () => {
  const data = baseData();
  data.wrongAnswerDrills = [wrong('a', '2026-09-01', '계산 실수', { retries: [
    { id: '3d', label: '3일', dueDate: '2026-09-04' },
    { id: '7d', label: '7일', dueDate: '2026-09-08' },
    { id: '14d', label: '14일', dueDate: '2026-09-15' },
  ] })];
  const analysis = analyzeLearningData(data, NOW);
  assert.equal(analysis.retries.overdue, 2);
  assert.equal(analysis.diagnosis.primaryBottleneck?.title, '오답 재검증 루프 미완료');
  assert.match(analysis.diagnosis.warnings?.join(' ') ?? '', /2개/);
});

test('실제 병목과 일치하는 Weekly Goal의 Drill과 성공 기준을 재사용한다', () => {
  const data = baseData();
  data.wrongAnswerDrills = [wrong('a', '2026-09-10'), wrong('b', '2026-09-09')];
  data.weeklyCapabilityGoals = [{ id: 'g', weekStart: '2026-09-07', subject: '수학', ability: '조건 누락 감소', successCriterion: '조건을 먼저 표시하고 풀이한다.', drillDesign: '기존 조건 해석 Drill 2문제를 재풀이한다.', evidence: '', done: false }];
  const analysis = analyzeLearningData(data, NOW);
  assert.equal(analysis.diagnosis.nextAction.description, '기존 조건 해석 Drill 2문제를 재풀이한다.');
  assert.equal(analysis.diagnosis.nextAction.successCriterion, '조건을 먼저 표시하고 풀이한다.');
  assert.match(analysis.diagnosis.keepDoing ?? '', /기존 Drill/);
});

test('데이터가 없어도 추측 없이 insufficient 진단과 로컬 답변을 만든다', () => {
  const analysis = analyzeLearningData(baseData(), NOW);
  assert.equal(analysis.diagnosis.primaryBottleneck, null);
  assert.match(analysis.diagnosis.status, /데이터가 아직 부족/);
  assert.match(answerLocalCoachQuestion('현재 병목 뭐야?', analysis) ?? '', /데이터가 아직 부족/);
});

test('같은 과목의 비교 가능한 100점 점수만으로 보수적인 추세를 계산한다', () => {
  const data = baseData();
  data.scores = [
    { id: 's1', name: '실모 A', date: '2026-09-01', subject: '국어', korean: 70, duration: 80, errorType: '', cause: '', nextAction: '' },
    { id: 's2', name: '실모 B', date: '2026-09-10', subject: '국어', korean: 74, duration: 80, errorType: '', cause: '', nextAction: '' },
  ];
  const analysis = analyzeLearningData(data, NOW);
  assert.equal(analysis.subjects.find((item) => item.subject === '국어')?.recentScoreTrend, 'up');
  assert.equal(analysis.subjects.find((item) => item.subject === '탐구')?.recentScoreTrend, 'insufficient');
});

class FakeStatement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() {
    if (this.sql.startsWith('SELECT response')) return this.db.cache.get(this.args[0]) ?? null;
    if (this.sql.includes('COUNT(*)') && this.sql.includes('user_id=?')) return { count: this.db.usage.filter((item) => item.userId === this.args[0]).length };
    if (this.sql.includes('COUNT(*)')) return { count: this.db.usage.length };
    if (this.sql.startsWith('SELECT created_at')) return [...this.db.usage].reverse().find((item) => item.userId === this.args[0] && item.operation === 'chat') ?? null;
    return null;
  }
  async run() {
    if (this.sql.startsWith('DELETE FROM ai_cache')) this.db.cache.delete(this.args[0]);
    if (this.sql.startsWith('INSERT INTO ai_usage')) this.db.usage.push({ id: this.args[0], userId: this.args[1], operation: this.args[2], created_at: this.args[5], success: 0 });
    if (this.sql.startsWith('INSERT INTO ai_cache')) this.db.cache.set(this.args[0], { response: this.args[3], expires_at: this.args[5] });
    if (this.sql.startsWith('UPDATE ai_usage SET provider')) Object.assign(this.db.usage.find((item) => item.id === this.args[2]), { success: 1, status: 200 });
    if (this.sql.startsWith('UPDATE ai_usage SET status_code')) Object.assign(this.db.usage.find((item) => item.id === this.args[1]), { status: this.args[0] });
    return { success: true, meta: {} };
  }
}
class FakeDB {
  cache = new Map(); usage = [];
  prepare(sql) { return new FakeStatement(this, sql); }
}
const completion = (db, service, key = 'same', operation = 'study-analysis', config = {}) => service.complete({ db, userId: 1, user: 'student', operation, cacheKey: key, messages: [{ role: 'user', content: 'context' }], maxTokens: 100, config: { provider: 'fake', userDailyLimit: '12', globalDailyLimit: '100', chatCooldownSeconds: '0', ...config } });

test('동일 context는 D1 캐시를 재사용해 provider를 한 번만 호출한다', async () => {
  const db = new FakeDB(); let calls = 0;
  const service = new AIService(() => ({ name: 'fake', async chat() { calls += 1; return { content: '정밀 분석', provider: 'fake', model: 'test' }; } }));
  assert.equal((await completion(db, service)).cached, false);
  assert.equal((await completion(db, service)).cached, true);
  assert.equal(calls, 1);
  assert.equal(db.usage.length, 1);
});

test('provider 429는 재시도하지 않고 Local Coach 분석과 독립적으로 실패한다', async () => {
  const db = new FakeDB(); let calls = 0;
  const service = new AIService(() => ({ name: 'fake', async chat() { calls += 1; throw new AIProviderError('rate', 429, 'AI_RATE_LIMITED'); } }));
  await assert.rejects(completion(db, service, '429'), (error) => error instanceof AIProviderError && error.status === 429);
  assert.equal(calls, 1);
  assert.match(analyzeLearningData(baseData(), NOW).diagnosis.status, /데이터가 아직 부족/);
});

test('Chat 메시지 한 번은 provider를 최대 한 번 호출하고 서버 예산 guard가 추가 호출을 막는다', async () => {
  const db = new FakeDB(); let calls = 0;
  const service = new AIService(() => ({ name: 'fake', async chat() { calls += 1; return { content: '상담', provider: 'fake', model: 'test' }; } }));
  await completion(db, service, 'chat-1', 'chat', { userDailyLimit: '1' });
  await assert.rejects(completion(db, service, 'chat-2', 'chat', { userDailyLimit: '1' }), (error) => error instanceof AIProviderError && error.status === 429);
  assert.equal(calls, 1);
});

test('Dashboard 렌더 경로에는 자동 NIM 요청 effect가 없다', async () => {
  const source = await readFile(new URL('../src/components/DailyCoachCard.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /useEffect|requestDailyCoach|force\s*:/);
  assert.match(source, /onClick=\{requestPreciseAnalysis\}/);
});

test('우측 하단 AI CHAT은 열기만 해서는 네트워크 요청을 만들지 않는다', async () => {
  const source = await readFile(new URL('../src/components/FloatingCoachChat.tsx', import.meta.url), 'utf8');
  assert.match(source, /floating-ai-chat/);
  assert.match(source, /<CoachChat analysis=\{analysis\}/);
  assert.doesNotMatch(source, /fetch\(|requestCoachChat|requestPreciseAnalysis|useEffect/);
});

test('신규 학생 계정은 관리자 전용 비밀번호 로그인 계정으로 생성된다', async () => {
  const source = await readFile(new URL('../worker/src/index.ts', import.meta.url), 'utf8');
  assert.match(source, /\/api\/admin\/students/);
  assert.match(source, /X-Setup-Token/);
  assert.match(source, /INSERT INTO users\(username,password_hash,salt,is_admin,created_at\)/);
  assert.match(source, /이미 사용 중인 아이디입니다/);
});
