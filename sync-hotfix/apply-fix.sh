#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"

if [ -z "$ROOT" ]; then
  echo "ERROR: TRINITY-OS git 저장소 안에서 실행하세요."
  exit 1
fi

cd "$ROOT"

echo "[1/6] 추적 파일 변경 확인"
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERROR: 추적 중인 수정사항이 있습니다. commit/stash 후 다시 실행하세요."
  git status --short
  exit 1
fi

echo "[2/6] 최신 main 가져오기"
git checkout main
git pull --ff-only origin main

echo "[3/6] 수동 동기화 baseline 패치 적용"
if grep -q "rememberCloudflareSyncBaseline" src/components/CloudflareSync.tsx; then
  echo "이미 패치가 적용되어 있습니다."
else
  git apply --check "$SCRIPT_DIR/manual-sync-baseline.patch"
  git apply "$SCRIPT_DIR/manual-sync-baseline.patch"
fi

echo "[4/6] 빌드"
if [ ! -d node_modules ]; then
  npm ci
fi
npm run build

echo "[5/6] 테스트"
npm test

echo "[6/6] diff 검사"
git diff --check
git status --short

cat <<'EOF'

수정 완료.

이제 최초 수동 동기화에서:
- 이 기기 → 서버 저장: 서버가 반환한 updatedAt + 현재 로컬 상태를 baseline으로 저장
- 서버 → 이 기기로 가져오기: 서버 데이터 + 서버 updatedAt을 baseline으로 저장

따라서 최초 방향을 한 번 선택한 뒤 같은 경고가 반복되지 않아야 합니다.

커밋/푸시:
  git add src/lib/cloudflare.ts src/components/CloudflareSync.tsx
  git commit -m "fix: persist sync baseline after manual resolution"
  git push origin main
EOF
