#!/usr/bin/env bash
set -euo pipefail

# Run from the TRINITY-OS repository root after extracting this ZIP over it.
node scripts/apply-pdf-subject-colors-patch.mjs
npm install
npm run build
