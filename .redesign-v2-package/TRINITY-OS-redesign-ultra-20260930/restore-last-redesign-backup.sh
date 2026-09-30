#!/usr/bin/env bash
set -euo pipefail
ROOT="$(pwd)"
BASE="$ROOT/.trinity-redesign-backup"
[[ -d "$BASE" ]] || { echo "No redesign backup found." >&2; exit 1; }
LATEST="$(find "$BASE" -mindepth 1 -maxdepth 1 -type d | sort | tail -1)"
[[ -n "$LATEST" ]] || { echo "No backup snapshot found." >&2; exit 1; }
echo "Restoring: ${LATEST#$ROOT/}"
while IFS= read -r -d '' file; do
  rel="${file#$LATEST/}"
  mkdir -p "$(dirname "$ROOT/$rel")"
  cp "$file" "$ROOT/$rel"
done < <(find "$LATEST" -type f -print0)
rm -f src/trinity-redesign-v2.css
python3 - <<'PY'
from pathlib import Path
p=Path('src/main.tsx')
s=p.read_text()
s=s.replace("import './trinity-redesign-v2.css';\n",'')
p.write_text(s)
PY
echo "Restored backed-up files. Check git diff before committing."
