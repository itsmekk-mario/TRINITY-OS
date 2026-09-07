# TRINITY OS 공유·무료 PDF 자료실·타이머·UI 정리 패치

이 ZIP은 첨부해 주신 TRINITY-OS-current-source.zip 기준의 변경 파일만 포함합니다.
NotionWorkspace, PlanningPage, ordering.css, 기존 DB ID, SYNC_TOKEN은 덮어쓰지 않습니다.
기존 LocalStorage와 학습 JSON을 초기화하지 않습니다.

## 1. 백업과 최신 커밋 확인

태블릿에서 최신 기록을 확인한 뒤 앱의 '데이터 백업'으로 JSON을 보관하세요.
Cloudflare 저장도 완료하세요. 선생님·학부모는 서버에 마지막으로 저장된 자료를 봅니다.
사이트 데이터 전체 삭제는 하지 마세요. 동기화하지 않은 로컬 기록도 사라질 수 있습니다.

Codespaces에서:

```bash
cd /workspaces/TRINITY-OS
git status --short
```

출력에 수정된 소스가 있으면 먼저 별도로 커밋/백업하고 다음으로 넘어가세요.
tsconfig.app.tsbuildinfo만 변경된 경우 아래로 빌드 캐시 변경을 보관할 수 있습니다.

```bash
git stash push -m "preserve build cache before support patch" -- tsconfig.app.tsbuildinfo
git pull --ff-only origin main
```

pull이 실패하면 적용을 멈추세요. force push/reset을 하지 마세요.
이 ZIP을 GitHub 웹에 올렸다면 pull 이후 Codespaces에도 ZIP이 생깁니다.
Codespaces에 직접 올린 경우에는 업로드 경로가 프로젝트 최상단인지 확인하세요.

```bash
unzip -o TRINITY-OS-ui-polish-free-pdf.zip
npm run build
```

오류가 있으면 다음 단계로 넘어가지 말고 오류 문구를 확인하세요.

## 2. 무료 PDF 폴더 설정

R2는 사용하지 않습니다. PDF는 GitHub Pages가 함께 배포하는 `public/exams/` 아래에 둡니다.
예를 들어 실제 파일 위치가 `public/exams/2026/kice/math.pdf`라면 앱 등록 화면에는
`2026/kice/math.pdf`만 입력합니다. 경로의 대소문자와 폴더 이름이 실제 파일과 같아야 합니다.

자료는 자신이 이용·공유할 권한이 있는 PDF만 올리세요. 이 방식의 PDF 파일은 공개 정적 파일입니다.
주소를 아는 사람은 앱에 로그인하지 않아도 열 수 있으므로 개인 기록·비공개 자료는 올리지 마세요.

이전에 `worker/wrangler.toml`에 아래 R2 블록을 직접 추가했다면 그 블록만 제거할 수 있습니다.
기존 D1 블록과 `database_id`는 수정하지 마세요.

```toml
[[r2_buckets]]
binding = "EXAM_PDFS"
bucket_name = "trinity-exam-pdfs"
```

R2 블록이 없다면 아무것도 수정하지 않습니다.

## 3. D1 테이블 추가 → Worker 배포

사용 중인 DB가 trinity-os-db인지 wrangler.toml에서 확인하세요.
운영 DB 백업을 별도로 보관한 뒤 진행하세요. 아래 마이그레이션은 새 테이블만 추가하며
기존 users/sessions/learning_state를 변경하거나 삭제하지 않습니다.

```bash
npx wrangler d1 execute trinity-os-db --remote --config worker/wrangler.toml --file worker/migrations/0001_support_portal.sql
npx wrangler deploy --config worker/wrangler.toml
```

첫 명령 성공 후에만 배포하세요. 이 SQL은 동일한 파일을 다시 실행해도 기존 테이블을 지우지 않습니다.
새 로그인용 Cloudflare API 키는 필요 없습니다. 기존 배포 자격증명을 사용하고 선생님·학부모에게는 전달하지 마세요.
Worker의 ALLOWED_ORIGIN은 기존 프런트 주소를 유지하세요.

## 4. 프런트 반영

빌드와 Worker 배포가 성공하면:

```bash
git add src/App.tsx src/types.ts src/styles.css src/team.css src/ui-polish.css src/components/LoginPage.tsx src/lib/useStudyClock.ts src/lib/studyTotals.ts src/pages/DailyDrillPanel.tsx src/pages/WeeklyDrill.tsx src/pages/Dashboard.tsx src/pages/TimerPage.tsx src/pages/Statistics.tsx src/pages/StudyRhythm.tsx src/pages/SupportPortal.tsx public/sw.js public/exams/README.md worker/src/index.ts worker/src/support.ts worker/migrations/0001_support_portal.sql tests/support.test.mjs SUPPORT-STUDY-INSTALL.md
git commit -m "Polish TRINITY OS UI and use free PDF storage"
git push origin main
```

push가 거절되면 force push하지 말고 먼저 git status를 확인하세요.
빌드 캐시 변경만 남아 있다면 1번처럼 해당 파일만 stash한 뒤 git pull --rebase origin main을 실행합니다.
충돌이 있으면 멈추고 확인하세요. 성공한 경우 git push origin main을 다시 실행합니다.

