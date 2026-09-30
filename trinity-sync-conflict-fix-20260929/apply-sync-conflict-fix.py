#!/usr/bin/env python3
from __future__ import annotations

import shutil
import sys
from datetime import datetime
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly 1 matching block, found {count}. Latest main may have changed; stop and review manually.")
    return text.replace(old, new, 1)


def main() -> int:
    root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd().resolve()
    if root.name == "worker" and (root.parent / "src" / "App.tsx").exists():
        root = root.parent

    targets = {
        "cloudflare": root / "src/lib/cloudflare.ts",
        "app": root / "src/App.tsx",
        "sync_ui": root / "src/components/CloudflareSync.tsx",
        "worker": root / "worker/src/index.ts",
        "tests": root / "tests/security.test.mjs",
    }
    missing = [str(p) for p in targets.values() if not p.exists()]
    if missing:
        raise RuntimeError("TRINITY OS repo root에서 실행해야 합니다. Missing: " + ", ".join(missing))

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_root = root / f".trinity-sync-conflict-backup-{stamp}"
    for path in targets.values():
        rel = path.relative_to(root)
        dest = backup_root / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, dest)

    cloudflare_new = r'''import type { AppData } from '../types';
import { initialData } from './storage';
import { trustedWorkerUrl } from './runtimeConfig';

const CONFIG_KEY = 'trinity-os:cloudflare-sync:v2';
const LEGACY_CONFIG_KEY = 'trinity-os:cloudflare-sync:v1';
const AUTH_KEY = 'trinity-os:auth-session:v1';
const keyForUser = (name: string, userId: number | string) => `trinity-os:${name}:${userId}:v1`;
const AUTO_SYNC_KEY = (userId: number | string) => `trinity-os:cloudflare-auto-sync-tab:${userId}:v2`;
export type CloudflareConfig = { url: string; token: string; username?: string; userId?: number; mustChangePassword?: boolean };
type RemotePayload = { data?: AppData | null; updatedAt?: string | null };
type AutoSyncMetadata = { localSignature: string; remoteUpdatedAt: string | null };
export type AutoSyncResult = {
  action: 'disabled' | 'uploaded' | 'downloaded' | 'unchanged' | 'conflict';
  data?: AppData;
  updatedAt?: string | null;
  reason?: string;
};

class SyncConflictError extends Error {
  constructor(message: string, public updatedAt: string | null) {
    super(message);
    this.name = 'SyncConflictError';
  }
}

export const loadCloudflareConfig = (): CloudflareConfig => {
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
};

const signature = (data: AppData) => JSON.stringify(data);
const initialSignature = () => signature(initialData);

/**
 * Auto-sync metadata is deliberately tab-scoped.
 * Sharing this baseline through localStorage allows a stale tab to inherit another tab's
 * latest server revision and overwrite newer data. sessionStorage keeps each tab's
 * compare-and-swap baseline independent.
 */
function loadAutoSyncMetadata(userId: number | string): AutoSyncMetadata | null {
  try {
    const value = sessionStorage.getItem(AUTO_SYNC_KEY(userId));
    return value ? JSON.parse(value) as AutoSyncMetadata : null;
  } catch { return null; }
}

function saveAutoSyncMetadata(userId: number | string, localSignature: string, remoteUpdatedAt: string | null) {
  sessionStorage.setItem(AUTO_SYNC_KEY(userId), JSON.stringify({ localSignature, remoteUpdatedAt } satisfies AutoSyncMetadata));
}

function requestParts(config: CloudflareConfig) {
  if (!config.url || !config.token) throw new Error('Worker 주소를 확인하고 로그인해 주세요.');
  return {
    base: config.url.replace(/\/+$/, ''),
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
  };
}

export async function fetchCloudflareData(config: CloudflareConfig): Promise<RemotePayload> {
  const { base, headers } = requestParts(config);
  const response = await fetch(`${base}/api/sync`, { headers, cache: 'no-store' });
  if (!response.ok) throw new Error(`Worker 연결 실패 (${response.status})`);
  return response.json() as Promise<RemotePayload>;
}

export async function uploadCloudflareData(
  data: AppData,
  config: CloudflareConfig,
  options?: { expectedUpdatedAt?: string | null },
) {
  const { base, headers } = requestParts(config);
  const body: { data: AppData; expectedUpdatedAt?: string | null } = { data };
  if (options && Object.prototype.hasOwnProperty.call(options, 'expectedUpdatedAt')) {
    body.expectedUpdatedAt = options.expectedUpdatedAt ?? null;
  }
  const response = await fetch(`${base}/api/sync`, { method: 'PUT', headers, body: JSON.stringify(body) });
  if (response.status === 409) {
    let payload: { error?: string; updatedAt?: string | null } = {};
    try { payload = await response.json() as typeof payload; } catch { /* no body */ }
    throw new SyncConflictError(payload.error || '다른 기기 또는 탭에서 데이터가 먼저 변경되었습니다.', payload.updatedAt ?? null);
  }
  if (!response.ok) throw new Error(`Worker 저장 실패 (${response.status})`);
  return response.json() as Promise<{ ok: boolean; updatedAt?: string }>;
}

/**
 * Synchronize using optimistic concurrency.
 * - Same state: accept and refresh the tab baseline.
 * - Only remote changed: download.
 * - Only this tab changed: conditional PUT using the revision this tab actually observed.
 * - Both changed / unknown baseline: never auto-overwrite; surface a conflict instead.
 */
export async function autoSyncCloudflareData(data: AppData, userId: number | string): Promise<AutoSyncResult> {
  const config = loadCloudflareConfig();
  if (!config.url || !config.token || config.userId !== Number(userId)) return { action: 'disabled' };

  const localSignature = signature(data);
  const metadata = loadAutoSyncMetadata(userId);
  const remote = await fetchCloudflareData(config);
  const remoteSignature = remote.data ? signature(remote.data) : null;

  if (remoteSignature === localSignature) {
    saveAutoSyncMetadata(userId, localSignature, remote.updatedAt ?? null);
    return { action: 'unchanged', updatedAt: remote.updatedAt };
  }

  const conflict = (reason: string, updatedAt = remote.updatedAt ?? null): AutoSyncResult => {
    saveRecoveryCopy(userId, data);
    return { action: 'conflict', updatedAt, reason };
  };

  if (!remote.data) {
    if (metadata?.remoteUpdatedAt) {
      return conflict('서버 상태가 이 탭이 마지막으로 확인한 상태와 달라 자동 저장을 중단했습니다.', null);
    }
    try {
      const saved = await uploadCloudflareData(data, config, { expectedUpdatedAt: null });
      saveAutoSyncMetadata(userId, localSignature, saved.updatedAt ?? null);
      return { action: 'uploaded', updatedAt: saved.updatedAt ?? null };
    } catch (error) {
      if (error instanceof SyncConflictError) return conflict(error.message, error.updatedAt);
      throw error;
    }
  }

  if (!metadata) {
    if (localSignature === initialSignature()) {
      saveAutoSyncMetadata(userId, remoteSignature!, remote.updatedAt ?? null);
      return { action: 'downloaded', data: remote.data, updatedAt: remote.updatedAt };
    }
    return conflict('이 탭에는 서버 기준 버전 정보가 없습니다. 자동 덮어쓰기를 차단했습니다.');
  }

  const localChanged = metadata.localSignature !== localSignature;
  const remoteChanged = metadata.remoteUpdatedAt !== (remote.updatedAt ?? null);

  if (!localChanged && remoteChanged) {
    saveAutoSyncMetadata(userId, remoteSignature!, remote.updatedAt ?? null);
    return { action: 'downloaded', data: remote.data, updatedAt: remote.updatedAt };
  }

  if (localChanged && remoteChanged) {
    return conflict('이 기기와 서버가 모두 변경되었습니다. 자동 덮어쓰기를 차단했습니다.');
  }

  if (!localChanged && !remoteChanged) {
    return conflict('동기화 기준과 실제 데이터가 일치하지 않습니다. 자동 덮어쓰기를 차단했습니다.');
  }

  try {
    const saved = await uploadCloudflareData(data, config, { expectedUpdatedAt: metadata.remoteUpdatedAt });
    saveAutoSyncMetadata(userId, localSignature, saved.updatedAt ?? null);
    return { action: 'uploaded', updatedAt: saved.updatedAt ?? null };
  } catch (error) {
    if (error instanceof SyncConflictError) return conflict(error.message, error.updatedAt);
    throw error;
  }
}

export function saveRecoveryCopy(userId: number | string, data: AppData) {
  localStorage.setItem(keyForUser('cloudflare-recovery', userId), JSON.stringify({ savedAt: new Date().toISOString(), data }));
}

export function loadRecoveryCopy(userId: number | string): { savedAt: string; data: AppData } | null {
  try {
    const value = localStorage.getItem(keyForUser('cloudflare-recovery', userId));
    return value ? JSON.parse(value) as { savedAt: string; data: AppData } : null;
  } catch { return null; }
}

export function clearUserSyncState(userId: number | string) {
  // Clear the old shared auto-sync baseline as well as the new tab-scoped baseline.
  localStorage.removeItem(keyForUser('cloudflare-auto-sync', userId));
  sessionStorage.removeItem(AUTO_SYNC_KEY(userId));
  localStorage.removeItem(keyForUser('cloudflare-recovery', userId));
}
'''

    targets["cloudflare"].write_text(cloudflare_new, encoding="utf-8")

    app = targets["app"].read_text(encoding="utf-8")
    if "saveRecoveryCopy" not in "\n".join(app.splitlines()[:70]):
        app = replace_once(
            app,
            'import { autoSyncCloudflareData, loadCloudflareConfig } from "./lib/cloudflare";',
            'import { autoSyncCloudflareData, loadCloudflareConfig, saveRecoveryCopy } from "./lib/cloudflare";',
            "App.tsx cloudflare import",
        )
    old_effect = '''        const result = await autoSyncCloudflareData(data, identity.userId);\n        if (result.action === "downloaded" && result.data) {\n          saveData(identity.userId, result.data);\n          setData(result.data);\n        }'''
    new_effect = '''        const result = await autoSyncCloudflareData(data, identity.userId);\n        if (result.action === "downloaded" && result.data) {\n          // Never replace the visible/local state without keeping a one-click recovery copy.\n          saveRecoveryCopy(identity.userId, data);\n          saveData(identity.userId, result.data);\n          setData(result.data);\n        } else if (result.action === "conflict") {\n          // The server and this tab diverged. Keep both intact and require an explicit direction.\n          saveRecoveryCopy(identity.userId, data);\n          setToast(result.reason || "동기화 충돌을 감지해 자동 덮어쓰기를 중단했습니다.");\n          window.setTimeout(() => setToast(""), 5000);\n        }'''
    if old_effect in app:
        app = replace_once(app, old_effect, new_effect, "App.tsx auto-sync effect")
    elif 'result.action === "conflict"' not in app:
        raise RuntimeError("App.tsx auto-sync effect: expected block not found")
    targets["app"].write_text(app, encoding="utf-8")

    sync_ui = targets["sync_ui"].read_text(encoding="utf-8")
    old_msg = '자동 동기화: 로그인 상태에서 변경 후 약 1.5초 내에 D1에 저장됩니다.'
    new_msg = '자동 동기화: 약 1.5초 내 저장하며, 양쪽이 동시에 바뀌면 자동 덮어쓰지 않고 충돌을 차단합니다.'
    if old_msg in sync_ui:
        sync_ui = sync_ui.replace(old_msg, new_msg, 1)
    targets["sync_ui"].write_text(sync_ui, encoding="utf-8")

    worker = targets["worker"].read_text(encoding="utf-8")
    old_worker = '''  const body = await boundedJson<{ data?: unknown }>(request,MAX_SYNC_BODY); if (!body?.data) return json({ error: 'data is required' }, 400, origin);\n  if(!validateAppData(body.data))return json({error:'지원되지 않는 학습 데이터 형식입니다.'},400,origin);\n  const now = new Date().toISOString(); const previous = await env.DB.prepare('SELECT payload FROM learning_state WHERE user_id=?').bind(user.id).first<{ payload: string }>();\n  if (previous) await env.DB.prepare('INSERT INTO learning_state_history(user_id,payload,saved_at) VALUES(?,?,?)').bind(user.id, previous.payload, now).run();\n  await env.DB.prepare('INSERT INTO learning_state(user_id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').bind(user.id, JSON.stringify(body.data), now).run();\n  await syncLearningProjection(env.DB,user.id,body.data,now);\n  await env.DB.prepare('DELETE FROM learning_state_history WHERE user_id=? AND id NOT IN (SELECT id FROM learning_state_history WHERE user_id=? ORDER BY id DESC LIMIT 20)').bind(user.id, user.id).run();\n  return json({ ok: true, updatedAt: now }, 200, origin);'''
    new_worker = '''  const body = await boundedJson<{ data?: unknown; expectedUpdatedAt?: string | null }>(request,MAX_SYNC_BODY); if (!body?.data) return json({ error: 'data is required' }, 400, origin);\n  if(!validateAppData(body.data))return json({error:'지원되지 않는 학습 데이터 형식입니다.'},400,origin);\n  const guardedWrite=Object.prototype.hasOwnProperty.call(body,'expectedUpdatedAt');\n  if(guardedWrite&&body.expectedUpdatedAt!==null&&typeof body.expectedUpdatedAt!=='string')return json({error:'expectedUpdatedAt 형식이 올바르지 않습니다.'},400,origin);\n  const previous=await env.DB.prepare('SELECT payload,updated_at FROM learning_state WHERE user_id=?').bind(user.id).first<{payload:string;updated_at:string}>();\n  const now=new Date().toISOString();\n  if(guardedWrite){\n    const expected=body.expectedUpdatedAt??null,actual=previous?.updated_at??null;\n    if(expected!==actual)return json({error:'다른 기기 또는 탭에서 데이터가 먼저 변경되었습니다.',conflict:true,updatedAt:actual},409,origin);\n    if(previous){\n      const write=await env.DB.prepare('UPDATE learning_state SET payload=?,updated_at=? WHERE user_id=? AND updated_at=?').bind(JSON.stringify(body.data),now,user.id,expected).run();\n      if((write.meta?.changes??0)!==1){const current=await env.DB.prepare('SELECT updated_at FROM learning_state WHERE user_id=?').bind(user.id).first<{updated_at:string}>();return json({error:'다른 기기 또는 탭에서 데이터가 먼저 변경되었습니다.',conflict:true,updatedAt:current?.updated_at??null},409,origin);}\n      await env.DB.prepare('INSERT INTO learning_state_history(user_id,payload,saved_at) VALUES(?,?,?)').bind(user.id,previous.payload,now).run();\n    }else{\n      const write=await env.DB.prepare('INSERT INTO learning_state(user_id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO NOTHING').bind(user.id,JSON.stringify(body.data),now).run();\n      if((write.meta?.changes??0)!==1){const current=await env.DB.prepare('SELECT updated_at FROM learning_state WHERE user_id=?').bind(user.id).first<{updated_at:string}>();return json({error:'다른 기기 또는 탭에서 데이터가 먼저 생성되었습니다.',conflict:true,updatedAt:current?.updated_at??null},409,origin);}\n    }\n  }else{\n    if(previous)await env.DB.prepare('INSERT INTO learning_state_history(user_id,payload,saved_at) VALUES(?,?,?)').bind(user.id,previous.payload,now).run();\n    await env.DB.prepare('INSERT INTO learning_state(user_id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').bind(user.id,JSON.stringify(body.data),now).run();\n  }\n  await syncLearningProjection(env.DB,user.id,body.data,now);\n  await env.DB.prepare('DELETE FROM learning_state_history WHERE user_id=? AND id NOT IN (SELECT id FROM learning_state_history WHERE user_id=? ORDER BY id DESC LIMIT 20)').bind(user.id, user.id).run();\n  return json({ ok: true, updatedAt: now }, 200, origin);'''
    if old_worker in worker:
        worker = replace_once(worker, old_worker, new_worker, "worker /api/sync PUT")
    elif "expectedUpdatedAt" not in worker:
        raise RuntimeError("worker /api/sync PUT: expected block not found")
    targets["worker"].write_text(worker, encoding="utf-8")

    tests = targets["tests"].read_text(encoding="utf-8")
    marker = "sync optimistic concurrency rejects a stale whole-AppData overwrite"
    if marker not in tests:
        tests += r'''

test('sync optimistic concurrency rejects a stale whole-AppData overwrite',async()=>{
  const h=harness();h.session('a',1);
  const before=await(await h.call('/api/sync',{token:'a'})).json();
  const firstData={...before.data,sessions:[...before.data.sessions,{id:'sync-safe-1',date:'2026-09-29',subject:'수학',seconds:60}]};
  const first=await h.call('/api/sync',{method:'PUT',token:'a',body:{data:firstData,expectedUpdatedAt:before.updatedAt}});
  assert.equal(first.status,200);
  const staleData={...before.data,sessions:[...before.data.sessions,{id:'sync-stale-overwrite',date:'2026-09-29',subject:'국어',seconds:600}]};
  const stale=await h.call('/api/sync',{method:'PUT',token:'a',body:{data:staleData,expectedUpdatedAt:before.updatedAt}});
  assert.equal(stale.status,409);
  const conflict=await stale.json();assert.equal(conflict.conflict,true);
  const after=await(await h.call('/api/sync',{token:'a'})).json();
  assert(after.data.sessions.some(item=>item.id==='sync-safe-1'));
  assert(!after.data.sessions.some(item=>item.id==='sync-stale-overwrite'));
});

test('sync guarded create cannot replace an existing server state with expected null',async()=>{
  const h=harness();h.session('a',1);
  const before=await(await h.call('/api/sync',{token:'a'})).json();
  const response=await h.call('/api/sync',{method:'PUT',token:'a',body:{data:before.data,expectedUpdatedAt:null}});
  assert.equal(response.status,409);
});
'''
        targets["tests"].write_text(tests, encoding="utf-8")

    note = root / "SYNC-CONFLICT-FIX-20260929.md"
    note.write_text(
        "# TRINITY OS sync conflict fix\n\n"
        "- Auto-sync baseline is now tab-scoped (`sessionStorage`), so a stale tab cannot inherit another tab's latest revision.\n"
        "- Auto PUT uses `expectedUpdatedAt` optimistic concurrency. Stale writes return HTTP 409 instead of replacing `learning_state`.\n"
        "- If both local and remote changed, auto-sync stops instead of choosing a winner.\n"
        "- Automatic server downloads save a local recovery copy before replacing visible state.\n"
        "- Manual ‘device → server’ remains an explicit force operation after its confirmation prompt; D1 history still stores the previous state.\n",
        encoding="utf-8",
    )

    print("Applied TRINITY sync conflict fix.")
    print(f"Backup: {backup_root}")
    print("Changed:")
    for path in [targets['cloudflare'], targets['app'], targets['sync_ui'], targets['worker'], targets['tests'], note]:
        print(f"  - {path.relative_to(root)}")
    print("\nNext: npm test && npm run build && cd worker && npx wrangler deploy")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
