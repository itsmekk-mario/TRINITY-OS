import type { AppData, ArenaProfile, ArenaScore, Subject } from '../types.ts';

export type ArenaBadgeCategory = 'execution' | 'capability' | 'consistency' | 'review' | 'exploration' | 'secret';
export type ArenaBadgeIcon = 'award' | 'book' | 'brain' | 'calendar' | 'clock' | 'crown' | 'flame' | 'gem' | 'graduation' | 'moon' | 'rocket' | 'sparkles' | 'star' | 'sun' | 'target' | 'trophy' | 'zap';
export type ArenaBadge = { code: string; title: string; description: string; category: ArenaBadgeCategory; icon: ArenaBadgeIcon; unlocked: boolean; secret?: boolean; current?: number; target?: number };
type BadgeRule = Omit<ArenaBadge, 'unlocked' | 'current'> & { value: (context: BadgeContext) => number; target: number };
type BadgeContext = { data: AppData; score: ArenaScore; profile: ArenaProfile; serverCodes: Set<string> };

const totalSeconds = (data: AppData) => data.sessions.reduce((sum, item) => sum + Math.max(0, item.seconds), 0);
const completedPlans = (data: AppData) => Object.values(data.calendar).flatMap((day) => day.plans ?? []).filter((item) => item.done).length;
const completeRetries = (data: AppData, id?: '3d' | '7d' | '14d') => data.wrongAnswerDrills.flatMap((item) => item.retries ?? []).filter((retry) => (!id || retry.id === id) && retry.completedDate).length;
const hourOf = (value?: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).getHours() : -1;
const completedResources = (data: AppData) => data.resources.filter((item) => item.total > 0 && item.done >= item.total).length;
const subjectScore = (entry: AppData['scores'][number]) => entry.subject === '국어' ? entry.korean : entry.subject === '수학' ? entry.math : entry.subject === '영어' ? entry.english : undefined;
const maxScore = (data: AppData) => Math.max(0, ...data.scores.flatMap((entry) => [subjectScore(entry), ...Object.values(entry.reviews ?? {}).map((review) => review?.score)].filter((value): value is number => typeof value === 'number')));
const scoreComeback = (data: AppData) => {
  const subjects: Subject[] = ['국어', '수학', '영어'];
  return subjects.some((subject) => { const scores = data.scores.filter((item) => item.subject === subject).sort((a, b) => a.date.localeCompare(b.date)).map(subjectScore).filter((value): value is number => typeof value === 'number'); return scores.some((value, index) => index > 0 && value - scores[index - 1] >= 10); }) ? 1 : 0;
};

