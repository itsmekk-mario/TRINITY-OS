# 오늘 중심 Statistics 패치

이 패치는 기존 기록을 삭제하지 않습니다.

- Statistics 첫 화면은 오늘입니다.
- 탭은 오늘, 30일, 3개월, 6개월, 12개월입니다.
- 캘린더의 학습한 날짜는 색 농도와 실제 시간(예: 2h, 45m)을 함께 표시합니다.

```bash
cd /workspaces/TRINITY-OS
git status --short
```

`tsconfig.app.tsbuildinfo`만 수정됐다면:

```bash
git stash push -m "build cache" -- tsconfig.app.tsbuildinfo
git pull --ff-only origin main
```

ZIP을 프로젝트 최상단에 올리고:

```bash
unzip -o TRINITY-OS-today-statistics.zip
npm run build
git restore tsconfig.app.tsbuildinfo
git add src TODAY-STATISTICS-INSTALL.md
git commit -m "Make statistics today-first"
git pull --rebase origin main
git push origin main
```

Worker 또는 D1 배포는 필요하지 않습니다.
