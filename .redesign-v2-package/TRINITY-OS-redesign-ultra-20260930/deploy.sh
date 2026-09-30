#!/usr/bin/env bash
set -euo pipefail
WITH_WORKER=0
[[ "${1:-}" == "--with-worker" ]] && WITH_WORKER=1
[[ -f package.json && -f wrangler.jsonc ]] || { echo "Run from TRINITY-OS repository root." >&2; exit 1; }
node scripts/validate-redesign-v2.mjs
npm run build
npx wrangler deploy
if [[ $WITH_WORKER -eq 1 ]]; then
  echo "Deploying API worker because --with-worker was explicitly supplied."
  (cd worker && npm ci && npx wrangler deploy)
else
  echo "Worker unchanged; skipped. Use: bash deploy.sh --with-worker only when worker code changed."
fi
