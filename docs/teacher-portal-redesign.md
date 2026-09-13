# TRINITY OS — Teacher Portal Redesign

기준 커밋: `85257da3dd902489da92eae5ed3df30bc906c3df` (main).
작업 시작과 최종 점검 시 GitHub HEAD가 같은 커밋임을 확인했습니다.

## 1. 변경한 파일 목록

| 파일 | 변경 목적 |
| --- | --- |
| [.gitignore](../.gitignore) | 테스트 도구·스크린샷 제외 |
| [src/App.tsx](../src/App.tsx) | 기존 교사 URL 유지, 교사 화면 지연 로딩 |
| [src/main.tsx](../src/main.tsx) | 교사 전용 CSS 진입점 |
| [src/pages/CollaborativePortal.tsx](../src/pages/CollaborativePortal.tsx) | 로그인·학생 선택·기간·API·역할별 화면 연결 |
| [src/pages/FeedbackInbox.tsx](../src/pages/FeedbackInbox.tsx) | 학생의 목표·Drill 확인 후 생성 |
| [src/components/teacher/types.ts](../src/components/teacher/types.ts) | 교사 대시보드 공통 계약 |
| [src/components/teacher/shared.tsx](../src/components/teacher/shared.tsx) | 진단 작성·Signal·상태·이력·확인 dialog |
| [src/components/teacher/MathTeacherDashboard.tsx](../src/components/teacher/MathTeacherDashboard.tsx) | 수학 IA·주요 판단·병목 연결 |
| [src/components/teacher/MathPanels.tsx](../src/components/teacher/MathPanels.tsx) | Capability·오답 패턴·실모·Drill·교재·Inspector |
| [src/components/teacher/LearningManagerDashboard.tsx](../src/components/teacher/LearningManagerDashboard.tsx) | 전체 학습 IA·개입 우선순위·재진단 요청 |
| [src/components/teacher/LearningPanels.tsx](../src/components/teacher/LearningPanels.tsx) | 실행·과목 상태·목표·성과 비교 |
| [src/lib/teacherAnalytics.ts](../src/lib/teacherAnalytics.ts) | 날짜 범위·실제 점수·병목·실행 집계 |
| [src/lib/teacherSignals.ts](../src/lib/teacherSignals.ts) | Signal 메타데이터 타입 |
| [src/lib/feedback.ts](../src/lib/feedback.ts) | 기존 Feedback에 선택적 Signal 추가 |
| [src/lib/feedbackDrafts.ts](../src/lib/feedbackDrafts.ts) | 기존 목표·Drill 변환 함수 분리 및 초안 재사용 |
| [src/teacher.css](../src/teacher.css) | 교사 전용 반응형 레이아웃 |
| [worker/src/collaboration.ts](../worker/src/collaboration.ts) | 안전한 데이터 투영·Signal API·편집 권한·감사 기록 |
| [worker/src/teacherSignals.ts](../worker/src/teacherSignals.ts) | 서버 측 Signal·초안 입력 검증 |
| [worker/src/support.ts](../worker/src/support.ts) | 레거시 공유 API에도 동일한 과목·권한 필터 적용 |
| [worker/src/index.ts](../worker/src/index.ts) | PATCH CORS 허용 |
| [worker/migrations/0010_teacher_signals.sql](../worker/migrations/0010_teacher_signals.sql) | 기존 피드백에 nullable signal_json 열 추가 |
| [tests/teacher-portal.test.mjs](../tests/teacher-portal.test.mjs) | 실제 Worker 핸들러·SQLite·권한·불변성 테스트 |
| [tests/teacher-browser.mjs](../tests/teacher-browser.mjs) | 실제 로그인/API·브라우저·반응형·학생 회귀 검증 |
| [tests/ui.test.mjs](../tests/ui.test.mjs) | 실제 역할별 컴포넌트 렌더링 검증 |
| [docs/teacher-portal-redesign.md](teacher-portal-redesign.md) | 분석·스키마·검증·운영 적용 설명 |

## 2. 기존 Teacher Portal 구조 분석

