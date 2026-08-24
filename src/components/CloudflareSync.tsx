import { CloudCog, DownloadCloud, History, UploadCloud } from 'lucide-react';
import { useState } from 'react';
import type { AppData } from '../types';
import { fetchCloudflareData, loadCloudflareConfig, loadRecoveryCopy, saveCloudflareConfig, saveRecoveryCopy, uploadCloudflareData } from '../lib/cloudflare';

export default function CloudflareSync({ data, update }: { data: AppData; update: (fn: (value: AppData) => AppData) => void }) {
  const initial = loadCloudflareConfig();
  const [url, setUrl] = useState(initial.url);
  const [token, setToken] = useState(initial.token);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const recovery = loadRecoveryCopy();

  const config = () => {
    const value = { url: url.trim(), token: token.trim() };
    saveCloudflareConfig(value);
    return value;
  };

  const upload = async () => {
    if (!window.confirm('이 기기의 현재 데이터로 서버 데이터를 교체할까요?')) return;
    setBusy(true); setStatus('서버에 저장 중…');
    try {
      await uploadCloudflareData(data, config());
      setStatus('이 기기 데이터가 서버에 저장되었습니다.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '서버 저장에 실패했습니다.');
    } finally { setBusy(false); }
  };

  const download = async () => {
    if (!window.confirm('서버 데이터를 이 기기로 가져올까요? 현재 데이터는 복구본으로 자동 보관됩니다.')) return;
    setBusy(true); setStatus('서버에서 가져오는 중…');
    try {
      const remote = await fetchCloudflareData(config());
      if (!remote.data) throw new Error('서버에 저장된 데이터가 없습니다. 먼저 데이터가 있는 기기에서 서버에 저장하세요.');
      saveRecoveryCopy(data);
      update(() => remote.data as AppData);
      setStatus('서버 데이터를 가져왔습니다. 기존 데이터는 복구본으로 보관했습니다.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '서버 데이터 가져오기에 실패했습니다.');
    } finally { setBusy(false); }
  };

  const restore = () => {
    const copy = loadRecoveryCopy();
    if (!copy || !window.confirm('가져오기 전 데이터로 되돌릴까요?')) return;
    update(() => copy.data);
    setStatus(`복구본(${new Date(copy.savedAt).toLocaleString('ko-KR')})으로 되돌렸습니다.`);
  };

  const disabled = busy || !url.trim() || !token.trim();
  return <div className="drive-sync cloudflare-sync">
    <div className="drive-sync-head"><CloudCog size={18}/><div><b>Cloudflare 기기 간 저장</b><small>자동 병합하지 않습니다. 데이터 방향을 직접 선택하세요.</small></div></div>
    <label className="drive-client-field"><span>Worker URL</span><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://trinity-os-sync.example.workers.dev"/></label>
    <label className="drive-client-field"><span>개인 동기화 토큰</span><input type="password" value={token} onChange={e=>setToken(e.target.value)} placeholder="SYNC_TOKEN 값"/><small>토큰은 이 브라우저에만 저장됩니다.</small></label>
    <div className="sync-actions">
      <button className="button primary" onClick={upload} disabled={disabled}><UploadCloud size={16}/>{busy?'처리 중…':'이 기기 → 서버 저장'}</button>
      <button className="button" onClick={download} disabled={disabled}><DownloadCloud size={16}/>서버 → 이 기기로 가져오기</button>
      {recovery&&<button className="button" onClick={restore} disabled={busy}><History size={16}/>가져오기 전 데이터 복구</button>}
    </div>
    {status&&<p className="drive-status">{status}</p>}
  </div>;
}
