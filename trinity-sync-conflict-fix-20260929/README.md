# TRINITY OS — Sync Conflict / Data-loss Hotfix (2026-09-29)

이 패치는 오늘 발생한 `sessions + calendar(Weekly Plan)` 동시 소실 유형을 막기 위한 hotfix입니다.

## 바뀌는 핵심

1. 자동 동기화 기준점을 `localStorage`가 아니라 **탭별 `sessionStorage`**에 둡니다.
   - 오래 열린 stale 탭이 다른 탭의 최신 revision을 물려받아 서버를 덮어쓰는 문제를 차단합니다.
2. 자동 PUT에 `expectedUpdatedAt`을 보내는 **optimistic concurrency / compare-and-swap**을 적용합니다.
   - 서버 버전이 예상과 다르면 HTTP `409 Conflict`로 거부합니다.
3. 로컬과 서버가 동시에 바뀌면 자동으로 어느 한쪽을 덮지 않습니다.
4. 서버 데이터를 자동으로 내려받기 전 현재 로컬 AppData를 recovery copy로 저장합니다.
5. 수동 `이 기기 → 서버 저장`은 기존처럼 명시적 확인 후 force write로 유지합니다.
6. 회귀 테스트 2개를 추가합니다.

## Codespaces 적용

Repo root(`/workspaces/TRINITY-OS`)에서 이 ZIP을 풀었다고 가정:

```bash
cd /workspaces/TRINITY-OS
python3 /path/to/apply-sync-conflict-fix.py /workspaces/TRINITY-OS
npm test
npm run build
```

또는 패치 폴더 안에서:

```bash
bash apply-in-codespaces.sh /workspaces/TRINITY-OS
```

Worker 변경이 있으므로 반드시 배포:

```bash
cd /workspaces/TRINITY-OS/worker
npx wrangler deploy
```

그다음 repo root에서:

```bash
cd /workspaces/TRINITY-OS
git status
git add src/lib/cloudflare.ts src/App.tsx src/components/CloudflareSync.tsx worker/src/index.ts tests/security.test.mjs SYNC-CONFLICT-FIX-20260929.md
git commit -m "fix: prevent stale sync from overwriting study data"
git push origin main
```

## 적용 후 기대 동작

- 한 탭에서 새 데이터를 저장한 뒤 오래 열린 다른 탭이 stale AppData를 가지고 있어도 서버는 stale PUT을 `409`로 거부합니다.
- 양쪽이 동시에 변경되면 자동 동기화가 멈추고 기존 데이터는 유지됩니다.
- Settings의 Cloudflare 저장 UI에서 사용자가 어느 방향으로 복구할지 직접 선택할 수 있습니다.

## 롤백

적용 스크립트는 repo root 아래에 `.trinity-sync-conflict-backup-YYYYMMDD-HHMMSS/`를 자동 생성합니다. Git을 사용하는 경우에는 커밋 전 `git restore`로도 원복할 수 있습니다.
