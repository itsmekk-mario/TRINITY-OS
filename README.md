# TRINITY OS

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

배포된 Worker URL과 `SYNC_TOKEN` 값을 앱의 `데이터 및 설정 → Cloudflare 동기화`에 입력합니다. Worker는 `GET /api/sync`, `PUT /api/sync`, `GET /api/health`를 제공하며, 허용된 출처는 `wrangler.toml`의 `ALLOWED_ORIGIN`으로 제한됩니다.

브라우저 데이터는 앱의 **데이터 및 설정 → 데이터 백업**으로 주기적으로 JSON 파일로 보관하세요. `resources.json`을 나중에 수정해도 이미 사용 중인 브라우저의 자료 데이터는 유지됩니다. 초기화하려면 해당 사이트의 브라우저 저장 데이터를 삭제한 뒤 다시 실행합니다.

## GitHub Pages 배포

1. 이 폴더를 GitHub 저장소의 `main` 브랜치에 올립니다.
2. 저장소 **Settings → Pages → Source**를 **GitHub Actions**로 선택합니다.
3. 이후 `main`에 push할 때마다 `.github/workflows/deploy.yml`이 자동 빌드·배포합니다.

`vite.config.ts`가 상대 경로(`base: './'`)를 사용하므로 사용자/프로젝트 Pages 모두 지원합니다.
