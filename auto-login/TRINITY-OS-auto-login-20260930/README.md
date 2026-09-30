# TRINITY OS Auto Login Patch — 2026-09-30

Target verified against `main` commit `48af945` on 2026-09-30.

## What changes

- Student login
  - Existing persisted bearer session remains the source of truth.
  - Temporary network failure no longer deletes the saved login.
  - Explicit Logout is added to Settings and revokes the Worker session.
- Teacher / parent login
  - Migrates from `sessionStorage` to persistent `localStorage`.
  - Existing tab-only sessions are migrated automatically once.
  - HTTP 401 removes the expired saved credential and returns to login.
  - Explicit logout calls `/api/support/logout` and clears local credentials.
- Session lifetime
  - Production `SESSION_TTL_DAYS` changes from 7 to 30.
  - Support sessions now use the same `SESSION_TTL_DAYS` value as student sessions.

## Security model

This patch intentionally keeps TRINITY OS's existing bearer-token architecture instead of moving authentication to cross-site HttpOnly cookies. The production frontend (`trinityos.mcv.kr`) and current Worker (`*.workers.dev`) are different sites; cross-site cookies can be unreliable on Safari/iPadOS because of third-party-cookie restrictions. Persistent tokens therefore remain compatible with the current deployment model.

No password is stored in localStorage. Only the existing session token, Worker URL and role metadata are persisted.

## Apply

From the repository root:

```bash
unzip -o TRINITY-OS-auto-login-20260930.zip -d auto-login
bash auto-login/apply-auto-login.sh
```

The apply script runs `git pull --ff-only origin main`, creates a local backup, applies the patch, then runs `npm run build` and `npm test`.

## Deploy

```bash
git add src worker

git commit -m "feat: persist secure auto login sessions"
git push origin main

cd worker
npm install
npx wrangler deploy --config wrangler.toml
```

A new login issued after Worker deployment receives the new 30-day expiry. Existing already-issued sessions keep their original expiration date until the user logs in again.
