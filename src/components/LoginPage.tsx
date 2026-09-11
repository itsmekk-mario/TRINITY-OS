import { KeyRound, LockKeyhole, ServerCog } from 'lucide-react';
import { useState } from 'react';
import { loginWithApiToken } from '../lib/auth';
import { loadCloudflareConfig } from '../lib/cloudflare';

export default function LoginPage({ onAuthenticated }: { onAuthenticated: () => void }) {
  const saved = loadCloudflareConfig();
  const [url, setUrl] = useState(saved.url);
  const [token, setToken] = useState('');
  const [showServerSettings, setShowServerSettings] = useState(!saved.url);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setStatus('');
    try {
      await loginWithApiToken(url, token);
      onAuthenticated();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  };

  return <main className="login-page"><aside className="login-aside"><div className="login-brand"><div className="brand-mark">T</div><div><strong>TRINITY OS</strong><span>LEARNING OPERATING SYSTEM</span></div></div><div className="login-aside-copy"><p className="eyebrow">PRIVATE WORKSPACE</p><h1>Your study data,<br />kept separate.</h1><p>Use the personal API token issued to you by the administrator.</p></div><div className="login-aside-footer"><span>TRINITY</span><small>Record. Analyze. Improve. Grow.</small></div></aside><section className="login-content"><div className="login-panel"><div className="login-panel-head"><div><p className="eyebrow">SECURE ACCESS</p><h2>Sign in with an API token</h2><p>Your token identifies your own private workspace.</p></div><div className="login-panel-icon"><LockKeyhole size={19} /></div></div><form onSubmit={submit} className="login-form">{showServerSettings ? <label><span>Worker URL</span><input type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://...workers.dev" /><small>This address is saved only on this device.</small></label> : <button type="button" className="server-settings" onClick={() => setShowServerSettings(true)}><ServerCog size={16} /><span>Change Worker URL</span></button>}<label><span>Personal API token</span><input type="password" required autoComplete="current-password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="trinity_pat_..." /></label><button className="button primary" disabled={busy}><KeyRound size={16} />{busy ? 'Checking…' : 'Sign in'}</button>{status && <p className="login-error" role="alert">{status}</p>}</form><div className="login-links"><a href="?portal=teacher">Teacher portal</a><a href="?portal=parent">Parent portal</a></div></div></section></main>;
}
