# TRINITY OS persistent auto-login fix

## Root cause
The student bearer token was stored in `sessionStorage` (`trinity-os:auth-session:v1`).
Safari clears that storage when the tab/browser lifecycle ends, so the 30-day server
session existed in D1 but the browser no longer had the token needed to resume it.

## What this patch does
- Moves the student session token to a persistent device-scoped `localStorage` key:
  `trinity-os:auth-session:v2`
- Migrates an existing still-open v1 session automatically.
- Keeps the existing Worker-side session expiry and `/api/auth/logout` revocation.
- Does not store the user's password.

## Apply in Codespaces
```bash
cd /workspaces/TRINITY-OS
unzip -o TRINITY-OS-persistent-auto-login-fix.zip -d persistent-login-fix
chmod +x persistent-login-fix/apply.sh
bash persistent-login-fix/apply.sh
```

After the push-triggered GitHub Pages workflow succeeds, log in once and test:
1. refresh
2. close the tab
3. reopen Safari and `trinityos.mcv.kr`
4. verify direct entry without the login page
5. log out, reopen, and verify it does **not** auto-login

Note: persistent bearer tokens in localStorage are more exposed to same-origin XSS than
HttpOnly cookies. For the strongest production design, move auth to an HttpOnly Secure cookie
served from a same-site Worker custom domain such as `api.trinityos.mcv.kr`.