- `App.tsx`의 `?portal=teacher` / `tutor`는 subject_teacher, `?portal=manager`는 academic_manager를 사용했습니다.
- 두 역할은 `CollaborativePortal`의 동일한 `TrinityLearningView`를 공유하며 과목 필터만 달랐습니다. 학생용 TrinityLearningView는 유지했습니다.
- 교사 로그인은 support_accounts/support_sessions, 담당 배정은 student_support_assignments를 사용합니다. 학생별 learning_state는 기존 Sync로 저장됩니다.
- 기존 teacher_feedback의 bottleneck, observation, action, success_criterion, categories, context_type/context_target_id와 링크 열을 재사용했습니다.
- 기존 WeeklyCapabilityGoal / DailyDrill의 feedbackId와 Drill의 capabilityGoalId, WrongAnswerDrill의 scoreId/capabilityGoalId/retries를 연결합니다.
- 기존 계획의 quantity는 parsePlannedMinutes로 읽습니다. 문제 수를 시간으로 변환하지 않습니다.
- 기존 서버 투영에서 manager 점수가 누락되고, 오답의 wrongJudgment/missedCue/transfer/retries 등이 누락되어 있었습니다. 이를 학습 권한과 담당 과목 안에서 보완했습니다.
- 범위 밖의 원본 요약이 노출될 수 있는 경로를 제거하고 안전한 투영으로 계산합니다.
- 레거시 /api/support/data는 모든 교사에게 수학 필터를 사용하고 세부 권한을 적용하지 않았습니다. 동일한 outData를 사용하도록 고쳤고 기존 응답의 goals/daily/monthly/routine/checklist 키를 유지했습니다.
- Plaire는 과목 식별자가 없어 교과 선생님에게 안전하게 과목별 분리할 수 없습니다. 학습 관리 선생님에게 기존 제한 필드만 투영하며, 교과 선생님은 허용된 자기 과목 Trinity 분석을 확인합니다.

## 3. 새 Math Teacher IA

Overview → Capability → Bottlenecks → Mock Exams → Wrong Answers → Drill → Resources → Feedback.

- Overview는 최신 활성 교사 진단을 가장 크게 표시합니다. 진단이 없으면 학생이 직접 기록한 반복 오류 분류와 빈도를 보여줍니다.
- 실모 평균은 실제 과목 점수만 사용하며, Drill 완료 여부를 성공률로 표시하지 않습니다.
- Capability는 기존 오류 분류와 연결된 Attention 또는 데이터 부족을 표시합니다. 임의의 능력 점수를 만들지 않습니다.
- 오답은 학생의 bottleneck 분류로 묶고 관련 문항 Inspector로 연결합니다.
- Inspector는 학생의 판단·단서·교정·전이·재도전과 연결된 실모를 보여줍니다. 진단 작성, 직접 목표·Drill 초안 제안, 학습 선생님 전달을 제공합니다.
- 학습 선생님의 재진단 요청에서 실제 학습 시간·실모·Drill 기록을 열어 새 intervention을 전달할 수 있습니다.

## 4. 새 Learning Teacher IA

Overview → Execution → Subjects → Weekly Goals → Teacher Signals → Schedule / Load → Trends → Feedback.

- Overview는 우선순위가 높은 활성 과목 Signal의 실제 병목 문장을 먼저 보여줍니다.
- Attention Required는 과목 Signal, 반복 오류, 계획 미완료, 재진단 조건을 연결합니다. 해결·보류 Signal은 이력에서 확인합니다.
- Execution은 선택 기간의 계획 건수 완료율과 실제 공부 시간을 구분합니다.
- 모든 계획에 명시적인 시간이 있는 경우에만 시간 실행률·effort 분류를 계산합니다.
- Outcome은 이전 동일 길이 기간의 실제 과목 점수 평균과 비교합니다. 두 기간 중 하나에 점수가 없으면 분류하지 않습니다.
- 증가한 학습 시간 + 기록된 Drill 전부 완료 + 성적 평균 정체/하락이 함께 있을 때 재진단 요청을 제안합니다.
- 비교는 시험 난도 차이를 반영하지 않는 단순 기록 비교임을 UI에 명시했습니다.

## 5. Teacher Signal 데이터 흐름

```text
수학 교사 진단 + 근거 + 행동 + 성공 기준
  → teacher_feedback + signal_json (open)
  → 학습 관리 교사의 Signal / Attention Required
  → 목표·Drill 초안 확인 및 전달 (accepted)
  → 학생 피드백함
  → 학생 실행
  → 교사 기록 검토 / Signal resolved

학습 관리 교사 실행 이상 발견
  → 재진단 요청 Signal (해당 과목을 지정)
  → 담당 과목 교사
  → 관련 시간·점수·Drill 분석
  → 새로운 진단·intervention Signal
```

기존 피드백 내용은 수신 교사가 수정할 수 없습니다. 수신 교사는 Signal의 상태와 intervention 초안을 갱신하며 기존 teacher_feedback_audit에 스냅샷을 기록합니다.

## 6. Weekly Goal / Daily Drill 연결 방식

