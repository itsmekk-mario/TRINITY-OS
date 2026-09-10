import { useEffect, useRef, useState } from 'react';
import { loadCloudflareConfig } from '../lib/cloudflare';
import type { TimerSession } from '../types';
import StudyRhythm from './StudyRhythm';

type Auth = { url: string; token: string; role?: string };
type Document = { id: string; title: string; agency: string; year: number; subject: string };
type Account = { id: string; username: string; role: string; active: number };
const base = (url: string) => url.replace(/\/+$/, '');
const errorText = (error: unknown) => error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';
async function api(auth: Auth, path: string, method = 'GET', body?: unknown) {
  const response = await fetch(base(auth.url) + path, { method, headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const value = await response.json() as { error?: string } & Record<string, unknown>;
  if (!response.ok) throw new Error(value.error || `요청 실패 (${response.status})`);
  return value;
}
async function upload(auth: Auth, id: string, file: File) {
  if (file.type !== 'application/pdf') throw new Error('PDF 파일만 업로드할 수 있습니다.');
  if (file.size > 20 * 1024 * 1024) throw new Error('PDF는 20 MB 이하여야 합니다.');
  const response = await fetch(`${base(auth.url)}/api/exams/${id}/file`, { method: 'PUT', headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/pdf' }, body: file });
  if (!response.ok) { const value = await response.json().catch(() => ({})); throw new Error(value.error || 'PDF 업로드에 실패했습니다.'); }
}

export function ExamArchive({ auth = loadCloudflareConfig(), owner = true }: { auth?: Auth; owner?: boolean }) {
  const [docs, setDocs] = useState<Document[]>([]), [filter, setFilter] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [pdf, setPdf] = useState(''), [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState({ title: '', agency: '평가원', year: new Date().getFullYear(), subject: '수학', object_key: '' });
  const refresh = () => api(auth, '/api/exams').then(v => setDocs(v.documents as Document[])).catch(e => setError(errorText(e)));
  useEffect(() => { void refresh(); }, [auth.token]);
  useEffect(() => () => { if (pdf.startsWith('blob:')) URL.revokeObjectURL(pdf); }, [pdf]);
  const open = async (id: string) => { setBusy(true); setError(''); try {
    const doc = await api(auth, `/api/exams/${id}`);
    if (doc.storage === 'supabase') { const response = await fetch(`${base(auth.url)}/api/exams/${id}/file`, { headers: { Authorization: `Bearer ${auth.token}` } }); if (response.ok) setPdf(URL.createObjectURL(await response.blob())); else if (typeof doc.path === 'string' && doc.path.startsWith('exams/')) setPdf(new URL((import.meta.env.BASE_URL || '/') + doc.path, window.location.origin).href); else { const value = await response.json().catch(() => ({})); throw new Error(value.error || 'PDF를 불러오지 못했습니다.'); } }
    else if (typeof doc.path === 'string' && doc.path.startsWith('exams/')) setPdf(new URL((import.meta.env.BASE_URL || '/') + doc.path, window.location.origin).href);
    else throw new Error('PDF 경로가 올바르지 않습니다.');
  } catch (e) { setError(errorText(e)); } finally { setBusy(false); } };
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); setError(''); let createdId = ''; try {
    if (!file) throw new Error('업로드할 PDF를 선택하세요.');
    const created = await api(auth, '/api/exams', 'POST', draft) as { id: string }; createdId = created.id;
    await upload(auth, created.id, file); setDraft({ ...draft, title: '', object_key: '' }); setFile(null); if (inputRef.current) inputRef.current.value = ''; await refresh();
  } catch (e) { if (createdId) await api(auth, `/api/exams/${createdId}`, 'DELETE').catch(() => undefined); setError(errorText(e)); } finally { setBusy(false); } };
  const shown = docs.filter(doc => [doc.title, doc.agency, doc.year, doc.subject].join(' ').toLowerCase().includes(filter.toLowerCase()));
  return <section className="team-panel exam-archive"><h2>기출 PDF 자료실</h2><p>PDF는 비공개 Supabase Storage에 저장됩니다. 관리자와 수학 선생님만 열 수 있습니다.</p><div className="team-tools"><input aria-label="자료 검색" placeholder="기관 · 연도 · 과목 · 시험명 검색" value={filter} onChange={e => setFilter(e.target.value)} /><button className="button" onClick={refresh}>새로고침</button></div>
    {owner && <details open><summary>PDF 업로드</summary><form className="team-panel" onSubmit={submit}><label>시험명<input required value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label><label>기관<select value={draft.agency} onChange={e => setDraft({ ...draft, agency: e.target.value })}>{['평가원', '교육청', '사관학교'].map(v => <option key={v}>{v}</option>)}</select></label><label>연도<input type="number" min="1980" max="2100" value={draft.year} onChange={e => setDraft({ ...draft, year: Number(e.target.value) })} /></label><label>과목<select value={draft.subject} onChange={e => setDraft({ ...draft, subject: e.target.value })}>{['국어', '수학', '영어', '탐구'].map(v => <option key={v}>{v}</option>)}</select></label><label>저장 경로<input required placeholder="2026/kice/math-september.pdf" value={draft.object_key} onChange={e => setDraft({ ...draft, object_key: e.target.value })} /></label><label>PDF 파일<input ref={inputRef} required type="file" accept="application/pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} /></label><button className="button primary" disabled={busy}>{busy ? '업로드 중…' : 'PDF 등록'}</button></form></details>}
    {error && <p className="team-error">{error}</p>}{shown.map(doc => <article className="team-record" key={doc.id}><b>{doc.year} · {doc.agency} · {doc.subject} · {doc.title}</b><button className="button" disabled={busy} onClick={() => open(doc.id)}>PDF 열기</button></article>)}{!shown.length && <p>등록된 PDF가 없습니다.</p>}{pdf && <><button className="button" onClick={() => setPdf('')}>닫기</button><iframe title="기출 PDF" src={pdf} style={{ width: '100%', height: '75vh' }} /></>}</section>;
}

export function SupportOwner() {
  const auth = loadCloudflareConfig(); const [accounts, setAccounts] = useState<Account[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false); const [draft, setDraft] = useState({ username: '', password: '', role: 'tutor' });
  const refresh = () => api(auth, '/api/support/accounts').then(v => setAccounts(v.accounts as Account[])).catch(e => setError(errorText(e))); useEffect(() => { void refresh(); }, []);
  const create = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { await api(auth, '/api/support/accounts', 'POST', draft); setDraft({ ...draft, username: '', password: '' }); await refresh(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } };
  return <main className="team-page"><h1>공유 계정 · PDF 관리</h1><p>학생 계정으로 로그인한 상태에서만 관리할 수 있습니다.</p><form className="team-panel" onSubmit={create}><label>역할<select value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value })}><option value="tutor">수학 선생님</option><option value="parent">학부모</option></select></label><label>아이디<input required maxLength={40} value={draft.username} onChange={e => setDraft({ ...draft, username: e.target.value })} /></label><label>임시 비밀번호<input required type="password" minLength={12} maxLength={256} value={draft.password} onChange={e => setDraft({ ...draft, password: e.target.value })} /></label><button className="button primary" disabled={busy}>공유 계정 생성</button></form>{error && <p className="team-error">{error}</p>}<div className="team-tools"><a href="?portal=tutor">선생님 로그인</a><a href="?portal=parent">학부모 로그인</a></div>{accounts.map(a => <div className="team-record" key={a.id}>{a.username} · {a.role} · {a.active ? '사용 중' : '차단됨'} {a.active === 1 && <button className="button" onClick={async () => { try { await api(auth, '/api/support/accounts', 'PUT', { id: a.id }); await refresh(); } catch (e) { setError(errorText(e)); } }}>접근 차단</button>}</div>)}<ExamArchive auth={auth} /></main>;
}

export default function SupportPortal({ role }: { role: 'tutor' | 'parent' }) {
 const key = `trinity-support:${role}`; const [auth, setAuth] = useState<Auth | null>(() => { try { return JSON.parse(sessionStorage.getItem(key) || 'null') as Auth | null; } catch { return null; } }); const [url, setUrl] = useState(auth?.url ?? ''), [username, setUsername] = useState(''), [password, setPassword] = useState(''), [payload, setPayload] = useState<Record<string, unknown> | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
 const refresh = async () => { if (!auth) return; try { setPayload(await api(auth, '/api/support/data')); } catch (e) { setError(errorText(e)); } }; useEffect(() => { void refresh(); }, [auth?.token]);
 const login = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { const value = await api({ url, token: '' }, '/api/support/login', 'POST', { username, password, role }) as Auth; const next = { url: base(url), token: value.token, role }; sessionStorage.setItem(key, JSON.stringify(next)); setAuth(next); setPassword(''); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } };
 if (!auth) return <main className="team-page"><h1>{role === 'tutor' ? '수학 선생님' : '학부모'} 전용</h1><form className="team-panel" onSubmit={login}><label>Worker URL<input type="url" required value={url} onChange={e => setUrl(e.target.value)} /></label><label>아이디<input required value={username} onChange={e => setUsername(e.target.value)} /></label><label>비밀번호<input type="password" required value={password} onChange={e => setPassword(e.target.value)} /></label><button className="button primary" disabled={busy}>로그인</button></form>{error && <p className="team-error">{error}</p>}</main>;
 const sharedData = payload?.data; const sessions = (sharedData as { sessions?: TimerSession[] } | undefined)?.sessions ?? [];
 return <main className="team-page"><div className="team-tools"><h1>{role === 'tutor' ? '수학 선생님' : '학부모'} 전용</h1><button className="button" onClick={refresh}>새로고침</button><button className="button" onClick={() => { sessionStorage.removeItem(key); setAuth(null); setPayload(null); }}>로그아웃</button></div>{Boolean(sharedData) && <><StudyRhythm sessions={sessions} /><details className="team-record"><summary>공유 데이터 보기</summary><pre>{JSON.stringify(sharedData, null, 2)}</pre></details>{role === 'tutor' && <ExamArchive auth={auth} owner={false} />}</>}{error && <p className="team-error">{error}</p>}</main>;
}
