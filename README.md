# TRINITY OS

PDF 업로드는 [PDF-UPLOAD-GUIDE.md](PDF-UPLOAD-GUIDE.md)를 참고하세요.

> Personal Learning Operating System · 盡人事待天命

정시 수험 준비의 `계획 → 실행 → 기록 → 오류 분석 → 행동 수정 → 체화` 사이클을 한 기기에서 운영하는 React 기반 정적 PWA입니다. 모든 기록은 LocalStorage에만 저장되며 API 키나 서버가 필요하지 않습니다.

## 프로젝트 구조

```text
TRINITY-OS/
├─ .github/workflows/deploy.yml   # GitHub Pages 자동 배포
├─ public/
│  ├─ manifest.json               # PWA 설정
│  ├─ sw.js                       # 오프라인 캐시
│  ├─ favicon.svg
│  └─ icon-192.png, icon-512.png
├─ src/
│  ├─ components/Ui.tsx           # 공통 카드·필드·진행률 UI
│  ├─ data/                        # 직접 수정하는 초기 기준 데이터
│  │  ├─ config.ts                # 수능일, 과목, 오류 유형
│  │  ├─ goals.json               # 주간 목표
│  │  ├─ quotes.json              # 오늘의 문장
│  │  ├─ resources.json           # 보유 자료
│  │  └─ routine.json             # 고정 루틴
│  ├─ lib/
│  │  ├─ date.ts                  # 날짜·시간 유틸리티
│  │  └─ storage.ts               # 저장·백업·복원 계층
│  ├─ pages/                       # 10개 독립 화면
│  ├─ App.tsx                     # 앱 셸과 내비게이션
│  ├─ styles.css                  # 디자인 시스템·반응형
│  └─ types.ts                    # 확장 가능한 데이터 타입
├─ index.html
├─ vite.config.ts
└─ package.json
```

## 실행

```bash
npm install
npm run dev
```

프로덕션 정적 파일은 `npm run build` 후 `dist/`에 생성됩니다.

## 앱에서 바로 수정하는 항목

- Dashboard: 주간 목표 추가·완료·삭제
- Daily Routine: 루틴 추가·삭제
- Resource Database: 자료 추가·진행률 변경·삭제
- 데이터 및 설정: 수능일·오늘의 문장·백업·복원
- 나머지 화면: 날짜별 학습 기록을 입력·저장

`src/data/`의 JSON 파일은 첫 실행 때 사용할 기본값입니다. 평소에는 코드를 열지 않아도 됩니다.

## Google Drive 자동 동기화

앱의 `데이터 및 설정 → Google Drive 동기화`에서 Google OAuth 웹 Client ID를 입력하면, Drive의 전용 앱 데이터 영역에 `trinity-os-sync.json`이 생성됩니다. 각 기기에서 같은 Client ID와 Google 계정으로 연결하면 로컬 기록과 Drive 기록을 ID 기준으로 병합합니다.

설정 순서:

1. Google Cloud Console에서 프로젝트를 만들고 Google Drive API를 활성화합니다.
2. OAuth consent screen을 설정합니다.
3. OAuth Client ID를 `Web application` 유형으로 생성합니다.
4. Authorized JavaScript origins에 `https://trinityos.mcv.kr`을 추가합니다.
5. Client ID(비밀키가 아님)를 앱 설정에 입력합니다.

토큰은 브라우저 메모리에만 두며, 앱은 Drive의 `appDataFolder`에만 접근합니다. Google 연결이 끊기면 기존 LocalStorage 기록은 그대로 유지됩니다. 여러 기기에서 동시에 수정한 경우 ID가 같은 항목은 마지막으로 병합된 값이 사용됩니다.

## Cloudflare Workers + D1 동기화

`worker/` 폴더에 개인용 Worker API와 D1 스키마가 포함되어 있습니다. Cloudflare Dashboard에서 D1을 만들고 `worker/wrangler.toml`의 `database_id`를 채운 뒤 다음을 실행합니다.

```bash
cd worker
npm install
npx wrangler d1 execute trinity-os-db --remote --file=./schema.sql
npx wrangler secret put SYNC_TOKEN
npm run deploy
```

