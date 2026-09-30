# TRINITY OS 자동 동기화 새 탭 bootstrap 수정

기준 저장소: `itsmekk-mario/TRINITY-OS`
확인한 main: `a9af154bbfa5f6cccfd225bb877f0aa91a13b98f`
확인 시점: 2026-09-30

## 문제

2026-09-29 stale-tab 데이터 유실 방지 패치에서 자동 동기화 기준점을
`sessionStorage`로 완전히 이동하면서 새 탭에는 서버 기준 버전이 존재하지 않게 되었습니다.

그 결과 기존 로컬 데이터와 서버 데이터가 조금이라도 다르면:

> 이 탭에는 서버 기준 버전 정보가 없습니다. 자동 덮어쓰기를 차단했습니다.

가 반복되어 자동 동기화가 사실상 새 탭마다 중단됩니다.

## 수정 구조

- `sessionStorage`: 현재 탭 전용 CAS 기준점. stale-tab 안전장치.
- `localStorage`: 새 탭을 시작할 때만 사용하는 device bootstrap 기준점.
- 탭에 자체 기준점이 생기면 다른 탭의 device 기준점을 다시 상속하지 않음.
- 서버 PUT은 계속 `expectedUpdatedAt`을 사용하므로 다른 기기/탭이 먼저 저장하면 HTTP 409로 차단.
- 2026-09-29 이전의 legacy device baseline이 남아 있으면 한 번 마이그레이션.

따라서 **새 탭 자동 동기화는 복구하면서, 어제 막은 stale overwrite는 다시 열지 않습니다.**

## Codespaces 적용

ZIP 내용을 TRINITY-OS 저장소 루트에 풀고:

```bash
bash apply-sync-fix.sh
```

스크립트가 자동으로:

1. `git checkout main`
2. `git pull --ff-only origin main`
3. 패치 적용 전 `git apply --check`
4. `npm run build`
5. `npm test`
6. `git diff --check`

까지 수행합니다.

성공 후:

```bash
git add src/lib/cloudflare.ts
git commit -m "fix: bootstrap safe auto sync across new tabs"
git push origin main
```

## 적용 후 첫 확인

1. 사이트 새로고침 후 로그인
2. 기존에 정상 동기화 이력이 있는 기기라면 새 탭에서도 자동 동기화가 바로 이어지는지 확인
3. 완전히 새 기기이거나 device baseline이 전혀 없으면 안전상 최초 1회만
   - 현재 기기 기록이 최신: `이 기기 → 서버 저장`
   - 서버 기록이 최신: `서버 → 이 기기로 가져오기`
4. 이후 새 탭을 다시 열어 경고가 반복되지 않는지 확인

Worker/D1 변경은 필요 없습니다.
