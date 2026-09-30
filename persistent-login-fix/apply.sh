#!/usr/bin/env bash
set -euo pipefail

REPO="${1:-/workspaces/TRINITY-OS}"
cd "$REPO"

echo "== 1. Update main =="
git pull --ff-only origin main

echo "== 2. Patch persistent student session =="
python3 <<'PY'
from pathlib import Path

p = Path("src/lib/cloudflare.ts")
s = p.read_text(encoding="utf-8")

old_const = "const AUTH_KEY = 'trinity-os:auth-session:v1';"
new_const = """const AUTH_KEY = 'trinity-os:auth-session:v2';
const LEGACY_AUTH_KEY = 'trinity-os:auth-session:v1';"""

if old_const in s:
    s = s.replace(old_const, new_const, 1)
elif "const AUTH_KEY = 'trinity-os:auth-session:v2';" not in s:
    raise SystemExit("ERROR: auth key declaration not found; stop to avoid overwriting newer code.")

old_block = """export const loadCloudflareConfig = (): CloudflareConfig => {
  try {
    // v1 contained the Bearer token in localStorage. Do not retain it after upgrade.
    localStorage.removeItem(LEGACY_CONFIG_KEY);
    const publicConfig = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}') as Omit<CloudflareConfig, 'token'>;
    const privateConfig = JSON.parse(sessionStorage.getItem(AUTH_KEY) || '{}') as Pick<CloudflareConfig, 'token'>;
    return { ...publicConfig, ...privateConfig, url: trustedWorkerUrl(publicConfig.url), token: privateConfig.token || '' };
  } catch { return { url: trustedWorkerUrl(), token: '', username: '' }; }
};
export const saveCloudflareConfig = (config: CloudflareConfig) => {
  const url = trustedWorkerUrl(config.url);
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ url, username: config.username || '', userId: config.userId, mustChangePassword: Boolean(config.mustChangePassword) }));
  if (config.token) sessionStorage.setItem(AUTH_KEY, JSON.stringify({ token: config.token }));
  else sessionStorage.removeItem(AUTH_KEY);
};"""

new_block = """export const loadCloudflareConfig = (): CloudflareConfig => {
  try {
    localStorage.removeItem(LEGACY_CONFIG_KEY);
    const publicConfig = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}') as Omit<CloudflareConfig, 'token'>;
    const persistentAuth = JSON.parse(localStorage.getItem(AUTH_KEY) || '{}') as Pick<CloudflareConfig, 'token'>;
    const legacyTabAuth = JSON.parse(sessionStorage.getItem(LEGACY_AUTH_KEY) || '{}') as Pick<CloudflareConfig, 'token'>;
    const token = persistentAuth.token || legacyTabAuth.token || '';

    // Previous builds kept the student bearer token in sessionStorage, so Safari
    // discarded automatic login after the tab/browser lifecycle ended.
    // Persist it on this device. The Worker still enforces SESSION_TTL_DAYS and
    // /api/auth/logout immediately revokes the corresponding D1 session.
    if (!persistentAuth.token && legacyTabAuth.token) {
      localStorage.setItem(AUTH_KEY, JSON.stringify({ token: legacyTabAuth.token }));
    }
    sessionStorage.removeItem(LEGACY_AUTH_KEY);

    return { ...publicConfig, url: trustedWorkerUrl(publicConfig.url), token };
  } catch { return { url: trustedWorkerUrl(), token: '', username: '' }; }
};
export const saveCloudflareConfig = (config: CloudflareConfig) => {
  const url = trustedWorkerUrl(config.url);
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ url, username: config.username || '', userId: config.userId, mustChangePassword: Boolean(config.mustChangePassword) }));
  if (config.token) localStorage.setItem(AUTH_KEY, JSON.stringify({ token: config.token }));
  else localStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem(LEGACY_AUTH_KEY);
};"""

if old_block in s:
    s = s.replace(old_block, new_block, 1)
elif "const persistentAuth = JSON.parse(localStorage.getItem(AUTH_KEY)" in s:
    print("Persistent auth patch already present.")
else:
    raise SystemExit("ERROR: expected auth storage block not found; stop to avoid patching the wrong revision.")

p.write_text(s, encoding="utf-8")
print("Patched:", p)
PY

echo "== 3. Verify =="
grep -nE "auth-session:v2|persistentAuth|localStorage.setItem\(AUTH_KEY" src/lib/cloudflare.ts

echo "== 4. Build =="
npm run build

echo "== 5. Commit and push =="
git add src/lib/cloudflare.ts
if git diff --cached --quiet; then
  echo "No new tracked change; patch may already be committed."
else
  git commit -m "fix: keep student login across browser restarts"
  git push origin main
fi

echo
echo "DONE."
echo "The push-triggered GitHub Pages workflow deploys automatically; do not run 'gh workflow run'."
echo "After deployment succeeds, log in once, close Safari/tab, reopen trinityos.mcv.kr, and verify auto-login."
