# TRINITY OS manual-sync baseline hotfix

기준 main: `fa044be99d9a1a1aed36a362655040fe568bafd2`

## 실제 원인

이전 패치에서 새 탭 bootstrap용 device baseline은 추가됐지만,
`CloudflareSync.tsx`의 수동 동기화 버튼은 baseline을 저장하지 않았습니다.

따라서 사용자가 최초 1회 방향을 직접 선택해도 다음 auto-sync에서 다시
`metadata === null`이 되어 같은 경고가 반복될 수 있었습니다.

## 수정

수동 동기화 성공 직후 해당 상태를 tab + device baseline으로 저장합니다.

- 이 기기 → 서버 저장: 업로드 결과 `updatedAt` + 현재 로컬 데이터
- 서버 → 이 기기로 가져오기: 서버의 `updatedAt` + 서버 데이터

서버의 `expectedUpdatedAt` 기반 CAS/409 충돌 차단은 그대로 유지됩니다.

## Codespaces

ZIP을 저장소 루트에 올리고:

```bash
unzip -o TRINITY-OS-manual-sync-baseline-hotfix-20260930.zip -d sync-hotfix
bash sync-hotfix/apply-fix.sh
```

성공 후:

```bash
git add src/lib/cloudflare.ts src/components/CloudflareSync.tsx
git commit -m "fix: persist sync baseline after manual resolution"
git push origin main
```

배포 후 최초 1회만 올바른 방향을 선택하면, 이후 같은 경고는 반복되지 않아야 합니다.
