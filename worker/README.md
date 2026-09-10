# TRINITY OS Cloudflare Worker

## 1. D1 연결

Cloudflare Dashboard에서 D1 데이터베이스를 만든 뒤 `wrangler.toml`의 `database_id`를 입력합니다.

```bash
npm install
npx wrangler d1 execute trinity-os-db --remote --file=./schema.sql
npx wrangler secret put SYNC_TOKEN
npm run deploy
```

`SYNC_TOKEN` 입력값은 프론트엔드 설정 화면에서 사용할 개인용 동기화 토큰입니다. 토큰을 Git에 커밋하지 마세요.

배포 후 Worker 주소 예시:

```text
https://trinity-os-sync.<your-subdomain>.workers.dev
```

이 주소와 토큰을 TRINITY OS의 `데이터 및 설정 → Cloudflare 동기화`에 입력합니다.
# AI 학습 코치 설정

AI 학습 코치는 Worker에서만 NVIDIA NIM을 호출합니다. API 키를 `wrangler.toml` 또는 프론트엔드 환경변수에 넣지 마세요.

```powershell
cd worker
npx wrangler secret put NVIDIA_API_KEY --config wrangler.toml
npx wrangler deploy --config wrangler.toml
```

사용자 브라우저에는 기존 Cloudflare Worker URL과 로그인 세션만 있어야 합니다. `/api/ai/daily-coach`, `/api/ai/chat`은 둘 다 로그인 세션이 있어야 호출할 수 있습니다.
