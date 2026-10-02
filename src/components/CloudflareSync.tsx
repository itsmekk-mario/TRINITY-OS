import { CloudCog, DownloadCloud, History, LogOut, UploadCloud } from 'lucide-react';
import { useState } from 'react';
import type { AppData } from '../types';
import { fetchCloudflareData, fetchCloudflareHistory, loadCloudflareConfig, loadRecoveryCopy, recoverCloudflareHistoryMissing, rememberCloudflareSyncBaseline, saveRecoveryCopy, uploadCloudflareData, type SyncHistoryItem } from '../lib/cloudflare';
import { logout } from '../lib/auth';

const countRecords = (value: AppData) => Object.keys(value.calendar).length + value.sessions.length + Object.keys(value.journals).length + value.scores.length + Object.keys(value.plaire).length + value.trinity.length + value.resources.length + value.wrongAnswerDrills.length + value.dailyDrills.length + value.weeklyCapabilityGoals.length;

export default function CloudflareSync({ data, update, onLogout }: { data: AppData; update: (fn: (value: AppData) => AppData) => void; onLogout?: () => void }) {
  const initial = loadCloudflareConfig();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<SyncHistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const userId = initial.userId;
  const recovery = userId === undefined ? null : loadRecoveryCopy(userId);
  const config = () => initial;

  const upload = async () => {
    setBusy(true); setStatus('서버 데이터를 확인하는 중…');
    try {
      const remote = await fetchCloudflareData(config());
      const localCount = countRecords(data); const remoteCount = remote.data ? countRecords(remote.data) : 0;
      if (localCount === 0 && remoteCount > 0) throw new Error('이 기기에 학습 기록이 없어 서버 덮어쓰기를 차단했습니다. 먼저 서버 데이터를 가져오세요.');
      const warning = `서버 기록 ${remoteCount}개를 이 기기의 기록 ${localCount}개로 교체합니다. 계속하려면 “서버에 저장”을 입력하세요.`;
      if (window.prompt(warning) !== '서버에 저장') { setStatus('서버 저장을 취소했습니다.'); return; }
      if (userId === undefined) throw new Error('세션을 다시 확인해 주세요.');
      setStatus('서버에 저장 중…');
      const saved = await uploadCloudflareData(data, config(), { expectedUpdatedAt: remote.updatedAt ?? null });
      rememberCloudflareSyncBaseline(userId, data, saved.updatedAt ?? null);
      setStatus('저장되었습니다. 자동 동기화 기준도 갱신했습니다.');
    } catch (error) { setStatus(error instanceof Error ? error.message : '서버 저장에 실패했습니다.'); }
    finally { setBusy(false); }
  };



  const loadHistory = async () => {
    if (historyOpen) { setHistoryOpen(false); return; }
    setBusy(true); setStatus('이전 저장본을 확인하는 중…');
    try {
      setHistory(await fetchCloudflareHistory(config()));
      setHistoryOpen(true);
      setStatus('서버에 남아 있는 최근 저장본입니다. 현재 데이터는 덮어쓰지 않습니다.');
    } catch (error) { setStatus(error instanceof Error ? error.message : '이전 저장본 조회에 실패했습니다.'); }
    finally { setBusy(false); }
  };

  const recoverMissing = async (historyId: number) => {
    if (userId === undefined) { setStatus('세션을 다시 확인해 주세요.'); return; }
    if (!window.confirm('선택한 이전 저장본에서 현재 목록에 없는 자료와 오답만 추가할까요? 현재 항목은 덮어쓰지 않습니다.')) return;
    setBusy(true); setStatus('누락 항목을 복구하는 중…');
    try {
      saveRecoveryCopy(userId, data);
      const restored = await recoverCloudflareHistoryMissing(historyId, config());
      rememberCloudflareSyncBaseline(userId, restored.data, restored.updatedAt);
      update(() => restored.data);
      setStatus(`복구 완료 · 자료 ${restored.addedResources}개 · 오답 ${restored.addedWrongAnswers}개 추가`);
      setHistory(await fetchCloudflareHistory(config()));
    } catch (error) { setStatus(error instanceof Error ? error.message : '누락 항목 복구에 실패했습니다.'); }
    finally { setBusy(false); }
  };

  const download = async () => {
    if (!window.confirm('서버 데이터를 이 기기로 가져올까요? 현재 데이터는 복구본으로 자동 보관됩니다.')) return;
    setBusy(true); setStatus('서버에서 가져오는 중…');
    try {
      const remote = await fetchCloudflareData(config());
      if (!remote.data) throw new Error('서버에 저장된 데이터가 없습니다.');
      if (userId === undefined) throw new Error('세션을 다시 확인해 주세요.');
      saveRecoveryCopy(userId, data);
      rememberCloudflareSyncBaseline(userId, remote.data, remote.updatedAt ?? null);
      update(() => remote.data as AppData);
      setStatus('서버 데이터를 가져왔습니다. 자동 동기화 기준도 갱신했습니다.');
    } catch (error) { setStatus(error instanceof Error ? error.message : '가져오기에 실패했습니다.'); }
    finally { setBusy(false); }
  };

  const restore = () => {
    const copy = userId === undefined ? null : loadRecoveryCopy(userId);
    if (!copy || !window.confirm('가져오기 전 데이터로 되돌릴까요?')) return;
    update(() => copy.data); setStatus(`복구본(${new Date(copy.savedAt).toLocaleString('ko-KR')})으로 되돌렸습니다.`);
  };

  const disabled = busy || !initial.token || userId === undefined;
  return <div className="drive-sync cloudflare-sync">
    <div className="drive-sync-head"><CloudCog size={18}/><div><b>Cloudflare 기기 간 저장</b><small>자동 병합하지 않습니다. 데이터 방향을 직접 선택하세요.</small></div></div>
    <p className="drive-status">자동 동기화: 약 1.5초 내 저장하며, 양쪽이 동시에 바뀌면 자동 덮어쓰지 않고 충돌을 차단합니다.</p>
    <p className="drive-status">연결 서버는 보안을 위해 운영 환경에서 고정됩니다.</p>
    <p className="sync-account">로그인 계정: <b>{initial.username || 'TRINITY'}</b></p>
    <div className="sync-actions">
      <button className="button primary" onClick={upload} disabled={disabled}><UploadCloud size={16}/>{busy?'처리 중…':'이 기기 → 서버 저장'}</button>
      <button className="button" onClick={download} disabled={disabled}><DownloadCloud size={16}/>서버 → 이 기기로 가져오기</button>
      {recovery&&<button className="button" onClick={restore} disabled={busy}><History size={16}/>가져오기 전 데이터 복구</button>}
      <button className="button" onClick={()=>void loadHistory()} disabled={busy}><History size={16}/>{historyOpen?'이전 저장본 닫기':'이전 저장본 확인'}</button>
      <button className="button" onClick={()=>{if(onLogout)onLogout();else void logout().finally(()=>location.reload());}} disabled={busy}><LogOut size={16}/>로그아웃</button>
    </div>{historyOpen&&<div className="sync-history">{history.length?history.map(item=><div className="team-record" key={item.id}><span><b>{new Date(item.savedAt).toLocaleString('ko-KR')}</b><small>자료 {item.resourceCount} · 오답 {item.wrongAnswerCount} · 학습 {item.sessionCount} · 시험 {item.scoreCount}</small></span><button className="button" disabled={busy||item.invalid} onClick={()=>void recoverMissing(item.id)}>누락 자료·오답 병합</button></div>):<p className="drive-status">복구 가능한 서버 저장본이 없습니다.</p>}</div>}{status&&<p className="drive-status">{status}</p>}
  </div>;
}
