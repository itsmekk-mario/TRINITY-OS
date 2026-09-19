import { Cloud, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import type { AppData } from '../types';
import { authorize, syncDrive } from '../lib/drive';

export default function DriveSync({ data, update }: { data: AppData; update: (fn: (value: AppData) => AppData) => void }) {
  const [clientId, setClientId] = useState(data.googleClientId ?? ''); const [status, setStatus] = useState(''); const [busy, setBusy] = useState(false);
  const connect = async () => { setBusy(true); setStatus('Google 인증 창을 여는 중…'); try { const token = await authorize(clientId); void token; update(v => ({ ...v, googleClientId: clientId.trim() })); const result = await syncDrive({ ...data, googleClientId: clientId.trim() }); update(() => result.data); setStatus(result.action === 'uploaded' ? '새 동기화 파일을 만들었습니다.' : '기기와 Drive 데이터를 병합했습니다.'); } catch (error) { setStatus(error instanceof Error ? error.message : '동기화에 실패했습니다.'); } finally { setBusy(false); } };
  return <div className="drive-sync"><div className="drive-sync-head"><Cloud size={18}/><div><b>Google Drive 동기화</b><small>기기 간 학습 데이터를 병합합니다.</small></div></div><label className="drive-client-field"><span>Google OAuth Client ID</span><input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="1234567890-xxxx.apps.googleusercontent.com" /><small>Google Cloud Console에서 웹용 Client ID를 입력하세요. 비밀번호나 API Secret은 입력하지 않습니다.</small></label><button className="button primary" onClick={connect} disabled={busy || !clientId.trim()}><RefreshCw size={16} className={busy ? 'spin' : ''}/>{busy ? '동기화 중…' : 'Google 연결 및 동기화'}</button>{status && <p className="drive-status">{status}</p>}</div>;
}
