# TRINITY OS — Learning Archive 사진 첨부 패치

기준: `main`의 `feat: add handwriting notes and Supabase wrong-answer image storage` 적용 이후.

## 기능

- Learning Archive Entry에 사진 최대 6장 첨부
- 문제, 지문, 도표, 해설, 풀이 흔적 등 다중 사진 저장
- 기존 문제 사진과 동일한 브라우저 JPEG 압축 사용
- 사진 binary는 Supabase private Storage에 저장
- Archive D1에는 `images_json` 메타데이터만 저장
- Entry 상세 `문항` 탭에서 사진 갤러리 표시
- Entry 수정 시 사진 추가/삭제 가능
- Entry 삭제 후 Storage 객체 정리
- Backup export/import에는 이미지 binary가 아니라 Storage reference 포함
- 기존 Wrong Answer 사진 경로와 하위 호환

## 적용

```bash
cd /workspaces/TRINITY-OS
git pull origin main
unzip -o TRINITY-OS-learning-archive-images.zip -d .trinity-archive-images
node .trinity-archive-images/apply-learning-archive-images.mjs
npm run build
npm test
```

## Worker 배포

Archive API와 D1 `images_json` 저장 로직이 바뀌므로 Worker 재배포가 필요합니다.

```bash
cd /workspaces/TRINITY-OS/worker
npx wrangler secret list
npx wrangler deploy
```

`SUPABASE_SECRET_KEY`가 없다면 먼저:

```bash
npx wrangler secret put SUPABASE_SECRET_KEY
```

## Git push

```bash
cd /workspaces/TRINITY-OS
git add src worker
git commit -m "feat: add Learning Archive image attachments"
git push origin main
```