배포된 앱은 로그인 세션으로 Worker와 동기화합니다. `SYNC_TOKEN`은 학생에게 전달하거나 브라우저에 입력하는 값이 아니라, 신규 계정을 만드는 관리자 전용 Worker secret입니다. Worker는 `GET /api/sync`, `PUT /api/sync`, `GET /api/health`를 제공하며, 허용된 출처는 `wrangler.toml`의 `ALLOWED_ORIGIN`으로 제한됩니다.

브라우저 데이터는 앱의 **데이터 및 설정 → 데이터 백업**으로 주기적으로 JSON 파일로 보관하세요. `resources.json`을 나중에 수정해도 이미 사용 중인 브라우저의 자료 데이터는 유지됩니다. 초기화하려면 해당 사이트의 브라우저 저장 데이터를 삭제한 뒤 다시 실행합니다.

## GitHub Pages 배포

1. 이 폴더를 GitHub 저장소의 `main` 브랜치에 올립니다.
2. 저장소 **Settings → Pages → Source**를 **GitHub Actions**로 선택합니다.
3. 이후 `main`에 push할 때마다 `.github/workflows/deploy.yml`이 자동 빌드·배포합니다.

`vite.config.ts`가 상대 경로(`base: './'`)를 사용하므로 사용자/프로젝트 Pages 모두 지원합니다.

## 신규 사용자 가입 방법

현재 공개 회원가입은 열어 두지 않았습니다. 새 학생은 관리자에게 아이디를 요청하고, 관리자가 계정을 만든 뒤 로그인 정보를 안전한 채널로 전달합니다. 학생에게 Cloudflare API 토큰이나 `SYNC_TOKEN`을 요구하지 않습니다.

관리자는 PowerShell에서 다음 명령을 실행합니다. 비밀번호와 `SYNC_TOKEN`은 화면에 표시되지 않습니다.

```powershell
$workerUrl = 'https://trinity-os-sync.khk090525.workers.dev'
$setupSecret = Read-Host '관리자 SYNC_TOKEN' -AsSecureString
$setupToken = [Net.NetworkCredential]::new('', $setupSecret).Password
$student = Get-Credential -Message '신규 학생 아이디와 사용할 비밀번호를 입력하세요'
$body = @{
  username = $student.UserName
  password = $student.GetNetworkCredential().Password
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri "$workerUrl/api/admin/students" `
  -Headers @{ 'X-Setup-Token' = $setupToken } `
  -ContentType 'application/json' `
  -Body $body

Remove-Variable setupToken, setupSecret, student, body
```

계정 생성 후 학생은 [TRINITY OS](https://trinityos.mcv.kr)에서 **학생 로그인**을 선택하고 발급받은 아이디와 초기 비밀번호로 로그인합니다. 운영 앱에는 Worker 주소가 자동으로 연결되므로 학생이 서버 주소나 API 토큰을 입력할 필요가 없습니다. 신규 계정은 첫 로그인 직후 본인만 아는 새 비밀번호로 반드시 변경해야 하며, 이후에도 **데이터 및 설정 → 비밀번호 변경**에서 다시 변경할 수 있습니다. 아이디는 영문·숫자·마침표·밑줄·하이픈으로 3~40자, 비밀번호는 8자 이상이어야 합니다. 같은 아이디가 이미 있으면 새 계정을 만들지 않고 `409` 오류를 반환합니다.

## 다중 사용자 데이터 분리와 개인 API 토큰

각 로그인 계정은 별도 D1 학습 데이터에 연결됩니다. 자동화 연동용 `trinity_pat_...` 개인 토큰도 지원하지만 일반 학생 로그인에는 필요하지 않습니다. Cloudflare/D1 관리 토큰과 `SYNC_TOKEN`은 사용자에게 절대 전달하지 마세요. 기존 D1을 사용 중이라면 배포 전에 아래 마이그레이션을 한 번 실행해야 합니다.

```bash
cd worker
npx wrangler d1 execute trinity-os-db --remote --file=./migrations/0004_multi_user_api_tokens.sql --config wrangler.toml
```

자동화용 개인 토큰 발급·폐기 방법은 [worker/README.md](worker/README.md)를 참고하세요.
