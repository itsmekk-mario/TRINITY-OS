import './team.css';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { BrainCircuit, CalendarRange, ChartNoAxesCombined, Menu, Download, Gauge, Home, MessageSquareText, NotebookTabs, Settings, ShieldCheck, Swords, Target, Upload, UserRound, X } from 'lucide-react';
import type { AppData } from './types';
import { downloadBackup, loadData, parseBackup, saveData } from './lib/storage';
import { APP_VERSION } from './data/config';
import Dashboard from './pages/Dashboard';
import ScoreTracker from './pages/ScoreTracker';
import NotionWorkspace from './pages/NotionWorkspace';
import CloudflareSync from './components/CloudflareSync';
import LoginPage from './components/LoginPage';
import { logoutLocal, validateSession } from './lib/auth';
import { autoSyncCloudflareData, loadCloudflareConfig } from './lib/cloudflare';
import SupportPortal, { ExamArchive, SupportOwner } from './pages/SupportPortal';
import FeedbackInbox from './pages/FeedbackInbox';
import CollaborativePortal from './pages/CollaborativePortal';
import FeedbackAdmin from './pages/FeedbackAdmin';
import Arena from './pages/Arena';
import PasswordChangeDialog from './components/PasswordChangeDialog';
import PlanHub, { type PlanView } from './pages/PlanHub';
import TrainHub, { type TrainView } from './pages/TrainHub';
import InsightsHub, { type InsightsView } from './pages/InsightsHub';
import CoachPage from './pages/CoachPage';
import PageTransition from './components/motion/PageTransition';
import { useDialogFocus } from './components/motion/useDialogFocus';

type Page = 'today' | 'plan' | 'train' | 'test' | 'insights' | 'coach' | 'feedback' | 'workspace' | 'profile' | 'archive';
const primaryNav = [
  { id: 'today', label: 'Today', icon: Home }, { id: 'plan', label: 'Plan', icon: CalendarRange }, { id: 'train', label: 'Train', icon: Target }, { id: 'test', label: 'Test', icon: Gauge }, { id: 'insights', label: 'Insights', icon: ChartNoAxesCombined },
] as const;
const utilityNav = [
  { id: 'coach', label: 'AI Coach', icon: BrainCircuit }, { id: 'feedback', label: 'Teacher Feedback', icon: MessageSquareText }, { id: 'profile', label: 'Arena', icon: Swords }, { id: 'workspace', label: 'Workspace', icon: NotebookTabs },
] as const;
const paths: Record<Page, string> = { today: '/today', plan: '/plan', train: '/train', test: '/test', insights: '/insights', coach: '/coach', feedback: '/feedback', workspace: '/workspace', profile: '/arena', archive: '/archive' };
const pageFromLocation = (): Page => {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/' || path === '/dashboard' || path === '/today') return 'today';
  if (path === '/arena' || path === '/profile') return 'profile';
  return (Object.entries(paths).find(([, value]) => value === path)?.[0] as Page | undefined) ?? 'today';
};
const queryView = () => new URLSearchParams(window.location.search).get('view');

