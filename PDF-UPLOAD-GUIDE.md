# 기출 PDF 업로드 안내

PDF는 GitHub 저장소가 아니라 Supabase의 비공개 `exam-pdfs` 버킷에 저장됩니다.
파일을 아는 사람도 링크만으로 열 수 없고, TRINITY OS의 권한 확인을 통과해야 합니다.

## 준비 확인

다음 Secret이 Cloudflare Worker `trinity-os-sync`에 등록돼 있어야 합니다.

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_BUCKET` = `exam-pdfs`

Secret 등록은 즉시 새 Worker 버전을 배포합니다. 등록 뒤 사이트가 최신 GitHub Pages 배포를
받을 때까지 잠시 기다리세요.

## 업로드 순서

1. [TRINITY OS](https://trinityos.mcv.kr)에 **학생 계정**으로 로그인합니다. Worker URL과
   학생 로그인 정보를 한 번 입력하면 브라우저에 관리자 세션이 저장됩니다.
2. 같은 브라우저에서 `https://trinityos.mcv.kr/?portal=owner`를 엽니다.
3. **기출 PDF 자료실 → PDF 업로드**를 펼칩니다.
4. 시험명, 기관, 연도, 과목을 입력합니다.
5. 저장 경로를 `.pdf` 확장자로 입력합니다. 예: `2026/kice/math-september.pdf`
   - `/`로 시작하거나 `..`을 포함하면 안 됩니다.
   - 같은 경로는 한 번만 사용할 수 있습니다.
6. PDF 파일을 선택하고 **PDF 등록**을 누릅니다.

업로드 가능한 파일은 PDF이며 최대 20 MB입니다. 성공하면 D1에는 시험 메타데이터가,
Supabase Storage에는 실제 PDF가 저장됩니다.

## 열람 권한

- 학생(관리자): 모든 등록 PDF 업로드·열람
- 수학 선생님: 수학 PDF만 열람
- 학부모: PDF 열람 불가

업로드가 실패하면 새로 만들어진 문서 항목도 자동으로 정리됩니다. 동일 경로로 다시
업로드해도 됩니다.
