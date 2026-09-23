# 열품타 API 사전 검증

제품 연동 전에 로그인·과목 조회·실제 시작/정지·휴식 제외를 검증한다.
현재 상태: 인증된 실제 API 테스트 통과. 민감정보를 제외한 원본 근거는 Git에서 제외된 `.ypt-local/api-probe.json`에 보관한다.

## 실행

Node.js 22 이상과 PowerShell이 필요하다. 열품타 앱과 다른 기기의 실행 중인 타이머를 먼저 정지한다.
본인 PowerShell 창에서 저장소 루트를 기준으로 실행한다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-ypt-api.ps1
```

`START` 확인 후 이메일, 숨김 비밀번호, 열품타에 이미 존재하는 정확한 과목명을 입력한다.
비밀번호와 JWT는 메모리에서만 사용하며 명령줄 인자나 파일에 저장하지 않는다.
테스트는 실제로 30초 공부, 10초 휴식, 30초 공부를 수행하므로 실제 공부 기록이 남는다.
테스트 중에는 터미널을 닫거나 다른 기기에서 타이머를 조작하지 않는다.

성공 기준:

- 로그인 및 실제 과목 조회 성공.
- 두 공부 구간 모두 같은 시작 시각으로 정지 요청 성공.
- 휴식 10초 동안 공부시간 증가 없음.
- 각 공부 구간과 전체 기록이 실측 시간과 일치. 허용 오차는 공부 API 요청 지연 합계 + 2초.
- 검증 중 열품타의 기록 날짜가 바뀌지 않음.

민감정보를 제외한 결과는 Git에서 제외된 `.ypt-local/api-probe.json`에 기록된다.
2026-09-23 실측 결과: `passed: true`, 공부 구간 30.076초 + 30.043초, 열품타 기록 증가 60.136초, 휴식 증가 0초, 시작·정지 각각 2회 성공. 모든 정지 요청이 완료되어 `stopConfirmed: true`다. 이 검증만으로 원격 활성 타이머의 자동 복구 가능성이 입증되지는 않는다.

## 오류와 중단

시작 호출 전에 `activeStartedAt`을 기록한다. 응답 유실이나 시간 초과에는 시작/정지를 자동 재시도하지 않는다.
`stopConfirmed: false` 또는 `requiresAppCheck: true`라면 열품타 앱에서 타이머를 확인하고 직접 정지한다.
기존 결과가 미해결 타이머를 나타내면 다음 테스트는 차단된다.
앱에서 해결한 뒤 기존 결과를 삭제하지 말고 다른 이름으로 보존하고 다시 실행한다.
날짜 변경·과목 불일치·기록 불일치도 성공으로 처리하지 않는다.

## 확인한 근거와 기준 결과

- TRINITY 기준: `978a0e84cd4283505737269843264fceb835e18d`.
- 참고 클라이언트: [deveworld/ypt_client](https://github.com/deveworld/ypt_client/tree/bf05d2d10626f996a7e8f3eb3e7e85eb26bfdd0e), `lib/ypt_api.dart`, `lib/models.dart`.
- 비인증 `GET /logs/day` 응답: HTTP 200, `s:false`, `c:108`. HTTP 성공만으로 API 성공을 판단할 수 없다.
- Node.js 24.19.0 / Windows, 잠금파일 의존성 설치 후: 전체 132개 중 126개 통과, 기존 영역 6개 실패. 이 중 신규 API 도구 테스트 9개는 모두 통과.
- 기존 실패: AI wrong-answer graph 노출, Core Rules UI, NVIDIA 모델 기본값, NVIDIA Worker 설정, Cam Study 마운트, 정적 URL alias 검사.
- 프론트 `npm run build` 통과. 기존 대형 번들 경고 있음.
- Worker `wrangler deploy --dry-run` 통과. 실제 Worker 배포와 운영 D1 변경은 하지 않음.
- PowerShell 파서 검사와 `git diff --check` 통과.
- 인증된 실제 API: 이메일 로그인, 과목 조회, 두 번의 시작·정지, 휴식 제외 통과. 응답의 `dl`에는 기록 시각 관련 필드가 있지만 원격 활성 상태를 안정적으로 판별하는 계약은 확인되지 않았다. 불확실 상태는 앱에서 직접 확인하고 수동 복구한다.

모의 테스트 재실행:

```sh
node --test tests/ypt-api-probe.test.mjs
```

실제 API 검증을 통과하면 Worker의 암호화 저장·상태 관리, 설정과 과목 매핑, 타이머 연결을 구현하고 통합 검증한다.
최종 push 대상은 본인 포크의 기능 브랜치이며, 원본 저장소에는 PR로 전달한다.
