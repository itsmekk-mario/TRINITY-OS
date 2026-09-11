import { useEffect, useState } from 'react';
import { ClipboardPenLine, LogOut, RefreshCw, Users } from 'lucide-react';
import { loadCloudflareConfig } from '../lib/cloudflare';
import TrinityLearningView, { type FeedbackTarget } from '../components/TrinityLearningView';
import { Card, Empty, Field, PageHeader, TextArea } from '../components/Ui';
import type { AppData } from '../types';

type Role = 'subject_teacher' | 'academic_manager';
type Auth = { url: string; token: string; role: Role };
type Assignment = { id: string; student_id: string; subject?: string; role: Role };
type Feedback = { id: string; title?: string; context_type?: string; acknowledgedByStudent?: boolean; created_at: string };
type FeedbackForm = { title: string; categories: string[]; status: string; observation: string; bottleneck: string; action: string; successCriterion: string; comment: string; contextType: FeedbackTarget['type']; contextTargetId: string };
const base = (url: string) => url.replace(/\/+$/, '');
const emptyForm = (): FeedbackForm => ({ title: '', categories: [], status: 'normal', observation: '', bottleneck: '', action: '', successCriterion: '', comment: '', contextType: 'general', contextTargetId: '' });

async function api<T>(auth: Auth, path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(base(auth.url) + path, { method, headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(value.error || `요청에 실패했습니다. (${response.status})`);
  return value;
}

export default function CollaborativePortal({ role }: { role: Role }) {
  const key = `trinity-collab:${role}`, saved = loadCloudflareConfig();
  const [auth, setAuth] = useState<Auth | null>(() => { try { return JSON.parse(sessionStorage.getItem(key) || 'null') as Auth | null; } catch { return null; } });
  const [url, setUrl] = useState(auth?.url || saved.url), [username, setUsername] = useState(''), [password, setPassword] = useState('');
  const [dashboard, setDashboard] = useState<{ assignments: Assignment[] } | null>(null);
  const [data, setData] = useState<Pick<AppData, 'sessions' | 'scores' | 'wrongAnswerDrills' | 'weeklyCapabilityGoals' | 'dailyDrills' | 'resources'> | null>(null);
  const [feedback, setFeedback] = useState<Feedback[]>([]), [selected, setSelected] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [form, setForm] = useState<FeedbackForm>(emptyForm);

  const refresh = async () => {
    if (!auth) return; setError('');
    try {
      const overview = await api<{ assignments: Assignment[] }>(auth, '/api/collab/dashboard'); setDashboard(overview);
      const id = selected || overview.assignments[0]?.student_id || ''; setSelected(id);
      if (!id) { setData(null); setFeedback([]); return; }
      const [studentData, notes] = await Promise.all([api<{ data: Pick<AppData, 'sessions' | 'scores' | 'wrongAnswerDrills' | 'weeklyCapabilityGoals' | 'dailyDrills' | 'resources'> }>(auth, `/api/collab/students/${id}/data`), api<{ feedback: Feedback[] }>(auth, `/api/collab/students/${id}/feedback`)]);
      setData(studentData.data); setFeedback(notes.feedback);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '학습 데이터를 불러오지 못했습니다.'); }
  };
  useEffect(() => { void refresh(); }, [auth?.token]);

  const login = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { const response = await api<Auth>({ url, token: '', role }, '/api/support/login', 'POST', { username, password, role }); const next = { url: base(url), token: response.token, role }; sessionStorage.setItem(key, JSON.stringify(next)); setAuth(next); setPassword(''); } catch (reason) { setError(reason instanceof Error ? reason.message : '로그인에 실패했습니다.'); } finally { setBusy(false); } };
  const chooseFeedback = (target: FeedbackTarget) => { setForm((current) => ({ ...current, title: target.title, contextType: target.type, contextTargetId: target.targetId ?? '' })); document.getElementById('teacher-feedback-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const submit = async (event: React.FormEvent) => { event.preventDefault(); if (!auth || !selected) return; setBusy(true); setError(''); try { await api(auth, `/api/collab/students/${selected}/feedback`, 'POST', form); setForm(emptyForm()); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : '피드백을 전송하지 못했습니다.'); } finally { setBusy(false); } };
  const assignment = dashboard?.assignments.find((item) => item.student_id === selected) ?? dashboard?.assignments[0];

  if (!auth) return <main className="team-page"><PageHeader eyebrow="TEACHER ACCESS" title={role === 'academic_manager' ? '학업 관리 선생님' : '교과 선생님'} description="학생의 학습 현황을 열람하고 구조화된 피드백을 남깁니다." /><form className="team-panel" onSubmit={login}><label>Worker 주소<input required type="url" value={url} onChange={(event) => setUrl(event.target.value)} /></label><label>아이디<input required value={username} onChange={(event) => setUsername(event.target.value)} /></label><label>비밀번호<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><button className="button primary" disabled={busy}>로그인</button></form>{error && <p className="team-error">{error}</p>}</main>;

  return <main className="team-page collab-page"><div className="teacher-view-toolbar"><div><span className="eyebrow">{role === 'academic_manager' ? 'ACADEMIC MANAGEMENT' : 'SUBJECT TEACHER'}</span><h1>{assignment ? `${assignment.subject ?? '전체 과목'} · 학생 학습 현황` : 'Teacher View'}</h1><p>Teacher View · 학업 데이터만 읽기 전용으로 열람합니다.</p></div><div><button className="button" onClick={() => void refresh()}><RefreshCw size={15} /> 새로고침</button><button className="button" onClick={() => { sessionStorage.removeItem(key); setAuth(null); }}><LogOut size={15} /> 로그아웃</button></div></div>{error && <p className="team-error">{error}</p>}{!assignment ? <Empty><Users size={18} /> 현재 연결된 담당 학생이 없습니다. 관리자에게 assignment 생성을 요청하세요.</Empty> : <>{dashboard && dashboard.assignments.length > 1 && <div className="teacher-student-picker"><label>학생 선택<select value={selected} onChange={(event) => setSelected(event.target.value)}>{dashboard.assignments.map((item) => <option key={item.id} value={item.student_id}>{item.student_id} · {item.subject ?? '전체 과목'}</option>)}</select></label></div>}{data && <TrinityLearningView data={data} viewer={role} focusSubject={role === 'subject_teacher' ? assignment.subject : undefined} name="학생" onFeedback={chooseFeedback} />}<section id="teacher-feedback-form"><Card className="feedback-compose"><div><p className="eyebrow">TEACHER FEEDBACK</p><h2>{form.contextType === 'general' ? '학습 현황에 피드백 남기기' : `피드백: ${form.title}`}</h2><p className="teacher-feedback-context">피드백은 학생 기록을 수정하지 않는 학습 제안입니다.</p></div><form onSubmit={submit}><Field label="제목"><input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="학생이 확인해야 할 핵심을 입력하세요." /></Field><Field label="관찰 내용"><TextArea value={form.observation} onChange={(value) => setForm({ ...form, observation: value })} /></Field><Field label="핵심 병목"><TextArea value={form.bottleneck} onChange={(value) => setForm({ ...form, bottleneck: value })} /></Field><Field label="제안"><TextArea value={form.action} onChange={(value) => setForm({ ...form, action: value })} /></Field><Field label="다음 확인 항목"><TextArea value={form.successCriterion} onChange={(value) => setForm({ ...form, successCriterion: value })} /></Field><Field label="추가 코멘트"><TextArea value={form.comment} onChange={(value) => setForm({ ...form, comment: value })} /></Field><button className="button primary" disabled={busy}><ClipboardPenLine size={16} /> 피드백 전송</button></form></Card></section>{feedback.length > 0 && <Card className="feedback-history"><span className="card-label">FEEDBACK HISTORY</span>{feedback.slice(0, 5).map((item) => <div className="collab-row" key={item.id}><span><b>{item.title ?? '피드백'}</b><small>{item.context_type ?? 'general'} · {item.created_at.slice(0, 10)}</small></span><b>{item.acknowledgedByStudent ? '확인' : '새 피드백'}</b></div>)}</Card>}</>}</main>;
}
