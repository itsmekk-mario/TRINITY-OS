#!/usr/bin/env bash
set -euo pipefail
node scripts/apply-library-actions-patch-v2.mjs
npm run build

echo
echo "===== 적용 확인 ====="
grep -n "downloadResourcePdf" src/pages/ResourceLibrary.tsx
grep -n "deleteResource" src/pages/ResourceLibrary.tsx
grep -n "library-delete-button" src/pages/ResourceLibrary.tsx
git status --short
