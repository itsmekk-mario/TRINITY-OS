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
