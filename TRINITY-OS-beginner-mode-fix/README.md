# TRINITY OS 초보자 모드 수정

`src/App.tsx`와 새 파일 두 개를 수정하는 패치입니다.

적용 전에는 반드시 최신 `main` 상태여야 합니다. 이 폴더를 저장소 루트에 풀고 다음을 실행합니다.

```bash
bash TRINITY-OS-beginner-mode-fix/apply-in-codespaces.sh
```

완료 뒤 `npm run build`가 성공하면 아래 명령으로 올립니다.

```bash
git add src/App.tsx src/beginner.css src/beginner-mode-control.ts
git commit -m "feat: add working beginner mode"
git push origin main
```

초보자 모드는 설정의 **초보자용 화면**에서 켜고 끕니다. 켜면 Test와 고급 Utility 메뉴를 숨기고, 고급 화면을 보고 있었다면 Today로 이동합니다. 학습 데이터는 삭제하거나 변환하지 않습니다.
