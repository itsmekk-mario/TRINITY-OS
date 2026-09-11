import { KeyRound, LockKeyhole, ServerCog, UserRoundPlus } from 'lucide-react';
import { useState } from 'react';
import { login, register } from '../lib/auth';
import { loadCloudflareConfig } from '../lib/cloudflare';

export default function LoginPage({ onAuthenticated }: { onAuthenticated: () => void }) {
  const saved = loadCloudflareConfig();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [url, setUrl] = useState(saved.url);
  const [showServerSettings, setShowServerSettings] = useState(!saved.url);
  const [username, setUsername] = useState(saved.username || 'trinity');
  const [password, setPassword] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const isRegistering = mode === 'register';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setStatus('');
    try {
      if (!url.trim()) throw new Error('처음 한 번만 Worker 주소를 입력해 주세요.');
      if (password.length < 8) throw new Error('비밀번호는 8자 이상이어야 합니다.');
      if (isRegistering) await register(url, username, password, setupToken);
      else await login(url, username, password);
      onAuthenticated();
    } catch (error) { setStatus(error instanceof Error ? error.message : '로그인에 실패했습니다.'); }
    finally { setBusy(false); }
  };

  return <main className="login-page">
    <aside className="login-aside">
      <div className="login-brand"><div className="brand-mark">T</div><div><strong>TRINITY OS</strong><span>PERSONAL LEARNING OS</span></div></div>
      <div className="login-aside-copy"><p className="eyebrow">STUDY SYSTEM</p><h1>오늘의 기록이<br/>내일의 전략이 됩니다.</h1><p>계획, 실행, 분석을 하나의 학습 흐름으로 관리하세요.</p></div>
      <div className="login-aside-footer"><span>盡人事待天命</span><small>Do the work. Accept the result.</small></div>
    </aside>
    <section className="login-content"><div className="login-panel">
      <div className="login-panel-head"><div><p className="eyebrow">SECURE ACCESS</p><h2>{isRegistering ? '최초 계정 등록' : '다시 만나서 반가워요.'}</h2><p>{isRegistering ? '처음 한 번만 등록 토큰이 필요합니다.' : '아이디와 비밀번호로 바로 시작하세요.'}</p></div><div className="login-panel-icon"><LockKeyhole size={19}/></div></div>
      <div className="login-tabs" role="tablist" aria-label="계정 작업"><button type="button" role="tab" aria-selected={!isRegistering} className={!isRegistering?'active':''} onClick={()=>setMode('login')}>로그인</button><button type="button" role="tab" aria-selected={isRegistering} className={isRegistering?'active':''} onClick={()=>setMode('register')}><UserRoundPlus size={14}/>최초 등록</button></div>
      <form onSubmit={submit} className="login-form">
        {showServerSettings ? <label><span>Worker 주소</span><input type="url" required value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://...workers.dev"/><small>처음 한 번만 입력하면 이 기기에 저장됩니다.</small></label> : <button type="button" className="server-settings" onClick={()=>setShowServerSettings(true)}><ServerCog size={16}/><span>연결된 서버 주소 변경</span></button>}
        <label><span>아이디</span><input required autoCapitalize="none" autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)}/></label>
        <label><span>비밀번호</span><input type="password" required minLength={8} autoComplete={isRegistering?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)}/></label>
        {isRegistering&&<label className="setup-token"><span>최초 등록 토큰</span><input type="password" required value={setupToken} onChange={e=>setSetupToken(e.target.value)} placeholder="SYNC_TOKEN"/><small>새 계정을 처음 만들 때만 필요하며, 이후 로그인에는 사용하지 않습니다.</small></label>}
        <button className="button primary" disabled={busy}><KeyRound size={16}/>{busy?'확인 중…':isRegistering?'계정 등록':'로그인'}</button>{status&&<p className="login-error" role="alert">{status}</p>}
      </form>
      <div className="login-links"><a href="?portal=tutor">선생님 로그인</a><a href="?portal=parent">학부모 로그인</a></div>
    </div></section>
  </main>;
}
