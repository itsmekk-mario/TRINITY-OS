#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$(pwd)}"
cd "$ROOT"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[ERROR] TRINITY-OS Git repository root에서 실행하세요." >&2
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "[ERROR] 추적 중인 파일에 미커밋 변경이 있습니다. commit/stash 후 다시 실행하세요." >&2
  exit 1
fi

echo "[1/5] latest main pull"
git pull --ff-only origin main

required=(
  src/lib/auth.ts
  src/App.tsx
  src/components/LoginPage.tsx
  src/pages/CollaborativePortal.tsx
  src/pages/SupportPortal.tsx
  worker/src/support.ts
  worker/wrangler.toml
)
for file in "${required[@]}"; do
  [[ -f "$file" ]] || { echo "[ERROR] missing: $file" >&2; exit 1; }
done

stamp="$(date +%Y%m%d-%H%M%S)"
backup=".trinity-auto-login-backup-$stamp"
mkdir -p "$backup"
for file in "${required[@]}"; do
  mkdir -p "$backup/$(dirname "$file")"
  cp "$file" "$backup/$file"
done

echo "[2/5] applying auto-login patch"
python3 - <<'PY'
from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    s = p.read_text(encoding='utf-8-sig')
    count = s.count(old)
    if count != 1:
        raise SystemExit(f"[ERROR] {path}: expected pattern once, found {count}. 최신 코드가 변경된 경우 패치를 다시 생성해야 합니다.\nPATTERN: {old[:180]!r}")
    p.write_text(s.replace(old, new, 1), encoding='utf-8')

# Student: transient network failure must not destroy a valid saved login.
replace_once(
    'src/lib/auth.ts',
    "  } catch { return null; }\n}\n\nexport function logoutLocal()",
    "  } catch {\n    // A network failure is not the same as an invalid session. Keep the\n    // persisted identity so TRINITY OS can open offline and validate again\n    // when connectivity returns.\n    if (config.username && config.userId !== undefined) return { username: config.username, userId: config.userId, mustChangePassword: config.mustChangePassword };\n    return null;\n  }\n}\n\nexport function logoutLocal()",
)

# Student: expose a real logout action now that login is persistent.
replace_once('src/App.tsx', '  Laptop,\n  MessageSquareText,', '  Laptop,\n  LogOut,\n  MessageSquareText,')
replace_once(
    'src/App.tsx',
    'import { logoutLocal, type SessionIdentity, validateSession } from "./lib/auth";',
    'import { logout, logoutLocal, type SessionIdentity, validateSession } from "./lib/auth";',
)
replace_once(
    'src/App.tsx',
    '                <input\n                  ref={fileRef}',
    '''                <button
                  onClick={() => {
                    setSettings(false);
                    void logout().finally(() => {
                      setIdentity(null);
                      setAuthenticated(false);
                      setData(initialData);
                    });
                  }}
                >
                  <LogOut />
                  <span>
                    <b>로그아웃</b>
                    <small>이 기기의 자동 로그인을 해제하고 서버 세션을 종료합니다.</small>
                  </span>
                </button>
                <input
                  ref={fileRef}''',
)

# Root login page: teacher/parent login survives browser/tab restart.
replace_once(
    'src/components/LoginPage.tsx',
    "sessionStorage.setItem(key, JSON.stringify({ url: url.replace(/\\/+$/, ''), token: value.token, role: supportRole }));",
    "localStorage.setItem(key, JSON.stringify({ url: url.replace(/\\/+$/, ''), token: value.token, role: supportRole }));\n      sessionStorage.removeItem(key);",
)

# Teacher portal: migrate legacy sessionStorage -> localStorage, detect expiry,
# and revoke the server session on explicit logout.
replace_once(
    'src/pages/CollaborativePortal.tsx',
    "if(!response.ok)throw new Error(value.error||`요청 실패 (${response.status})`);",
    "if(!response.ok)throw Object.assign(new Error(value.error||`요청 실패 (${response.status})`),{status:response.status});",
)
replace_once(
    'src/pages/CollaborativePortal.tsx',
    "const [auth,setAuth]=useState<Auth|null>(()=>{try{const value=JSON.parse(sessionStorage.getItem(key)||'null');return value?.role===role&&value?.token?value:null;}catch{return null;}});",
    "const [auth,setAuth]=useState<Auth|null>(()=>{try{const raw=localStorage.getItem(key)||sessionStorage.getItem(key);const value=JSON.parse(raw||'null');if(value?.role===role&&value?.token){localStorage.setItem(key,JSON.stringify(value));sessionStorage.removeItem(key);return value;}return null;}catch{return null;}});",
)
replace_once(
    'src/pages/CollaborativePortal.tsx',
    ".catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'담당 학생 조회 실패');}).finally",
    ".catch(reason=>{if(!controller.signal.aborted){if((reason as {status?:number})?.status===401){localStorage.removeItem(key);sessionStorage.removeItem(key);setAuth(null);setAssignments([]);setSelected('');return;}setError(reason instanceof Error?reason.message:'담당 학생 조회 실패');}}).finally",
)
replace_once(
    'src/pages/CollaborativePortal.tsx',
    ".catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'학습 데이터 조회 실패');}).finally",
    ".catch(reason=>{if(!controller.signal.aborted){if((reason as {status?:number})?.status===401){localStorage.removeItem(key);sessionStorage.removeItem(key);setAuth(null);setData(null);setFeedback([]);return;}setError(reason instanceof Error?reason.message:'학습 데이터 조회 실패');}}).finally",
)
replace_once(
    'src/pages/CollaborativePortal.tsx',
    "sessionStorage.setItem(key,JSON.stringify(next));",
    "localStorage.setItem(key,JSON.stringify(next));sessionStorage.removeItem(key);",
)
replace_once(
    'src/pages/CollaborativePortal.tsx',
    "onClick={()=>{sessionStorage.removeItem(key);setAuth(null);setAssignments([]);setSelected('');setData(null);setFeedback([]);}}",
    "onClick={()=>{if(!auth)return;void api(auth,'/api/support/logout','POST').catch(()=>undefined).finally(()=>{localStorage.removeItem(key);sessionStorage.removeItem(key);setAuth(null);setAssignments([]);setSelected('');setData(null);setFeedback([]);});}}",
)

