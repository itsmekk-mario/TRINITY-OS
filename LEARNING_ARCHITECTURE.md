# TRINITY OS 학습 정보 구조 개편

## 실행

Node.js 24 환경에서 저장소 루트의 `npm ci` 후 `npm run dev`를 실행합니다. 배포용 정적 파일은 `npm run build`로 `dist/`에 생성됩니다. Worker는 `worker/`에서 `npm ci` 후 `npx wrangler dev --config wrangler.toml`로 실행할 수 있습니다. 로컬 D1을 처음 만들 때는 같은 폴더에서 `npx wrangler d1 execute trinity-os-db --local --config wrangler.toml --file=schema.sql`을 실행합니다. 기존 D1에는 `migrations/0021_partial_review_results.sql`을 적용해야 부분 완료 복습 결과가 저장됩니다.

## 학생 화면

- 주 메뉴: Today, Plan, Study, Review, Library. Insights와 Study Room은 보조 메뉴, Settings는 계정 메뉴입니다.
- Plan: Week, Day, Calendar가 같은 Calendar Plan 데이터를 사용합니다. Day에는 Day Index, 우선순위, 목표와 자료 연결, 예정/진행 중/완료/일부 완료/실패 상태가 있습니다.
- Study: Timer, Drill, Notes. Timer에서 Daily Plan을 선택하면 시작 시 진행 중으로 바뀌고 종료 후 결과와 짧은 메모를 남길 수 있습니다.
- Review: Wrong Answer, Review Queue, Learning Archive, Core Rule. 빠른 오답 기록의 3·7·14일 재도전은 Review Queue에 나타나며 일부 완료도 기록합니다.
- Library: 기존 자료, PDF와 공용 기출, 학습 기록 연결을 보존합니다.
- Insights: Overview, Subject, Errors, Review, Progress, Feedback.
- 이전 경로는 새 화면으로 연결됩니다. `archive`, `resources`, `train`, `test`, `arena` 등의 북마크도 열립니다.

## 데이터와 배포

기존 AppData의 `calendar`, `sessions`, `resources`, `weeklyCapabilityGoals`, `wrongAnswerDrills`를 계속 사용합니다. Day Index의 아이콘과 설명, 계획의 우선순위와 상태는 선택 필드로 추가되어 이전 백업을 읽을 수 있습니다. Quick Capture와 이미지 메타데이터 저장에는 서버 버전 비교를 사용해 다른 기기의 변경을 덮어쓰지 않습니다. Worker의 기존 D1에 부분 완료 결과를 추가하려면 배포 전에 새 마이그레이션을 적용합니다.

배포용 ZIP에는 소스, 설정, Worker, 마이그레이션, 문서, 로컬 AI와 테스트를 포함하며 `node_modules`, 로컬 D1 상태, 빌드 산출물과 개인 설정은 포함하지 않습니다.
