# TRINITY OS — Mock Exam Edit Direct Overlay

이 ZIP은 패치 스크립트를 실행하지 않습니다.
저장소 루트에서 압축을 풀면 아래 파일이 직접 덮어써집니다.

- src/pages/ScoreTracker.tsx
- tests/mock-exam-edit.test.mjs

## 기능
- 기존 실모 분석 우측에 연필 수정 버튼 추가
- 기존 시험명/날짜/점수/시간/오답문항/객관화/개선방향/총평 불러오기
- 수정 저장 시 기존 ScoreEntry.id 유지
- Wrong Answer Drill의 scoreId 연결 유지
- 신규 작성과 수정 모드 분리

## Codespaces

```bash
git checkout main
git pull --ff-only origin main
unzip -o TRINITY-OS-mock-exam-edit-DIRECT-20260927.zip -d .
npm ci
npm test
npm run build
git diff -- src/pages/ScoreTracker.tsx tests/mock-exam-edit.test.mjs
git add src/pages/ScoreTracker.tsx tests/mock-exam-edit.test.mjs
git commit -m "feat: allow editing saved mock exam analyses"
git push origin main
```

Worker 변경은 없으므로 wrangler deploy는 필요 없습니다.
