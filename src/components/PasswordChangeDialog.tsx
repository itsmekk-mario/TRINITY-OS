import { KeyRound, X } from 'lucide-react';
import { useState } from 'react';
import { changePassword } from '../lib/auth';

export default function PasswordChangeDialog({ required = false, onClose, onChanged }: {
  required?: boolean;
  onClose?: () => void;
  onChanged: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus('');
    if (newPassword.length < 8) return setStatus('새 비밀번호는 8자 이상이어야 합니다.');
    if (newPassword !== confirmation) return setStatus('새 비밀번호가 서로 일치하지 않습니다.');
    setBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      onChanged();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '비밀번호 변경에 실패했습니다.');
    } finally { setBusy(false); }
  };

  return <div className="modal-backdrop password-change-backdrop" onClick={() => !required && onClose?.()}>
    <section className="modal password-change-modal" role="dialog" aria-modal="true" aria-labelledby="password-change-title" onClick={(event) => event.stopPropagation()}>
      <div className="modal-head">
        <div><p className="eyebrow">ACCOUNT SECURITY</p><h2 id="password-change-title">{required ? '새 비밀번호를 설정하세요' : '비밀번호 변경'}</h2></div>
        {!required && <button type="button" aria-label="닫기" onClick={onClose}><X/></button>}
      </div>
      <p className="password-change-description">{required ? '관리자가 발급한 초기 비밀번호는 첫 로그인 후 변경해야 합니다.' : '현재 비밀번호를 확인한 뒤 새 비밀번호로 변경합니다.'}</p>
      <form className="password-change-form" onSubmit={submit}>
        <label><span>현재 비밀번호</span><input type="password" required minLength={8} autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)}/></label>
        <label><span>새 비밀번호</span><input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)}/><small>8자 이상, 현재 비밀번호와 다르게 입력하세요.</small></label>
        <label><span>새 비밀번호 확인</span><input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)}/></label>
        {status && <p className="login-error" role="alert">{status}</p>}
        <button className="button primary" disabled={busy}><KeyRound size={16}/>{busy ? '변경 중…' : '비밀번호 변경'}</button>
      </form>
    </section>
  </div>;
}
