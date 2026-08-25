import { LockKeyhole } from 'lucide-react';
import { useState } from 'react';
import { login, register } from '../lib/auth';
import { loadCloudflareConfig } from '../lib/cloudflare';

export default function LoginPage({ onAuthenticated }: { onAuthenticated: () => void }) {
  const saved = loadCloudflareConfig();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [url, setUrl] = useState(saved.url);
  const [username, setUsername] = useState(saved.username || 'trinity');
  const [password, setPassword] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setStatus('');
    try {
      if (password.length < 8) throw new Error('비밀번호는 8자 이상이어야 합니다.');
      if (mode === 'register') await register(url, username, password, setupToken);
      else await login(url, username, password);
      onAuthenticated();
    } catch (error) { setStatus(error instanceof Error ? error.message : '인증에 실패했습니다.'); }
    finally { setBusy(false); }
  };

  return <main className="login-page"><section className="login-card">
    <div className="login-mark">T</div><p className="eyebrow">PERSONAL LEARNING OPERATING SYSTEM</p>
    <h1>TRINITY OS</h1><p className="login-philosophy">盡人事待天命</p>
    <div className="login-tabs"><button className={mode==='login'?'active':''} onClick={()=>setMode('login')}>로그인</button><button className={mode==='register'?'active':''} onClick={()=>setMode('register')}>최초 계정 등록</button></div>
    <form onSubmit={submit} className="login-form">
      <label><span>Worker URL</span><input type="url" required value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://...workers.dev"/></label>
      <label><span>아이디</span><input required autoCapitalize="none" value={username} onChange={e=>setUsername(e.target.value)}/></label>
      <label><span>비밀번호</span><input type="password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
      {mode==='register'&&<label><span>최초 등록 키</span><input type="password" required value={setupToken} onChange={e=>setSetupToken(e.target.value)} placeholder="기존 SYNC_TOKEN"/><small>계정은 한 개만 등록할 수 있습니다.</small></label>}
      <button className="button primary" disabled={busy}><LockKeyhole size={16}/>{busy?'확인 중…':mode==='login'?'로그인':'계정 등록'}</button>
      {status&&<p className="login-error">{status}</p>}
    </form>
  </section></main>;
}
