#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f package.json || ! -f src/App.tsx ]]; then
  echo "Run from the TRINITY-OS repository root." >&2
  exit 1
fi
PATCH_DIR="${1:-$PWD/TRINITY-OS-redesign-ultra-20260930}"
if [[ ! -f "$PATCH_DIR/apply-redesign-v2.mjs" ]]; then
  echo "Patch directory not found: $PATCH_DIR" >&2
  echo "Usage: bash /path/to/TRINITY-OS-redesign-ultra-20260930/apply-build.sh /path/to/TRINITY-OS-redesign-ultra-20260930" >&2
  exit 1
fi

echo "[1/6] Fetch latest main"
git fetch origin main
git pull --ff-only origin main

echo "[2/6] Apply redesign"
node "$PATCH_DIR/apply-redesign-v2.mjs"
mkdir -p scripts
cp "$PATCH_DIR/scripts/validate-redesign-v2.mjs" scripts/validate-redesign-v2.mjs

echo "[3/6] Static validation"
node scripts/validate-redesign-v2.mjs

echo "[4/6] Install exact dependencies"
npm ci

echo "[5/6] TypeScript + Vite production build"
npm run build

echo "[6/6] Diff summary"
git diff --stat

echo
echo "Build passed. Review with: git diff"
echo "Deploy UI with: npx wrangler deploy"
