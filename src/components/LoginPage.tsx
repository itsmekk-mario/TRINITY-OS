import { KeyRound, LockKeyhole, ServerCog } from 'lucide-react';
import { useState } from 'react';
import { login } from '../lib/auth';
import { loadCloudflareConfig } from '../lib/cloudflare';

type EntryRole = 'student' | 'teacher' | 'parent';

const DEFAULT_WORKER_URL = 'https://trinity-os-sync.khk090525.workers.dev';

export default function LoginPage({ onAuthenticated }: { onAuthenticated: () => void }) {
  const saved = loadCloudflareConfig();
  const [role, setRole] = useState<EntryRole>('student');
  const [url, setUrl] = useState(saved.url || DEFAULT_WORKER_URL);
  const [showServerSettings, setShowServerSettings] = useState(false);
  const [username, setUsername] = useState(saved.username || '');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setStatus('');
    try {
      if (!url.trim()) throw new Error('Worker 주소를 입력해 주세요.');
      if (password.length < 8) throw new Error('비밀번호는 8자 이상이어야 합니다.');
      if (role === 'student') {
        await login(url, username, password);
        onAuthenticated();
        return;
      }

      const response = await fetch(`${url.replace(/\/+$/, '')}/api/support/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role: role === 'teacher' ? 'subject_teacher' : 'parent' }),
      });
      const value = await response.json() as { token?: string; error?: string };
      if (!response.ok || !value.token) throw new Error(value.error || '로그인에 실패했습니다.');
      const supportRole = role === 'teacher' ? 'subject_teacher' : 'parent';
      const key = role === 'teacher' ? 'trinity-collab:subject_teacher' : 'trinity-support:parent';
      sessionStorage.setItem(key, JSON.stringify({ url: url.replace(/\/+$/, ''), token: value.token, role: supportRole }));
      window.location.assign(role === 'teacher' ? '?portal=teacher' : '?portal=parent');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '로그인에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const heading = role === 'student'
    ? '내 학습을 운영하세요.'
    : role === 'teacher'
      ? '학생의 성장을 함께 보세요.'
      : '성장의 과정을 함께 확인하세요.';
  const roleLabel = role === 'student' ? '학생' : role === 'teacher' ? '선생님' : '학부모';

  return <main className="login-page">
    <aside className="login-aside">
      <div className="login-brand"><div className="brand-mark">T</div><div><strong>TRINITY OS</strong><span>학습 운영 시스템</span></div></div>
      <div className="login-aside-copy"><p className="eyebrow">학습 성장 시스템</p><h1>기록을 넘어,<br />성장의 과정을 설계합니다.</h1><p>계획부터 실행, 분석과 피드백까지 하나의 학습 시스템으로 연결하세요.</p></div>
      <div className="login-aside-footer"><span>TRINITY</span><small>기록 · 분석 · 개선 · 성장</small></div>
    </aside>
    <section className="login-content">
      <div className="login-panel">
        <div className="login-panel-head"><div><p className="eyebrow">안전한 로그인</p><h2>{heading}</h2><p>기존 아이디와 비밀번호로 로그인하세요.</p></div><div className="login-panel-icon"><LockKeyhole size={19} /></div></div>
        <div className="role-entry" role="tablist" aria-label="로그인 역할">
          <button type="button" className={role === 'student' ? 'active' : ''} onClick={() => setRole('student')}>학생 로그인</button>
          <button type="button" className={role === 'teacher' ? 'active' : ''} onClick={() => setRole('teacher')}>선생님 로그인</button>
          <button type="button" className={role === 'parent' ? 'active' : ''} onClick={() => setRole('parent')}>학부모 로그인</button>
        </div>
        <form onSubmit={submit} className="login-form">
          {showServerSettings
            ? <label><span>Worker 주소</span><input type="url" required value={url} onChange={(event) => setUrl(event.target.value)} /><small>기본 서버가 자동으로 연결되어 있습니다.</small></label>
            : <button type="button" className="server-settings" onClick={() => setShowServerSettings(true)}><ServerCog size={16} /><span>연결 서버 변경</span></button>}
          <label><span>아이디</span><input required autoCapitalize="none" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
          <label><span>비밀번호</span><input type="password" required minLength={8} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <button className="button primary" disabled={busy}><KeyRound size={16} />{busy ? '확인 중…' : `${roleLabel} 로그인`}</button>
          {status && <p className="login-error" role="alert">{status}</p>}
        </form>
      </div>
    </section>
  </main>;
}
