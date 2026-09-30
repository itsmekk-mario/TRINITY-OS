# TRINITY OS Plan / Library / Calendar 패치

기준 main: `4d9d131bd25efe915da0068d32ec476f8d1cfa2c` (2026-09-30 최신 main을 clone한 뒤 pull --ff-only 확인).
첨부된 9월 11일 ZIP은 구버전임을 확인했고 구현 기준으로 사용하지 않았습니다.

## 변경

- Weekly Plan: 기존 weeklyCapabilityGoals를 주간 목표·성공 기준으로 재사용. 생성·수정·검증 상태 변경, 연결된 일별 계획 수 표시.
- Daily Plan: calendar[date].plans를 사용. 주간 목표와 자료 선택 연결. 기존 dailyDrills는 한 번만 이전하고 원본을 백업에 보존. 삭제한 일별 계획이 다시 나타나지 않도록 이전 ID 기록.
- Calendar/주간 표: Normal/BUMP/Mock/Review/Recovery/Exam/School/Off/Custom, 사용자 지정 이름, 색상. 월간 달력 badge.
- BUMP: 기한 지난 오답 재도전과 이전 날짜 미완료 계획 최대 10개를 확인 후 추가. 동일 원본 중복 생성 방지.
- Library: 기존 Resources에 공용/개인 자료실 추가. 자료명·시험 종류·학년도·월·문서 종류 필터, 관리자 공식 출처 링크 등록, 내 자료실 추가.
- 개인 PDF 20MB 이하 업로드 및 뷰어. 기존 Supabase 비공개 버킷 재사용. 서버에서 실제 버킷이 private인지 확인. 파일 열기/삭제 API는 파일 ID와 로그인 사용자 ID를 함께 조회.
- 자료의 학습 상태, 연결된 타이머 시간·첫/최근 날짜·오답 수·Archive/Core Rule 연결 수 표시.
- 자료에서 일별 계획과 오답 생성. 기존 Archive/Core Rule/실모 기록을 선택해 연결. Archive의 Core Rule 연결도 함께 가져옴.
- Timer에서 자료와 Daily Plan 선택, 세션에 관계 저장. 실행 중에는 관계 변경 불가.
- Journal은 Calendar reflection/study/event가 비어 있을 때 기존 내용을 보존 이전. 독립 Handwriting Notes는 Train 메뉴에서 숨기되 기존 접근·데이터를 보존.
- Plaire/구형 Trinity는 현재 주요 Hub에 독립 메뉴가 없어 데이터 모델을 삭제하지 않았음. Notes 단순화는 프롬프트에서 허용한 보류 범위를 적용.

## 서버 / 백업

새 계획 관계·날짜 라벨·자료 상태·자료 링크는 기존 사용자별 learning_state.payload와 Backup v2의 app 데이터에 포함됩니다. 별도 중복 Daily Plan 테이블은 만들지 않았습니다.
공용 카탈로그와 개인 PDF의 소유권 메타데이터는 D1 library_catalog/library_files에 저장됩니다. PDF 바이트는 기존 비공개 Storage에 있습니다.
백업 JSON에는 개인 PDF fileId를 포함하지만 PDF 파일 바이트와 전역 공용 카탈로그는 포함하지 않습니다. 기존 계정과 Storage를 유지하면 참조는 유지됩니다. 다른 계정으로 가져오면 원래 계정의 비공개 파일을 열 수 없습니다.

## Codespaces 적용

먼저 Settings에서 백업 JSON을 내려받고 변경사항이 없는 상태로 진행하세요. ZIP을 `/workspaces/TRINITY-OS/`에 업로드합니다.

```bash
cd /workspaces/TRINITY-OS
git fetch origin
git checkout main
git pull --ff-only origin main
git rev-parse HEAD
```

위 SHA가 기준 main과 다르면 전체 파일 덮어쓰기 때문에 새 커밋의 변경을 지울 수 있으므로 이 ZIP을 바로 덮어쓰지 마세요. 같은 기준 SHA이면:

