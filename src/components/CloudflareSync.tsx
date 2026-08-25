import { CloudCog, DownloadCloud, History, LogOut, UploadCloud } from 'lucide-react';
import { useState } from 'react';
import type { AppData } from '../types';
import { fetchCloudflareData, loadCloudflareConfig, loadRecoveryCopy, saveCloudflareConfig, saveRecoveryCopy, uploadCloudflareData } from '../lib/cloudflare';
import { logoutLocal } from '../lib/auth';

const countRecords = (value: AppData) => Object.keys(value.calendar).length + value.sessions.length + Object.keys(value.journals).length + value.scores.length + Object.keys(value.plaire).length + value.trinity.length;

export default function CloudflareSync({ data, update, onLogout }: { data: AppData; update: (fn: (value: AppData) => AppData) => void; onLogout?: () => void }) {
  const initial = loadCloudflareConfig();
  const [url, setUrl] = useState(initial.url);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const recovery = loadRecoveryCopy();
  const config = () => { const value = { ...initial, url: url.trim() }; saveCloudflareConfig(value); return value; };

  const upload = async () => {
    setBusy(true); setStatus('서버 데이터를 확인하는 중…');
    try {
      const remote = await fetchCloudflareData(config());
      const localCount = countRecords(data); const remoteCount = remote.data ? countRecords(remote.data) : 0;
      if (localCount === 0 && remoteCount > 0) throw new Error('이 기기에 학습 기록이 없어 서버 덮어쓰기를 차단했습니다. 먼저 서버 데이터를 가져오세요.');
      const warning = `서버 기록 ${remoteCount}개를 이 기기의 기록 ${localCount}개로 교체합니다. 계속하려면 “서버에 저장”을 입력하세요.`;
      if (window.prompt(warning) !== '서버에 저장') { setStatus('서버 저장을 취소했습니다.'); return; }
      setStatus('서버에 저장 중…'); await uploadCloudflareData(data, config());
      setStatus('저장되었습니다. 서버의 이전 상태도 자동 백업했습니다.');
    } catch (error) { setStatus(error instanceof Error ? error.message : '서버 저장에 실패했습니다.'); }
    finally { setBusy(false); }
  };

  const download = async () => {
    if (!window.confirm('서버 데이터를 이 기기로 가져올까요? 현재 데이터는 복구본으로 자동 보관됩니다.')) return;
    setBusy(true); setStatus('서버에서 가져오는 중…');
    try {
      const remote = await fetchCloudflareData(config());
      if (!remote.data) throw new Error('서버에 저장된 데이터가 없습니다.');
      saveRecoveryCopy(data); update(() => remote.data as AppData);
      setStatus('서버 데이터를 가져왔습니다. 기존 데이터는 복구본으로 보관했습니다.');
    } catch (error) { setStatus(error instanceof Error ? error.message : '가져오기에 실패했습니다.'); }
    finally { setBusy(false); }
  };

  const restore = () => {
    const copy = loadRecoveryCopy();
    if (!copy || !window.confirm('가져오기 전 데이터로 되돌릴까요?')) return;
    update(() => copy.data); setStatus(`복구본(${new Date(copy.savedAt).toLocaleString('ko-KR')})으로 되돌렸습니다.`);
  };

  const disabled = busy || !url.trim() || !initial.token;
  return <div className="drive-sync cloudflare-sync">
    <div className="drive-sync-head"><CloudCog size={18}/><div><b>Cloudflare 기기 간 저장</b><small>자동 병합하지 않습니다. 데이터 방향을 직접 선택하세요.</small></div></div>
    <label className="drive-client-field"><span>Worker URL</span><input value={url} onChange={e=>setUrl(e.target.value)}/></label>
    <p className="sync-account">로그인 계정: <b>{initial.username || 'TRINITY'}</b></p>
    <div className="sync-actions">
      <button className="button primary" onClick={upload} disabled={disabled}><UploadCloud size={16}/>{busy?'처리 중…':'이 기기 → 서버 저장'}</button>
      <button className="button" onClick={download} disabled={disabled}><DownloadCloud size={16}/>서버 → 이 기기로 가져오기</button>
      {recovery&&<button className="button" onClick={restore} disabled={busy}><History size={16}/>가져오기 전 데이터 복구</button>}
      <button className="button" onClick={()=>{if(onLogout)onLogout();else{logoutLocal();location.reload();}}} disabled={busy}><LogOut size={16}/>로그아웃</button>
    </div>{status&&<p className="drive-status">{status}</p>}
  </div>;
}
