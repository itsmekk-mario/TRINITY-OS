import { CloudCog, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import type { AppData } from '../types';
import { cloudflareSync, loadCloudflareConfig, saveCloudflareConfig } from '../lib/cloudflare';

export default function CloudflareSync({ data, update }: { data: AppData; update: (fn: (value: AppData) => AppData) => void }) {
  const initial = loadCloudflareConfig(); const [url, setUrl] = useState(initial.url); const [token, setToken] = useState(initial.token); const [status, setStatus] = useState(''); const [busy, setBusy] = useState(false);
  const sync = async () => { setBusy(true); setStatus('Worker와 동기화 중…'); try { const config = { url: url.trim(), token: token.trim() }; saveCloudflareConfig(config); const merged = await cloudflareSync(data, config); update(() => merged); setStatus('동기화가 완료되었습니다.'); } catch (error) { setStatus(error instanceof Error ? error.message : '동기화에 실패했습니다.'); } finally { setBusy(false); } };
  return <div className="drive-sync cloudflare-sync"><div className="drive-sync-head"><CloudCog size={18}/><div><b>Cloudflare 동기화</b><small>Worker + D1에 학습 데이터를 저장합니다.</small></div></div><label className="drive-client-field"><span>Worker URL</span><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://trinity-os-sync.example.workers.dev"/></label><label className="drive-client-field"><span>개인 동기화 토큰</span><input type="password" value={token} onChange={e=>setToken(e.target.value)} placeholder="wrangler secret put SYNC_TOKEN 값"/><small>토큰은 이 브라우저에만 저장하며 GitHub 코드에는 넣지 않습니다.</small></label><button className="button primary" onClick={sync} disabled={busy || !url.trim() || !token.trim()}><RefreshCw size={16} className={busy?'spin':''}/>{busy?'동기화 중…':'Cloudflare 연결 및 동기화'}</button>{status&&<p className="drive-status">{status}</p>}</div>;
}