```bash
unzip -o TRINITY-OS-plan-library-calendar-20260930.zip -d /workspaces/TRINITY-OS
git diff --stat
npm ci
npm run build
npm run dev -- --host 0.0.0.0
```

개발 화면은 Codespaces Ports에서 5173을 열어 확인합니다.

## D1 및 API Worker 배포

```bash
cd /workspaces/TRINITY-OS/worker
npm ci
npx wrangler d1 execute trinity-os-db --config wrangler.toml --remote --file=./migrations/20260930_library.sql
npx wrangler deploy --config wrangler.toml
```

SQL은 CREATE TABLE/INDEX IF NOT EXISTS로 재실행해도 기존 데이터를 지우지 않습니다. API도 새 테이블을 없을 때 생성하므로 누락된 초기화에 대응합니다.
**--config wrangler.toml을 생략하지 마세요.** 루트 wrangler.jsonc는 다른 정적 사이트 구성이며 API Worker 배포를 대신하지 않습니다.

기존 문제 사진 업로드가 정상이라면 같은 Worker Storage 설정을 사용합니다. 파일 업로드에 503이 뜨면 SUPABASE_URL, SUPABASE_BUCKET 및 서버 전용 SUPABASE_SECRET_KEY 또는 SUPABASE_SERVICE_ROLE_KEY를 확인하세요. 버킷은 비공개이며 PDF MIME과 필요한 파일 크기를 허용해야 합니다. 키를 프런트엔드나 Git에 넣지 마세요.

## 프런트엔드 배포

```bash
cd /workspaces/TRINITY-OS
git add src worker/src worker/migrations tests/plan-library.test.mjs TRINITY_PATCH_README.md TRINITY_PATCH_MANIFEST.txt
git commit -m "refactor plan library and calendar workflow"
git push origin main
```

기존 `.github/workflows/deploy.yml`이 GitHub Pages 프런트엔드를 빌드·배포합니다. push만으로 API Worker가 실배포되지는 않으므로 위 Worker 배포도 수행하세요.

## 검증 결과 / 남은 확인

- 프런트엔드 TypeScript + Vite production build 통과.
- API Worker `wrangler deploy --dry-run --config wrangler.toml` 통과.
- 신규 테스트 6개와 기존 Backup v1 테스트 통과: 인증·관리자 제한, 공식 출처 검증, 파일 소유권, public bucket 차단, 이전/백업 관계 보존, 삭제 항목 재생성 방지.
- 전체 테스트: 기준 main에서 11개 실패가 있고 패치에서도 동일 실패 목록. 해당 기존 실패를 이 패치가 해결했다는 의미는 아님.
- git diff --check 통과.
- 화면에는 반응형 CSS와 테마 상속 적용. 실제 브라우저/iPad 시각 검증은 브라우저 설치 다운로드 실패로 완료하지 못함.
- 실제 운영 Storage 업로드·기기 간 동기화·배포 후 새로고침 검증은 운영 인증 없이 실행하지 못함.

**공용 자료실은 기출 PDF 전체가 자동 채워진 상태가 아닙니다.** EBSi 공식 기출 디렉터리 링크를 제공하며 관리자가 공식 PDF/정답/해설 링크와 메타데이터를 등록하는 방식입니다. 링크 원본 PDF 뷰어는 공식 사이트에서 열리고 개인 업로드 PDF는 앱 안에서 열립니다. 선택과목 전용 필터, 모든 기출 자동 수집, Archive/Review 전체의 BUMP 자동 추천, Notes 전면 축소는 이번 ZIP에 포함되지 않습니다.

배포 후 확인: 주간 목표 생성 → 날짜별 목표/자료 연결 → BUMP 라벨 저장 → 새로고침 → 개인 PDF 업로드 → 자료 계획/오답 생성 → Timer 연결 저장 → 백업 내 관계 확인 → 다른 계정에서 해당 PDF 열기 거부.
