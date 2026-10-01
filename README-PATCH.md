# TRINITY OS — PDF multi-page + Subject Color Palette patch

최신 `itsmekk-mario/TRINITY-OS` **main 브랜치(2026-10-01 확인)** 기준 적용용 패치입니다.

## 포함 내용

- iPad/iOS에서 `<iframe>` PDF가 1페이지만 보이는 문제를 피하기 위해 `pdfjs-dist` 기반 연속 세로 스크롤 PDF Viewer 추가
- 전체 `numPages` 렌더링, 현재 페이지/전체 페이지 표시
- 확대/축소/화면 너비 맞춤
- 화면 주변 페이지만 lazy render하여 iPad 메모리 사용량 억제
- 설정 → **과목 색상** 팔레트 추가
- 국어/수학/영어/통사/통과/탐구 및 사용자 추가 과목별 색상 저장
- 기존 `.subject-badge`, `.subject-dot`, `.subject-chip`, `.subject-pill`, `.subject-tag`에 전역 색상 적용
- AppData/자동 동기화/Backup v2에 `subjectColors`가 함께 저장됨

## 적용

이 ZIP의 내용을 TRINITY-OS 저장소 루트에 덮어쓴 뒤:

```bash
bash APPLY_PATCH.sh
```

또는:

```bash
node scripts/apply-pdf-subject-colors-patch.mjs
npm install
npm run build
```

패치 스크립트는 기존 `App.tsx`, `ResourceLibrary.tsx`, `types.ts`, `storage.ts`, `main.tsx`, `package.json`을 수정하기 전에 `.trinity-patch-backup-*` 폴더에 원본을 보관합니다. 최신 main과 구조가 다르면 기준점을 찾지 못했다는 오류를 내고 중단하도록 되어 있습니다.