- 버튼을 누르면 공통 확인 dialog가 열리고 기존 피드백의 제목·행동·성공 기준·근거 또는 저장된 초안이 채워집니다.
- 수학 선생님은 Inspector에서 직접 목표·Drill 초안을 작성해 Signal로 제안할 수 있습니다.
- 학습 선생님은 수신 Signal의 목표·Drill 초안을 검토·조절하여 학생에게 전달합니다.
- dialog 열기와 취소는 저장하지 않습니다. 교사의 최종 확인은 피드백의 초안만 저장하며 learning_state를 변경하지 않습니다.
- 학생은 기존 FeedbackInbox에서 초안을 확인·수정하고 최종 생성합니다. 기존 makeWeeklyGoal/makeDailyDrill 변환 함수와 학생 update/Sync를 사용합니다.
- 원래 linked_weekly_goal_id / linked_daily_drill_id와 feedbackId를 유지합니다. 학생이 동일 Signal에서 목표를 먼저 만들면 후속 Drill의 capabilityGoalId를 연결합니다.
- 학생이 이미 반영한 intervention의 교사 초안 덮어쓰기는 서버에서 거부합니다.

## 7. 권한 처리 방식

- 기존 support 인증과 public student ID → 학생 내부 ID → 담당 assignment 검증을 유지합니다.
- subject_teacher 데이터는 서버에서 담당 과목으로 제한하고 각 view 권한을 확인합니다. academic_manager는 기존 정책대로 전체 학업 데이터에 접근합니다.
- 새로운 Signal의 sourceRole/targetRole/교과 선생님의 subject는 서버가 확정합니다.
- 근거 ID는 서버가 해당 교사의 투영 데이터에 실제로 존재하는지 검증합니다.
- Signal 상태·초안 변경은 담당 학생의 수신 역할만 할 수 있습니다. 다른 과목 교사·부모·미배정 계정은 거부합니다.
- 피드백 작성 권한과 배정이 해제되면 작성자의 기존 피드백 편집도 차단합니다.
- 레거시 공유 데이터 API에도 동일한 서버 필터를 적용했습니다.
- 개인 session note, calendar reflection, journals, Notion 등 사적 원본은 교사 데이터에 포함하지 않습니다.
- 권한 때문에 누락된 데이터는 0건으로 단정하지 않도록 읽기 전용 access 메타데이터를 추가했습니다.
- 학생 /api/sync의 원본 소유권과 교사의 원본 접근 차단을 유지합니다.

## 8. Responsive 처리

- 1024px 이상: 역할 전용 사이드 navigation + 유연한 main 영역.
- 작은 태블릿: compact 가로 탭, 학생 컨텍스트 영역 재배치.
- 768px 세로 태블릿과 모바일: Inspector 전체 화면.
- 태블릿 landscape / desktop: 오른쪽 Inspector.
- 390px에서는 학생 컨텍스트·보조 자료를 한 열로 배치합니다.
- 실제 브라우저에서 모든 역할별 탭과 Inspector를 390 / 768 / 1024 / 1280 / 1440px로 검증합니다. 페이지 가로 overflow는 없습니다. compact 탭은 가로 스크롤을 제공합니다.
- 기존 Card / Field / Empty / Progress / SegmentedControl / 버튼 스타일을 재사용합니다. native modal dialog의 focus·Escape·배경 차단을 사용하고 닫을 때 이전 focus를 복원합니다.
- reduced-motion 설정을 지원하며 교사 CSS로 범위를 제한했습니다.

## 9. 추가 스키마

새 테이블과 학생 AppData 변경은 없습니다.

```sql
ALTER TABLE teacher_feedback ADD COLUMN signal_json TEXT;
```

Signal의 id, studentId, title, summary, recommendedAction, successCriterion, createdAt은 기존 피드백의 id, student_id/student_user_id, title, observation/bottleneck, action, success_criterion, created_at을 재사용합니다.

```ts
type TeacherSignal = {
  sourceRole: 'subject_teacher' | 'academic_manager';
  targetRole: 'subject_teacher' | 'academic_manager';
  subject: Subject;
  priority: 'low' | 'medium' | 'high';
  type: 'diagnosis' | 'intervention' | 'reassessment_request' | 'execution_issue';
  evidenceRefs: string[];
  status: 'open' | 'accepted' | 'resolved' | 'dismissed';
  weeklyGoal?: {
    weekStart: string; subject: Subject; ability: string;
    successCriterion: string; drillDesign: string; evidence: string;
  };
  dailyDrill?: {
    date: string; subject: Subject; title: string; action: string;
    successCriterion: string; minutes: number; capabilityGoalId?: string;
  };
};
```

기존 행의 signal_json은 NULL이며 기존 피드백으로 계속 동작합니다. access는 권한에서 파생되는 API 메타데이터이며 학생 저장 데이터가 아닙니다.