# Parent/legacy support portal: same persistent-session behavior.
replace_once(
    'src/pages/SupportPortal.tsx',
    "if (!response.ok) throw new Error(value.error || `요청 실패 (${response.status})`);",
    "if (!response.ok) throw Object.assign(new Error(value.error || `요청 실패 (${response.status})`), { status: response.status });",
)
replace_once(
    'src/pages/SupportPortal.tsx',
    "const key = `trinity-support:${role}`; const [auth, setAuth] = useState<Auth | null>(() => { try { return JSON.parse(sessionStorage.getItem(key) || 'null') as Auth | null; } catch { return null; } });",
    "const key = `trinity-support:${role}`; const [auth, setAuth] = useState<Auth | null>(() => { try { const raw=localStorage.getItem(key)||sessionStorage.getItem(key); const value=JSON.parse(raw||'null') as Auth | null; if(value?.token){localStorage.setItem(key,JSON.stringify(value));sessionStorage.removeItem(key);return value;} return null; } catch { return null; } });",
)
replace_once(
    'src/pages/SupportPortal.tsx',
    "const refresh = async () => { if (!auth) return; try { setPayload(await api(auth, '/api/support/data')); } catch (e) { setError(errorText(e)); } };",
    "const refresh = async () => { if (!auth) return; try { setError(''); setPayload(await api(auth, '/api/support/data')); } catch (e) { if ((e as { status?: number })?.status === 401) { localStorage.removeItem(key); sessionStorage.removeItem(key); setAuth(null); setPayload(null); return; } setError(errorText(e)); } };",
)
replace_once(
    'src/pages/SupportPortal.tsx',
    "sessionStorage.setItem(key, JSON.stringify(next));",
    "localStorage.setItem(key, JSON.stringify(next)); sessionStorage.removeItem(key);",
)
replace_once(
    'src/pages/SupportPortal.tsx',
    "<button className=\"button\" onClick={() => { sessionStorage.removeItem(key); setAuth(null); setPayload(null); }}>로그아웃</button>",
    "<button className=\"button\" onClick={() => { if(auth) void api(auth, '/api/support/logout', 'POST').catch(() => undefined).finally(() => { localStorage.removeItem(key); sessionStorage.removeItem(key); setAuth(null); setPayload(null); }); }}>로그아웃</button>",
)

# One TTL source for student + support accounts. Production is 30 days.
replace_once(
    'worker/src/support.ts',
    "import { PASSWORD_HASH_ITERATIONS } from './security.ts';",
    "import { PASSWORD_HASH_ITERATIONS, sessionTtlDays } from './security.ts';",
)
replace_once(
    'worker/src/support.ts',
    "type Env = { DB: D1Database; SUPABASE_URL?: string; SUPABASE_SERVICE_ROLE_KEY?: string; SUPABASE_BUCKET?: string };",
    "type Env = { DB: D1Database; SUPABASE_URL?: string; SUPABASE_SERVICE_ROLE_KEY?: string; SUPABASE_BUCKET?: string; SESSION_TTL_DAYS?: string };",
)
replace_once(
    'worker/src/support.ts',
    "new Date(now+7*86400000).toISOString()",
    "new Date(now+sessionTtlDays(env.SESSION_TTL_DAYS)*86400000).toISOString()",
)
replace_once('worker/wrangler.toml', 'SESSION_TTL_DAYS = "7"', 'SESSION_TTL_DAYS = "30"')

print('[OK] source patch applied')
PY

echo "[3/5] build"
npm run build

echo "[4/5] tests"
npm test

echo "[5/5] summary"
git diff --check
git status --short
echo
echo "Auto-login patch applied successfully."
echo "Backup: $backup"
echo "Next: review -> commit -> push -> deploy Worker"
