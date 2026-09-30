#!/usr/bin/env bash
set -euo pipefail
cd "${1:-$(pwd)}"

echo "== Auto-login source checks =="
grep -n 'SESSION_TTL_DAYS = "30"' worker/wrangler.toml
grep -n 'sessionTtlDays(env.SESSION_TTL_DAYS)' worker/src/support.ts
grep -n 'localStorage.setItem(key' src/components/LoginPage.tsx src/pages/CollaborativePortal.tsx src/pages/SupportPortal.tsx
grep -n '/api/support/logout' src/pages/CollaborativePortal.tsx src/pages/SupportPortal.tsx
grep -n '<b>로그아웃</b>' src/App.tsx
grep -n 'A network failure is not the same as an invalid session' src/lib/auth.ts

echo
echo "== Build =="
npm run build

echo
echo "== Tests =="
npm test

echo
echo "[OK] auto-login verification complete"