GitHub Pages 배포가 완료된 뒤 앱을 새로고침하세요.
계속 이전 화면이면 모든 TRINITY 탭/홈 화면 앱을 종료하고 다시 열어보세요.
이번 서비스 워커는 HTML을 네트워크 우선으로 읽고 인증/API/PDF 응답을 캐시하지 않습니다.
이전 서비스 워커가 계속 제어한다면 개발자 도구에서 Service Worker만 Unregister 후 다시 여세요.
LocalStorage, IndexedDB 또는 사이트 전체 데이터를 지우지 마세요.

## 사용

- Daily Drill / 주간 능력 목표 / 오답 Drill의 '수정'에서 기존 내용을 고칩니다.
  ID, 완료 여부, 연결 관계, 오답 재도전 기록을 유지합니다. 취소 시 저장하지 않습니다.
  기존 오답의 날짜를 수정해도 이미 설정된 재도전 일정은 자동 재계산하지 않습니다.
- Review Hub는 메뉴와 Dashboard 유도 카드에서 제거했습니다. 예전 기록은 백업에 그대로 남습니다.
- '공유 관리'에서 수학 선생님 또는 학부모 계정을 생성합니다. 전용 비밀번호는 12자 이상입니다.
  학생이 계정을 만들어 해당 사람에게 직접 전달하는 방식입니다. 공개 회원가입이나 API 키 배포는 없습니다.
- 선생님 로그인: 기존 사이트 주소 뒤에 ?portal=tutor
- 학부모 로그인: 기존 사이트 주소 뒤에 ?portal=parent
- 학생 로그인 화면에도 두 전용 로그인 링크가 있습니다.
- '접근 차단'은 해당 계정의 모든 기존 세션 접근도 차단합니다. 차단한 계정명은 재사용하지 않습니다.
  비밀번호를 잊었다면 기존 계정을 차단하고 새 아이디로 계정을 만드세요.
- 선생님은 수학 계획·목표·교재·타이머·실모 수학 분석·오답·Drill·기존 수학 Trinity 기록을 봅니다.
  여러 과목이 섞인 저널/Plaire/Notion/실모 총평은 자동 공유하지 않습니다.
- 학부모는 전 과목 진도·목표·학습량·점수를 보고 평가를 남길 수 있습니다.
  개인 메모나 선생님 댓글은 자동 공유하지 않습니다.
- 선생님/학부모 의견은 '대상 기록·주차'를 적는 자유 첨언 방식이며 학생의 원본 기록을 수정하지 않습니다.
  학생은 공유 관리에서 모든 의견을 봅니다. 작성자는 본인이 작성한 의견만 봅니다.
- 선생님과 학부모는 별도 브라우저/기기에서 이용하세요. 학생 로그인 상태인 공용 브라우저를 공유하지 마세요.
- PDF: `public/exams/` 아래에 PDF 업로드 → 커밋·push → GitHub Pages 배포 완료 → '기출 PDF'의 등록 양식에 시험명·기관·연도·과목·상대 경로 입력.
  예: title=2026 6월 모의평가, agency=평가원, year=2026, subject=수학, object_key=2026/kice/math.pdf
  파일 경로는 대소문자/폴더까지 실제 값과 일치해야 합니다. 배포 전에 목록만 등록하면 파일 없음 오류가 표시됩니다.
  열기 후 앱 내 PDF 또는 새 탭을 선택합니다. 선생님은 수학 PDF만, 학부모는 자료실 접근 불가입니다.
  목록 권한은 유지되지만 정적 PDF 자체는 공개입니다.
- 타이머: 시작=집중, 일시정지=휴식, 계속=집중 재개, 정지·저장=통계 반영.
  화면을 닫아도 측정은 이어지므로 실제 쉬기 전 일시정지를 누르세요.
  '집중 저하 지금 표시'는 자가 기록이며 집중력 진단이 아닙니다.
  타이머는 한 기기·한 탭에서만 사용하세요. 여러 기기의 동시 타이머 병합은 지원하지 않습니다.
- Statistics에서 주를 바꾸며 집중/휴식 히트맵, 첫 집중/마지막 집중 종료, 최장 연속 집중,
  집중 저하 직접 표시 시각을 확인합니다. 기기 시간대 기준이며 자정을 넘은 집중은 날짜별로 나눕니다.
  기존 기록과 수동 보정은 시간대가 없으면 총량에만 포함하고 히트맵에는 넣지 않습니다.
  선생님·학부모 화면도 최신 기록을 자동 추측하지 않으며 새로고침으로 서버 자료를 다시 읽습니다.

## 검증 범위

프런트 TypeScript 검사와 Vite 프로덕션 빌드를 통과했습니다.
SQLite 기반 테스트에서 추가형 마이그레이션, 사적 필드 제외, 원본 동기화 API 접근 거부,
역할별 PDF 목록 권한·안전한 상대 경로 변환, 댓글 분리, 접근 차단/로그아웃, 자정 분할과 휴식 제외를 확인했습니다.
테스트 실행은 Node.js 24 이상에서 node tests/support.test.mjs 입니다.
실제 Cloudflare 배포, 실제 GitHub Pages PDF, iPad/데스크톱 브라우저 조작 테스트는 여기서 수행하지 않았습니다.

기존 인증과 DB 테이블은 유지하며 새로운 공개 SaaS 다학생 시스템으로 변경하지 않습니다.
