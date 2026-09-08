# TRINITY OS 단순 통계 화면 패치

이 패치는 학습 기록을 삭제하지 않습니다.

- 기출 PDF·공유 관리 메뉴를 숨깁니다.
- 선생님·학부모 전용 주소도 앱에서 열리지 않게 합니다.
- 타이머의 '집중 저하 지금 표시' 버튼을 제거합니다.
- Statistics를 학습량 중심의 단순 통계 화면으로 바꿉니다.
- Worker와 D1 배포는 필요하지 않습니다.

## 적용

```bash
cd /workspaces/TRINITY-OS
git status --short
```

`tsconfig.app.tsbuildinfo`만 수정되었다면:

```bash
git stash push -m "build cache" -- tsconfig.app.tsbuildinfo
git pull --ff-only origin main
```

ZIP을 프로젝트 최상단에 올린 뒤:

```bash
unzip -o TRINITY-OS-simplified-statistics.zip
npm run build
git restore tsconfig.app.tsbuildinfo
git add src SIMPLIFIED-STATISTICS-INSTALL.md
git commit -m "Simplify statistics and hide optional portals"
git pull --rebase origin main
git push origin main
```

GitHub Pages 배포가 끝난 뒤 사이트를 새로고침하세요.
