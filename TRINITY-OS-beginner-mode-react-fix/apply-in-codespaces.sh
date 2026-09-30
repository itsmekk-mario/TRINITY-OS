#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f package.json || ! -f src/App.tsx || ! -f src/team.css ]]; then
  echo "TRINITY OS 저장소 루트에서 실행해야 합니다."
  exit 1
fi

backup_dir=".trinity-beginner-mode-backup-$(date +%Y%m%d-%H%M%S)"
mkdir "$backup_dir"
cp src/App.tsx src/team.css "$backup_dir/"
cp TRINITY-OS-beginner-mode-react-fix/src/App.tsx src/App.tsx
cp TRINITY-OS-beginner-mode-react-fix/src/team.css src/team.css

npm ci
npm run build

echo
echo "초보자 모드 적용 완료: 설정 → 초보자용 화면에서 켤 수 있습니다."
echo "백업: $backup_dir"
git status --short
