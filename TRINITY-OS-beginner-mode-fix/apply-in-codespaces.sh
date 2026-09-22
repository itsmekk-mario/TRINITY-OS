#!/usr/bin/env bash
set -euo pipefail

for patch in patches/*.patch; do
  git apply --check "$patch"
done
for patch in patches/*.patch; do
  git apply "$patch"
done

npm run build
git status --short