function StudentApp() {
  const [page, setPage] = useState<Page>(pageFromLocation);
  const [planView, setPlanView] = useState<PlanView>(() => (['overview', 'calendar', 'weekly', 'routine'].includes(queryView() ?? '') ? queryView() as PlanView : 'overview'));
  const [trainView, setTrainView] = useState<TrainView>(() => (['timer', 'drill', 'wrong', 'resources'].includes(queryView() ?? '') ? queryView() as TrainView : 'timer'));
  const [insightsView, setInsightsView] = useState<InsightsView>(() => (['overview', 'performance', 'bottlenecks', 'review'].includes(queryView() ?? '') ? queryView() as InsightsView : 'overview'));
  const [data, setData] = useState<AppData>(loadData); const [menu, setMenu] = useState(false); const [settings, setSettings] = useState(false); const [passwordDialog, setPasswordDialog] = useState(false); const [passwordRequired, setPasswordRequired] = useState(Boolean(loadCloudflareConfig().mustChangePassword)); const [toast, setToast] = useState(''); const fileRef = useRef<HTMLInputElement>(null); const [authenticated, setAuthenticated] = useState(Boolean(loadCloudflareConfig().token)); const syncing = useRef(false); const scrollPositions = useRef(new Map<string, number>());
  const sidebarRef = useRef<HTMLElement>(null);
  useDialogFocus(menu, sidebarRef, () => setMenu(false));
  const settingsRef = useRef<HTMLElement>(null);
  useDialogFocus(settings, settingsRef, () => setSettings(false));
  const contextLabel = [...primaryNav, ...utilityNav].find((item) => item.id === page)?.label ?? 'Archive';
  const username = loadCloudflareConfig().username || '내 계정';
  useEffect(() => saveData(data), [data]);
  useEffect(() => { const retry = () => setData((value) => ({ ...value })); window.addEventListener('online', retry); return () => window.removeEventListener('online', retry); }, []);
  useEffect(() => { if (!authenticated) return; const timer = window.setTimeout(async () => { if (syncing.current) return; syncing.current = true; try { const result = await autoSyncCloudflareData(data); if (result.action === 'downloaded' && result.data) { saveData(result.data); setData(result.data); } } catch { /* Local data remains authoritative until the next retry. */ } finally { syncing.current = false; } }, 1500); return () => window.clearTimeout(timer); }, [data, authenticated]);
  useEffect(() => { if (authenticated) void validateSession().then((ok) => { if (!ok) { logoutLocal(); setAuthenticated(false); } }); }, [authenticated]);
  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenu(false); setSettings(false); } }; window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown); }, []);
  useEffect(() => {
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    const onPopState = () => {
      const oldKey = page === 'plan' ? `plan:${planView}` : page === 'train' ? `train:${trainView}` : page === 'insights' ? `insights:${insightsView}` : page;
      scrollPositions.current.set(oldKey, window.scrollY);
      const target = pageFromLocation(); const view = queryView();
      const plan = view && ['overview', 'calendar', 'weekly', 'routine'].includes(view) ? view as PlanView : 'overview';
      const train = view && ['timer', 'drill', 'wrong', 'resources'].includes(view) ? view as TrainView : 'timer';
      const insights = view && ['overview', 'performance', 'bottlenecks', 'review'].includes(view) ? view as InsightsView : 'overview';
      setPage(target); if (target === 'plan') setPlanView(plan); if (target === 'train') setTrainView(train); if (target === 'insights') setInsightsView(insights);
      const key = target === 'plan' ? `plan:${plan}` : target === 'train' ? `train:${train}` : target === 'insights' ? `insights:${insights}` : target;
      window.requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current.get(key) ?? 0, behavior: 'auto' }));
    };
    window.addEventListener('popstate', onPopState);
    return () => { window.removeEventListener('popstate', onPopState); window.history.scrollRestoration = previousRestoration; };
  }, [page, planView, trainView, insightsView]);
  const update = (fn: (value: AppData) => AppData) => setData((value) => fn(value));
  const currentKey = () => page === 'plan' ? `plan:${planView}` : page === 'train' ? `train:${trainView}` : page === 'insights' ? `insights:${insightsView}` : page;
  const applyView = (target: Page, view?: string) => { if (target === 'plan' && view) setPlanView(view as PlanView); if (target === 'train' && view) setTrainView(view as TrainView); if (target === 'insights' && view) setInsightsView(view as InsightsView); };
  const navigate = (targetValue: string) => {
    const [rawPage, requestedView] = targetValue.split(':'); const target = rawPage as Page;
    const view = requestedView ?? (target === 'plan' ? planView : target === 'train' ? trainView : target === 'insights' ? insightsView : undefined);
    if (!(target in paths)) return;
    scrollPositions.current.set(currentKey(), window.scrollY);
    const nextKey = view ? `${target}:${view}` : target; const url = `${paths[target]}${view ? `?view=${encodeURIComponent(view)}` : ''}`;
    const commit = () => { if (`${window.location.pathname}${window.location.search}` !== url) window.history.pushState({}, '', url); flushSync(() => { applyView(target, view); setPage(target); setMenu(false); }); window.requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current.get(nextKey) ?? 0, behavior: 'auto' })); };
    const transitionDocument = document as Document & { startViewTransition?: (callback: () => void) => void };
    if (transitionDocument.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) transitionDocument.startViewTransition(commit); else commit();
  };
  const changeSubview = <T extends string>(target: Page, view: T, setter: (value: T) => void) => { scrollPositions.current.set(currentKey(), window.scrollY); setter(view); window.history.pushState({}, '', `${paths[target]}?view=${encodeURIComponent(view)}`); window.requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current.get(`${target}:${view}`) ?? 0, behavior: 'auto' })); };
  const importData = async (file?: File) => { if (!file) return; try { setData(await parseBackup(file)); setToast('백업 데이터를 복원했습니다.'); setSettings(false); } catch (error) { setToast(error instanceof Error ? error.message : '가져오기에 실패했습니다.'); } finally { window.setTimeout(() => setToast(''), 2200); } };
  const screen = page === 'today' ? <Dashboard data={data} update={update} navigate={navigate} /> : page === 'plan' ? <PlanHub data={data} update={update} view={planView} onView={(view) => changeSubview('plan', view, setPlanView)} /> : page === 'train' ? <TrainHub data={data} update={update} view={trainView} onView={(view) => changeSubview('train', view, setTrainView)} /> : page === 'test' ? <ScoreTracker data={data} update={update} /> : page === 'insights' ? <InsightsHub data={data} update={update} view={insightsView} onView={(view) => changeSubview('insights', view, setInsightsView)} /> : page === 'coach' ? <CoachPage data={data} /> : page === 'feedback' ? <FeedbackInbox data={data} update={update} /> : page === 'workspace' ? <NotionWorkspace data={data} update={update} /> : page === 'profile' ? <Arena data={data} /> : <ExamArchive />;
  if (!authenticated) return <LoginPage onAuthenticated={() => { const config = loadCloudflareConfig(); setAuthenticated(true); setPasswordRequired(Boolean(config.mustChangePassword)); }} />;
  return <div className="app-shell learning-shell">
    <aside ref={sidebarRef} tabIndex={menu ? -1 : undefined} role={menu ? 'dialog' : undefined} aria-modal={menu || undefined} aria-label={menu ? '메뉴' : undefined} className={menu ? 'open' : ''}><div className="brand"><div className="brand-mark">T</div><div><strong>TRINITY OS</strong><span>Learning Operating System</span></div><button className="mobile-close" aria-label="메뉴 닫기" onClick={() => setMenu(false)}><X /></button></div><nav className="primary-nav" aria-label="핵심 메뉴">{primaryNav.map(({ id, label, icon: Icon }) => <button key={id} aria-current={page === id ? 'page' : undefined} className={page === id ? 'active' : ''} onClick={() => navigate(id)}><Icon size={19} /><span>{label}</span></button>)}</nav><div className="utility-nav"><span>UTILITY</span>{utilityNav.map(({ id, label, icon: Icon }) => <button key={id} aria-current={page === id ? 'page' : undefined} className={page === id ? 'active' : ''} onClick={() => navigate(id)}><Icon size={17} /><span>{label}</span></button>)}</div><div className="account-area"><button className="account-button" onClick={() => { setMenu(false); setSettings(true); }} aria-label={`${username} 계정 및 설정`}><span className="account-avatar"><UserRound size={19} /></span><span><b>{username}</b><small>Settings</small></span><Settings size={16} /></button></div></aside>
    {menu && <div className="nav-backdrop" onClick={() => setMenu(false)} />}<main><div className="mobile-bar"><button aria-label="메뉴 열기" aria-expanded={menu} onClick={() => setMenu(true)}><Menu /></button><div className="mobile-context"><strong>{contextLabel}</strong><small>{new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}</small></div><button aria-label="설정 열기" onClick={() => setSettings(true)}><Settings /></button></div><div className="page-wrap"><PageTransition transitionKey={currentKey()}>{screen}</PageTransition></div></main>
    <nav className="mobile-tab-bar" aria-label="핵심 메뉴">{primaryNav.map(({ id, label, icon: Icon }) => <button key={id} aria-current={page === id ? 'page' : undefined} className={page === id ? 'active' : ''} onClick={() => navigate(id)}><Icon /><span>{label}</span></button>)}</nav>
    {settings && <div className="sheet-backdrop settings-sheet-backdrop" onClick={() => setSettings(false)}><aside ref={settingsRef} tabIndex={-1} className="detail-sheet settings-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(event) => event.stopPropagation()}><header><div><p className="eyebrow">SYSTEM</p><h2 id="settings-title">데이터 및 설정</h2></div><button className="icon-button" aria-label="설정 닫기" onClick={() => setSettings(false)}><X /></button></header><div className="sheet-content"><div className="inline-settings"><label><span>수능 날짜</span><input type="date" value={data.examDate} onChange={(event) => setData({ ...data, examDate: event.target.value })} /></label><label><span>오늘의 문장 · 한 줄에 하나</span><textarea rows={5} value={data.quotes.join('\n')} onChange={(event) => setData({ ...data, quotes: event.target.value.split('\n').filter(Boolean) })} /></label></div><CloudflareSync data={data} update={update} /><div className="settings-list"><button onClick={() => { setSettings(false); setPasswordDialog(true); }}><Settings /><span><b>비밀번호 변경</b><small>현재 비밀번호를 확인하고 변경합니다.</small></span></button><button onClick={() => downloadBackup(data)}><Download /><span><b>데이터 백업</b><small>모든 기록을 JSON으로 내보냅니다.</small></span></button><button onClick={() => fileRef.current?.click()}><Upload /><span><b>백업 복원</b><small>기존 TRINITY OS 데이터를 가져옵니다.</small></span></button><input ref={fileRef} hidden type="file" accept="application/json" onChange={(event) => importData(event.target.files?.[0])} /></div><div className="privacy-note"><ShieldCheck /><div><b>기존 데이터 계약 유지</b><p>LocalStorage를 기본으로 사용하고 Cloudflare D1 동기화 형식을 그대로 유지합니다.</p></div></div></div><footer>TRINITY OS v{APP_VERSION}</footer></aside></div>}
    {(passwordRequired || passwordDialog) && <PasswordChangeDialog required={passwordRequired} onClose={() => setPasswordDialog(false)} onChanged={() => { setPasswordRequired(false); setPasswordDialog(false); setToast('비밀번호를 변경했습니다.'); }} />}{toast && <div className="toast" role="status">{toast}</div>}
  </div>;
}

export default function App() {
  const portal = new URLSearchParams(window.location.search).get('portal');
  if (portal === 'teacher' || portal === 'tutor') return <CollaborativePortal role="subject_teacher" />;
  if (portal === 'manager') return <CollaborativePortal role="academic_manager" />;
  if (portal === 'admin' || portal === 'owner') return <FeedbackAdmin />;
  if (portal === 'legacy-owner') return <SupportOwner />;
  if (portal === 'parent') return <SupportPortal role="parent" />;
  return <StudentApp />;
}
