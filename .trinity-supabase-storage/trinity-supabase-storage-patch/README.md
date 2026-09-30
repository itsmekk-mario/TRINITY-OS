# TRINITY OS — Handwriting Notes + Supabase Storage Wrong-Answer Photos

이 패치는 **기존 base64 사진 패치 대신** 최신 `main`에 바로 적용하는 통합본입니다.

## 구조

- 손글씨 노트: AppData에 벡터 stroke JSON 저장
- 문제 사진: 브라우저에서 JPEG 900KB 이하로 압축
- 업로드: TRINITY Cloudflare Worker 인증 → Supabase Storage service_role 프록시
- Storage bucket: `trinity-problem-images` (private)
- AppData / D1 / Backup에는 실제 사진 bytes가 아니라 아래 메타데이터만 저장
  - provider
  - bucket
  - path
  - name / mime / width / height / size / createdAt
- 사진 조회도 브라우저가 Supabase service key를 보지 않고 Worker의 로그인 세션을 통해 수행
- 사진 교체/오답 삭제 시 AppData 동기화 뒤 기존 Storage object 삭제

## 이미 설정된 Supabase

Project ref: `yygaqttkjuigoczxhcgj`
Project URL: `https://yygaqttkjuigoczxhcgj.supabase.co`
Bucket: `trinity-problem-images`

현재 bucket은 이미 생성되어 있으며 다음 설정입니다.

- public: false
- file size limit: 2 MiB
- MIME: image/jpeg

`supabase-storage.sql`은 재현/복구용입니다.

## Codespaces 적용

```bash
cd /workspaces/TRINITY-OS
git pull origin main

# 이 ZIP을 repo 루트에 업로드했다고 가정
unzip -o TRINITY-OS-handwriting-supabase-storage.zip -d .trinity-supabase-storage
node .trinity-supabase-storage/apply-trinity-supabase-storage.mjs

npm install
npm run build
npm test
```

> 예전 `TRINITY-OS-handwriting-photo-patch.zip`을 먼저 적용하지 마세요. 이 파일이 그 패치를 대체합니다.

## Worker secret 설정

Supabase의 server-side **Secret key (`sb_secret_...`)** 를 Worker secret으로 넣습니다. 이 키는 절대로 프론트 코드나 Git에 넣지 않습니다.

```bash
cd /workspaces/TRINITY-OS/worker
npx wrangler secret put SUPABASE_SECRET_KEY
```

프롬프트가 뜨면 Supabase Dashboard → API Keys의 Secret key 값을 붙여넣습니다.

확인:

```bash
npx wrangler secret list
```

`SUPABASE_SECRET_KEY` 이름만 보이면 됩니다. 값 자체는 출력할 필요가 없습니다.

기존 legacy `service_role` JWT를 이미 쓰고 있다면 `SUPABASE_SERVICE_ROLE_KEY`도 하위 호환으로 지원합니다. 새 설정은 `SUPABASE_SECRET_KEY`를 권장합니다.

## Worker 배포

이번 버전은 Worker API가 추가되므로 **Worker 재배포가 필요합니다.**

```bash
cd /workspaces/TRINITY-OS/worker
npx wrangler deploy
```

그 다음 프론트 배포/푸시:

```bash
cd /workspaces/TRINITY-OS
git status
git add src worker
git commit -m "feat: store wrong-answer photos in Supabase Storage"
git push origin main
```

## 확인 순서

1. Train → Notes 탭에서 손글씨 노트 저장
2. Train → Drill → 오답 Drill에서 문제 사진 선택
3. 저장 후 Wrong Answers에서 썸네일 확인
4. 페이지 새로고침 후 사진이 다시 표시되는지 확인
5. Supabase Storage → `trinity-problem-images`에 `<TRINITY user id>/<date>/<random>.jpg`가 생성됐는지 확인
6. 기존 문제 사진 교체 후 이전 object가 사라지는지 확인
7. 오답 삭제 후 연결된 object가 삭제되는지 확인
8. 전체 Backup JSON에 `data:image/...`가 들어가지 않고 `problemImage.path`만 들어가는지 확인

## 보안 설계

- bucket은 private입니다.
- 브라우저에는 Supabase service-role/secret key를 노출하지 않습니다.
- TRINITY Worker가 기존 사용자 세션을 검증한 후에만 업로드/조회/삭제합니다.
- object path 첫 디렉터리는 TRINITY `user.id`이고 Worker가 자신의 경로만 읽고 지우도록 검증합니다.
- bucket 자체 RLS를 브라우저 클라이언트에 열지 않습니다. Storage 접근은 서버의 service_role만 사용합니다.