const RULES: BadgeRule[] = [
  { code: 'first-focus', title: '첫 점화', description: '첫 학습 세션을 완료', category: 'execution', icon: 'sparkles', target: 1, value: ({ data }) => data.sessions.length },
  { code: 'focus-10h', title: '몰입의 씨앗', description: '누적 순공 10시간', category: 'execution', icon: 'clock', target: 10, value: ({ data }) => totalSeconds(data) / 3600 },
  { code: 'focus-50h', title: '집중 항해자', description: '누적 순공 50시간', category: 'execution', icon: 'rocket', target: 50, value: ({ data }) => totalSeconds(data) / 3600 },
  { code: 'focus-100h', title: '백시간의 증거', description: '누적 순공 100시간', category: 'execution', icon: 'trophy', target: 100, value: ({ data }) => totalSeconds(data) / 3600 },
  { code: 'focus-500h', title: '시간의 건축가', description: '누적 순공 500시간', category: 'execution', icon: 'crown', target: 500, value: ({ data }) => totalSeconds(data) / 3600 },
  { code: 'deep-90', title: 'Deep 90', description: '90분 이상 단일 집중 세션', category: 'execution', icon: 'brain', target: 90, value: ({ data }) => Math.max(0, ...data.sessions.map((item) => item.seconds / 60)) },
  { code: 'deep-180', title: '심해 잠수', description: '180분 이상 단일 집중 세션', category: 'execution', icon: 'gem', target: 180, value: ({ data }) => Math.max(0, ...data.sessions.map((item) => item.seconds / 60)) },
  { code: 'plan-first', title: '설계자의 첫 선', description: '첫 계획을 완료', category: 'execution', icon: 'calendar', target: 1, value: ({ data }) => completedPlans(data) },
  { code: 'plan-10', title: '체크메이트 10', description: '계획 10개 완료', category: 'execution', icon: 'calendar', target: 10, value: ({ data }) => completedPlans(data) },
  { code: 'plan-50', title: '실행의 지도', description: '계획 50개 완료', category: 'execution', icon: 'award', target: 50, value: ({ data }) => completedPlans(data) },
  { code: 'perfect-day', title: '완벽한 하루', description: '하루의 계획을 모두 완료', category: 'execution', icon: 'sun', target: 1, value: ({ data }) => Object.values(data.calendar).some((day) => day.plans?.length && day.plans.every((item) => item.done)) ? 1 : 0 },

  { code: 'wrong-first', title: '오답과의 악수', description: '첫 Wrong Answer Drill 기록', category: 'capability', icon: 'target', target: 1, value: ({ data }) => data.wrongAnswerDrills.length },
  { code: 'wrong-10', title: '패턴 사냥꾼', description: '오답 Drill 10개 분석', category: 'capability', icon: 'target', target: 10, value: ({ data }) => data.wrongAnswerDrills.length },
  { code: 'wrong-50', title: '병목 해체자', description: '오답 Drill 50개 분석', category: 'capability', icon: 'trophy', target: 50, value: ({ data }) => data.wrongAnswerDrills.length },
  { code: 'retry-3d', title: '72시간의 약속', description: '3일 재도전 완료', category: 'capability', icon: 'zap', target: 1, value: ({ data }) => completeRetries(data, '3d') },
  { code: 'retry-7d', title: '일주일 뒤에도', description: '7일 재도전 완료', category: 'capability', icon: 'star', target: 1, value: ({ data }) => completeRetries(data, '7d') },
  { code: 'retry-14d', title: '기억의 귀환', description: '14일 재도전 완료', category: 'capability', icon: 'crown', target: 1, value: ({ data }) => completeRetries(data, '14d') },
  { code: 'triple-retry', title: '3·7·14', description: '한 오답의 모든 재도전을 완료', category: 'capability', icon: 'gem', target: 1, value: ({ data }) => data.wrongAnswerDrills.some((item) => ['3d', '7d', '14d'].every((id) => item.retries?.some((retry) => retry.id === id && retry.completedDate))) ? 1 : 0 },
  { code: 'transfer-5', title: '전이의 시작', description: '전이 행동 5개 설계', category: 'capability', icon: 'rocket', target: 5, value: ({ data }) => data.wrongAnswerDrills.filter((item) => item.transfer.trim()).length },
  { code: 'goal-first', title: '능력 설계자', description: '첫 Capability Goal 검증', category: 'capability', icon: 'brain', target: 1, value: ({ data }) => data.weeklyCapabilityGoals.filter((item) => item.done).length },
  { code: 'goal-10', title: '능력의 계단', description: 'Capability Goal 10개 검증', category: 'capability', icon: 'graduation', target: 10, value: ({ data }) => data.weeklyCapabilityGoals.filter((item) => item.done).length },
  { code: 'full-loop', title: 'Closed Loop', description: '실모→오답→Goal→Retry 연결 완성', category: 'capability', icon: 'award', target: 1, value: ({ data }) => data.wrongAnswerDrills.some((item) => item.scoreId && item.capabilityGoalId && item.retries?.some((retry) => retry.completedDate)) ? 1 : 0 },

  { code: 'streak-3', title: '삼일의 리듬', description: '3일 연속 학습', category: 'consistency', icon: 'flame', target: 3, value: ({ score }) => score.metrics.streakDays },
  { code: 'streak-7', title: '일주일 무결점', description: '7일 연속 학습', category: 'consistency', icon: 'flame', target: 7, value: ({ score }) => score.metrics.streakDays },
  { code: 'streak-30', title: '30일의 궤도', description: '30일 연속 학습', category: 'consistency', icon: 'rocket', target: 30, value: ({ score }) => score.metrics.streakDays },
  { code: 'all-subjects', title: '사방의 균형', description: '네 과목 모두 학습 기록', category: 'consistency', icon: 'star', target: 4, value: ({ data }) => new Set(data.sessions.map((item) => item.subject)).size },
  { code: 'daily-drill-10', title: '매일의 교정', description: 'Daily Drill 10개 완료', category: 'consistency', icon: 'target', target: 10, value: ({ data }) => data.dailyDrills.filter((item) => item.done).length },
  { code: 'feedback-loop', title: '피드백 실천가', description: '교사 피드백을 Drill로 실행', category: 'consistency', icon: 'graduation', target: 1, value: ({ data }) => data.dailyDrills.filter((item) => item.feedbackId && item.done).length },

  { code: 'mock-first', title: '첫 실전', description: '첫 실모 기록', category: 'review', icon: 'trophy', target: 1, value: ({ data }) => data.scores.length },
  { code: 'score-90', title: '90의 벽 너머', description: '실모 90점 이상 기록', category: 'review', icon: 'award', target: 90, value: ({ data }) => maxScore(data) },
  { code: 'score-100', title: '완전무결', description: '실모 100점 기록', category: 'review', icon: 'crown', target: 100, value: ({ data }) => maxScore(data) },
  { code: 'comeback-10', title: '반전의 그래프', description: '같은 과목 점수 10점 상승', category: 'review', icon: 'rocket', target: 1, value: ({ data }) => scoreComeback(data) },
  { code: 'journal-first', title: '관찰자의 펜', description: '첫 Journal 작성', category: 'review', icon: 'book', target: 1, value: ({ data }) => Object.keys(data.journals).length },
  { code: 'journal-7', title: '일곱 번의 성찰', description: 'Journal 7일 기록', category: 'review', icon: 'book', target: 7, value: ({ data }) => Object.keys(data.journals).length },
  { code: 'plaire-7', title: 'PLAiRE 렌즈', description: 'Plaire Review 7일 기록', category: 'review', icon: 'brain', target: 7, value: ({ data }) => Object.keys(data.plaire).length },
  { code: 'trinity-10', title: 'TRINITY Analyst', description: 'Trinity Analysis 10개 기록', category: 'review', icon: 'gem', target: 10, value: ({ data }) => data.trinity.length },

  { code: 'profile-complete', title: '좌표 설정 완료', description: '목표 대학·학과·전형 설정', category: 'exploration', icon: 'graduation', target: 3, value: ({ profile }) => [profile.targetUniversity, profile.targetDepartment, profile.targetAdmissionType].filter(Boolean).length },
  { code: 'resource-one', title: '한 권의 완주', description: '교재 하나를 끝까지 완료', category: 'exploration', icon: 'book', target: 1, value: ({ data }) => completedResources(data) },
  { code: 'resource-three', title: '서가의 정복자', description: '교재 세 권 완료', category: 'exploration', icon: 'book', target: 3, value: ({ data }) => completedResources(data) },
  { code: 'snu-challenger', title: '서울대 도전자', description: '서울대학교를 목표로 설정', category: 'exploration', icon: 'graduation', target: 1, value: ({ profile, serverCodes }) => serverCodes.has('snu-challenger') || profile.targetUniversity.includes('서울') ? 1 : 0 },
  { code: 'grade-one', title: '1등급 진입', description: '현재 성취 수준에 1등급 기록', category: 'exploration', icon: 'trophy', target: 1, value: ({ profile, serverCodes }) => serverCodes.has('grade-one') || profile.achievementLevel.includes('1등급') ? 1 : 0 },
  { code: 'growth-10', title: '주간 성장 +10', description: '한 주 성장률 10% 이상', category: 'exploration', icon: 'rocket', target: 10, value: ({ score, serverCodes }) => serverCodes.has('growth-10') ? 10 : Math.max(0, score.metrics.growthRate) },

  { code: 'dawn-patrol', title: '새벽의 관측자', description: '오전 4–6시에 학습을 시작', category: 'secret', icon: 'sun', secret: true, target: 1, value: ({ data }) => data.sessions.some((item) => { const hour = hourOf(item.startedAt); return hour >= 4 && hour < 7; }) ? 1 : 0 },
  { code: 'midnight-oil', title: '자정의 잉크', description: '밤 11시 이후 학습을 시작', category: 'secret', icon: 'moon', secret: true, target: 1, value: ({ data }) => data.sessions.some((item) => { const hour = hourOf(item.startedAt); return hour === 23 || hour === 0; }) ? 1 : 0 },
  { code: 'answer-42', title: '삶, 우주, 그리고 오답', description: '어딘가에 42가 기록되었습니다', category: 'secret', icon: 'sparkles', secret: true, target: 1, value: ({ data }) => data.scores.some((item) => subjectScore(item) === 42) ? 1 : 0 },
  { code: 'trinity-333', title: '세 개의 3', description: '33분 33초 집중 세션', category: 'secret', icon: 'gem', secret: true, target: 1, value: ({ data }) => data.sessions.some((item) => item.seconds === 2013) ? 1 : 0 },
  { code: 'golden-97', title: '황금 집중', description: '정확히 97분 집중', category: 'secret', icon: 'star', secret: true, target: 1, value: ({ data }) => data.sessions.some((item) => item.seconds === 5820) ? 1 : 0 },
  { code: 'wrong-answer-breaker', title: '오답 제거자', description: '재도전을 세 번 이상 완료', category: 'secret', icon: 'zap', secret: true, target: 3, value: ({ data, serverCodes }) => serverCodes.has('wrong-answer-breaker') ? 3 : completeRetries(data) },
];

export const ARENA_BADGE_CATEGORIES: { id: ArenaBadgeCategory; label: string }[] = [
  { id: 'execution', label: '실행' }, { id: 'capability', label: '능력' }, { id: 'consistency', label: '꾸준함' }, { id: 'review', label: 'Review' }, { id: 'exploration', label: '탐험' }, { id: 'secret', label: 'Secret' },
];

export function calculateArenaBadges(data: AppData, score: ArenaScore, profile: ArenaProfile, serverCodes: Set<string>): ArenaBadge[] {
  const context = { data, score, profile, serverCodes };
  return RULES.map((rule) => { const current = Math.max(0, rule.value(context)); return { ...rule, current, unlocked: serverCodes.has(rule.code) || current >= rule.target }; });
}
