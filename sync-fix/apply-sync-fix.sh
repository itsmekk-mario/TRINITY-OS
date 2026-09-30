#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"

if [ -z "$ROOT" ]; then
  echo "ERROR: TRINITY-OS git 저장소 안에서 실행하세요."
  exit 1
fi

cd "$ROOT"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERROR: 추적 중인 수정사항이 있습니다. commit 또는 stash 후 다시 실행하세요."
  git status --short
  exit 1
fi

echo "[1/5] 최신 main 가져오기"
git checkout main
git pull --ff-only origin main

echo "[2/5] 자동 동기화 bootstrap 패치 적용"
if grep -q "cloudflare-auto-sync-device" src/lib/cloudflare.ts; then
  echo "이미 device bootstrap 로직이 적용되어 있습니다. 패치를 건너뜁니다."
else
  git apply --check "$SCRIPT_DIR/trinity-auto-sync-bootstrap.patch"
  git apply "$SCRIPT_DIR/trinity-auto-sync-bootstrap.patch"
fi

echo "[3/5] TypeScript/Vite 빌드 확인"
if [ ! -d node_modules ]; then
  npm ci
fi
npm run build

echo "[4/5] 테스트 실행"
npm test

echo "[5/5] diff 검사"
git diff --check
git status --short

cat <<'EOF'

적용 완료.

핵심 변경:
- 활성 탭 CAS 기준점: sessionStorage 유지
- 새 탭 bootstrap 기준점: localStorage의 device baseline 사용
- 기존 stale-tab 덮어쓰기 방지(expectedUpdatedAt/409): 유지
- 9/29 이전 legacy baseline이 있으면 안전하게 1회 마이그레이션
- baseline이 정말 없는 새 기기는 최초 1회만 수동 동기화 방향 선택 필요

확인 후 커밋/푸시:
  git add src/lib/cloudflare.ts
  git commit -m "fix: bootstrap safe auto sync across new tabs"
  git push origin main
EOF