운영 적용 순서는 **0010 D1 마이그레이션 → Worker 배포 → 프런트 배포**입니다. 이 작업의 검증은 격리된 DB에서 수행했습니다. 운영 DB 변경과 운영 배포는 별도 적용 단계입니다.

## 10. 테스트한 시나리오

- npm run build: TypeScript와 Vite 프로덕션 빌드 성공.
- npm test: 기존 회귀 검사와 추가 검사 63개 통과.
- 현재 Wrangler 설정으로 생성한 Cloudflare 런타임 타입을 사용한 Worker TypeScript 검사 통과.
- Wrangler deploy --dry-run 패키징 성공. 실제 업로드는 수행하지 않습니다.
- 실제 Worker 핸들러와 격리 SQLite DB를 HTTP로 연결한 headless Edge 브라우저 검증:
  - A: 로그인 → 학생 선택 → 수학 병목 → 관련 오답 → Inspector → 진단 → 학습 교사 Signal.
  - B: 학습 교사 로그인 → Signal → 목표·Drill prefill → 최종 확인 → 초안 전달.
  - C: 학습량 증가·Drill 완료·성과 정체 → 과목 재진단 요청.
  - D: 수학 교사 수신 → 관련 학습 근거 확인 → 새로운 intervention.
  - Inspector 직접 목표 제안: prefill, 취소 시 저장 없음, 확인 시 Signal 초안 저장.
  - 학생의 최종 목표·Drill 생성, 연결 ID, 원래 Sync 저장.
  - 모든 교사 탭과 Inspector의 5개 화면 폭.
  - 빈 데이터, loading, 의도적 503 error, retry, 학생 전환.
  - 기존 학생 Today / Calendar / Weekly / Timer / Drill / Wrong Answer / Resource / Score / Insights / Trinity Review / Workspace 진입.
  - 정상 흐름의 browser console/page error 0건. 주입한 503은 error/retry 검증으로 구분합니다.
- 서버 회귀 테스트: 과목 밖 근거 차단, 위조 발신 역할 방지, 다른 학생 차단, 부모 제한, 배정 해제, 학생 원본 불변, 초안 감사 기록, 주간 목표 기간 겹침.
- 실제 TSX 렌더링: 역할별 IA 분리, active Signal 우선순위, 권한 없음과 0건 구분.

재현:

```sh
npm ci
npm run build
npm test
npm install --prefix .teacher-test-tools --no-save --package-lock=false playwright
node --experimental-transform-types tests/teacher-browser.mjs
```

브라우저 검증은 Windows의 설치된 Edge를 사용합니다. 테스트 도구와 스크린샷은 gitignore에 포함되어 있습니다.

Worker 검증은 [Cloudflare TypeScript 문서](https://developers.cloudflare.com/workers/languages/typescript/)와 프로젝트에 설치된 Wrangler help를 확인했습니다. 감사 스냅샷과 Signal 갱신은 [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)를 사용합니다.

## 11. 남아 있는 기술 부채 / 개선 가능 항목

- 현재 모델에 독립적인 능력 평가 수치·문항별 정답률·Drill 성공 판정·점수 난도 보정이 없어 임의 계산을 하지 않습니다.
- 시간 없는 계획은 시간 실행률과 effort 분류가 불가능합니다. 계획의 구조화된 시간 입력은 향후 개선할 수 있습니다.
- 학년은 현재 협업 API에 제공되지 않아 임의 표시하지 않습니다.
- 긴 기록은 서버 기간 조회·pagination을 도입해 전송량을 줄일 수 있습니다. 현재는 부분 기록이 전체 기간 지표로 오인되지 않도록 기존 목록 잘림을 제거했고, 화면 집계는 memoization합니다.
- 과목 분류가 없는 Plaire와 수학 외 과목 전용 capability 축은 추가 데이터 모델 검토가 필요합니다.
- 학생 목표·Drill 연결은 기존 feedback apply → local update → auto Sync 구조를 유지합니다. Sync 전에 브라우저가 닫히는 경우의 연결 원자성은 후속 개선 항목입니다.
- 여러 교사가 동시에 같은 Signal 초안을 수정할 때의 version 충돌 보호와 stale diagnosis 알림을 개선할 수 있습니다.
- 실제 Cloudflare 원격 D1·운영 계정·기기 실물 테스트는 배포 단계에서 확인해야 합니다. 이번에는 실제 핸들러 + SQLite + Edge와 Worker 타입/패키징을 검증했습니다.
- 기존 Worker lockfile 의존성 설치 audit에 high 3건이 있습니다. 이번 UI 작업에서 강제 업그레이드를 적용하지 않았으며 별도 검토가 필요합니다.
