#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
if [ ! -f "$ROOT/package.json" ] || [ ! -d "$ROOT/src/pages" ]; then
  echo "❌ TRINITY-OS 루트에서 실행해 주세요."
  echo "예: cd /workspaces/TRINITY-OS"
  exit 1
fi

PATCH_DIR="$(cd "$(dirname "$0")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$ROOT/.patch-backup-weekly-ui-$STAMP"
mkdir -p "$BACKUP_DIR/src/pages"
cp "$ROOT/src/pages/WeeklyGoals.tsx" "$BACKUP_DIR/src/pages/WeeklyGoals.tsx"
cp "$ROOT/src/main.tsx" "$BACKUP_DIR/src/main.tsx"

cp "$PATCH_DIR/src/pages/WeeklyGoals.tsx" "$ROOT/src/pages/WeeklyGoals.tsx"
cp "$PATCH_DIR/src/weekly-plan-polish.css" "$ROOT/src/weekly-plan-polish.css"

python3 - "$ROOT/src/main.tsx" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1])
s=p.read_text(encoding='utf-8-sig')
line="import './weekly-plan-polish.css';"
if line not in s:
    anchor="import './subject-system.css';"
    if anchor in s:
        s=s.replace(anchor, anchor+"\n"+line)
    else:
        anchor="import './trinity-ui-v3.css';"
        if anchor not in s:
            raise SystemExit("❌ main.tsx CSS import 위치를 찾지 못했습니다.")
        s=s.replace(anchor, anchor+"\n"+line)
p.write_text(s,encoding='utf-8')
PY

echo "✅ Weekly Plan Apple UI 적용 완료"
echo "백업: $BACKUP_DIR"
echo
npm run build

echo
echo "===== 변경 파일 ====="
git status --short

echo
echo "다음 단계:"
echo "git add -A"
echo "git commit -m 'ui: redesign weekly plan'"
echo "git push origin main"
