# 관리자 · 기출 PDF 설정

이 앱은 PDF 파일 본문을 D1에 넣지 않습니다. D1은 검색·권한 검증용 메타데이터를,
GitHub Pages의 `public/exams/`는 PDF 파일을 담당합니다. 큰 바이너리를 D1에 넣으면
용량과 응답 시간 모두 나빠지므로 이 분리가 안전합니다.

## 최초 한 번: D1 테이블 적용

기존 데이터베이스에는 지원 포털 테이블만 추가합니다.

```bash
cd worker
npx wrangler d1 execute trinity-os-db --remote --file=./migrations/0001_support_portal.sql
```

`schema.sql`을 아직 실행하지 않은 새 데이터베이스라면 대신 아래 명령 한 번으로
학습 데이터와 지원 포털 테이블을 모두 만듭니다.

```bash
npx wrangler d1 execute trinity-os-db --remote --file=./schema.sql
```

## 계정 만들기

1. 학생(소유자) 계정으로 앱에 로그인하고 Cloudflare 동기화를 한 번 저장합니다.
2. `?portal=owner` 주소를 엽니다.
3. **공유 계정 생성**에서 tutor 또는 parent 역할, 아이디, 12자 이상의 임시 비밀번호를 입력합니다.
4. 선생님과 학부모는 각각 `?portal=tutor`, `?portal=parent`에서 로그인합니다.

튜터는 수학 학습의 상세 분석과 기출 PDF를 볼 수 있고, 학부모는 진도·점수의 축약된
보기만 받습니다. Notion, 일기, Plaire 등 개인 기록은 공유하지 않습니다.

## 기출 PDF 등록

1. PDF를 `public/exams/2026/kice/math-09.pdf`처럼 저장합니다.
2. GitHub Pages 배포 후 `?portal=owner`의 **기출 PDF 자료실**에서 같은 상대 경로
   (`2026/kice/math-09.pdf`)를 등록합니다.

파일과 D1 문서 레코드는 분리되어 있으므로, PDF를 먼저 배포한 뒤 목록에 등록해야 합니다.
