import { useEffect, useState } from 'react';
import type { Subject } from '../types';
import { readStudyClock } from '../lib/useStudyClock';
import { connectYpt, disconnectYpt, getYptStatus, resolveYpt, saveYptMapping, type YptStatus } from '../lib/ypt';

const SUBJECTS: Subject[] = ['국어', '수학', '영어', '통사', '통과', '탐구'];
export default function YptSettings() {
  const [status, setStatus] = useState<YptStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showReconnect, setShowReconnect] = useState(false);
  const [draft, setDraft] = useState<Partial<Record<Subject, string>>>({});
  const refresh = async () => { const next = await getYptStatus(); setStatus(next); setDraft(next.mapping); };
  useEffect(() => { let live = true; void getYptStatus().then(next => { if (live) { setStatus(next); setDraft(next.mapping); } }).catch(() => { if (live) setError('연결 상태를 확인할 수 없습니다. 다시 시도해 주세요.'); }); return () => { live = false; }; }, []);
  const perform = async (action: () => Promise<YptStatus>) => {
    if (busy) return;
    setBusy(true); setError('');
    try { const next = await action(); setStatus(next); setDraft(next.mapping); window.dispatchEvent(new Event('trinity-ypt-change')); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '열품타 연결에 실패했습니다.'); try { await refresh(); } catch { /* Keep the error visible. */ } }
    finally { setBusy(false); }
  };
  const connect = () => {
    if (!status?.connected && readStudyClock()) { setError('진행 중인 TRINITY 타이머를 먼저 종료해 주세요.'); return; }
    void perform(async () => { try { const next = await connectYpt(email, password); setShowReconnect(false); return next; } finally { setPassword(''); } });
  };
  const disconnect = () => {
    if (readStudyClock()) { setError('진행 중인 TRINITY 타이머를 먼저 종료해 주세요.'); return; }
    if (!window.confirm('열품타 연결을 해제할까요? 기존 공부 기록은 남습니다.')) return;
    void perform(disconnectYpt);
  };
  const resolve = () => {
    if (!window.confirm('열품타 앱에서 실행 중인 타이머를 직접 정지했나요? 확인 후에만 상태를 복구합니다.')) return;
    void perform(resolveYpt);
  };
  return <section className="ypt-settings" aria-labelledby="ypt-settings-title">
    <h3 id="ypt-settings-title">열품타 타이머 연동</h3>
    {!status && <p>연결 상태를 확인하는 중입니다.</p>}
    {status && (!status.connected || showReconnect) && <>
      <p>{status.connected ? '로그인을 갱신합니다. 진행 중인 타이머의 시작 시각은 유지됩니다.' : '열품타 앱의 타이머를 정지한 뒤 연결해 주세요.'} 비밀번호는 저장하지 않습니다.</p>
      <div className="ypt-connect-form"><label>이메일<input type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} /></label><label>비밀번호<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></label><button type="button" disabled={busy || !email.trim() || !password} onClick={connect}>열품타 연결</button></div>
    </>}
    {status?.connected && <>
      <p>상태: {status.state === 'idle' ? '정지' : status.state === 'running' ? '공부 중' : '확인 필요'} · 과목 매핑은 타이머가 정지된 동안 바꿀 수 있습니다.</p>
      <div className="ypt-mapping">{SUBJECTS.map(subject => <label key={subject}>{subject}<select value={draft[subject] ?? ''} disabled={busy || status.state !== 'idle'} onChange={event => setDraft(value => ({ ...value, [subject]: event.target.value }))}><option value="">연동 안 함</option>{status.subjects.map(title => <option key={title} value={title}>{title}</option>)}</select></label>)}</div>
      <div className="ypt-settings-actions"><button type="button" disabled={busy || status.state !== 'idle'} onClick={() => void perform(() => saveYptMapping(draft))}>과목 저장</button><button type="button" disabled={busy || status.state !== 'idle'} onClick={disconnect}>연결 해제</button>{status.state !== 'idle' && <button type="button" disabled={busy} onClick={resolve}>앱에서 정지 후 상태 복구</button>}</div>
      <button type="button" disabled={busy} onClick={() => setShowReconnect(value => !value)}>{showReconnect ? '재연결 닫기' : '로그인 갱신·과목 새로고침'}</button>
      {status.state !== 'idle' && <p>열품타 앱에서 정지 여부를 확인해 주세요. 상태 복구 시 TRINITY의 실행 중인 구간은 타이머 화면에서 확인해야 합니다.</p>}
    </>}
    {error && <p role="alert" className="ypt-error">{error}</p>}
    {!status && <button type="button" disabled={busy} onClick={() => void refresh().catch(() => setError('연결 상태를 확인할 수 없습니다.'))}>다시 확인</button>}
  </section>;
}
