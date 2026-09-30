#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-$(pwd)}"
if [[ "$(basename "$ROOT")" == "worker" ]]; then ROOT="$(dirname "$ROOT")"; fi
python3 "$(dirname "$0")/apply-sync-conflict-fix.py" "$ROOT"
cd "$ROOT"
npm test
npm run build
printf '\nPatch + test + build completed.\n'
printf 'Deploy Worker: cd worker && npx wrangler deploy\n'
printf 'Then commit/push the repo root.\n'
