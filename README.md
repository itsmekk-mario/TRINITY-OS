# Library Delete / Download Patch V2

이 버전은 버튼 텍스트 전체를 정확히 일치시키는 방식이 아니라,
`openResourcePdf(active)` 핸들러를 기준으로 패치하므로 현재 main의
유니코드 표기 차이에도 적용됩니다.

## 적용

```bash
cd /workspaces/TRINITY-OS
unzip -o ./TRINITY-OS-LIBRARY-DELETE-DOWNLOAD-PATCH-V2.zip
bash ./APPLY_LIBRARY_ACTIONS_V2.sh
```

빌드 성공 후:

```bash
git add -A
git commit -m "feat: add library delete and download actions"
git push origin main
```
