import './team.css';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { BookMarked, BrainCircuit, CalendarRange, ChartNoAxesCombined, Menu, Download, Gauge, Home, Laptop, MessageSquareText, Moon, NotebookTabs, Settings, ShieldCheck, Sun, Swords, Target, Upload, UserRound, Video, X } from 'lucide-react';
import type { AppData } from './types';
import { downloadBackup, initialData, loadData, parseBackup, restoreBackup, saveData, type ParsedBackup } from './lib/storage';
import { APP_VERSION } from './data/config';
import Dashboard from './pages/Dashboard';
import ScoreTracker from './pages/ScoreTracker';
import NotionWorkspace from './pages/NotionWorkspace';
import CloudflareSync from './components/CloudflareSync';
import LoginPage from './components/LoginPage';
import { logoutLocal, type SessionIdentity, validateSession } from './lib/auth';
import { autoSyncCloudflareData, loadCloudflareConfig } from './lib/cloudflare';
import SupportPortal, { ExamArchive, SupportOwner } from './pages/SupportPortal';
import FeedbackInbox from './pages/FeedbackInbox';

import FeedbackAdmin from './pages/FeedbackAdmin';
import Arena from './pages/Arena';
import PasswordChangeDialog from './components/PasswordChangeDialog';
import PlanHub, { type PlanView } from './pages/PlanHub';
import TrainHub, { type TrainView } from './pages/TrainHub';
import InsightsHub, { type InsightsView } from './pages/InsightsHub';
import CoachPage from './pages/CoachPage';
import PageTransition from './components/motion/PageTransition';
import { useDialogFocus } from './components/motion/useDialogFocus';
import StudyRoom from './pages/StudyRoom';
import { CamStudyProvider } from './components/study-room/CamStudyProvider';
import LearningArchive from './pages/LearningArchive';

const CollaborativePortal = lazy(() => import('./pages/CollaborativePortal'));

type Page =
  | 'today'
  | 'plan'
  | 'train'
  | 'test'
  | 'insights'
  | 'study-room'
  | 'coach'
  | 'feedback'
  | 'workspace'
  | 'profile'
  | 'archive';

const primaryNav = [
  { id: 'today', label: 'Today', icon: Home }, { id: 'plan', label: 'Plan', icon: CalendarRange }, { id: 'train', label: 'Train', icon: Target }, { id: 'test', label: 'Test', icon: Gauge }, { id: 'insights', label: 'Insights', icon: ChartNoAxesCombined },
] as const;
const utilityNav = [
  { id: 'archive', label: 'Learning Archive', icon: BookMarked }, { id: 'study-room', label: 'Study Room', icon: Video }, { id: 'coach', label: 'AI Coach', icon: BrainCircuit }, { id: 'feedback', label: 'Teacher Feedback', icon: MessageSquareText }, { id: 'profile', label: 'Arena', icon: Swords }, { id: 'workspace', label: 'Workspace', icon: NotebookTabs },
] as const;
const paths: Record<Page, string> = { today: '/today', plan: '/plan', train: '/train', test: '/test', insights: '/insights', 'study-room': '/study-room', coach: '/coach', feedback: '/feedback', workspace: '/workspace', profile: '/arena', archive: '/archive' };
const pageFromLocation = (): Page => {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/' || path === '/dashboard' || path === '/today') return 'today';
  if (path === '/arena' || path === '/profile') return 'profile';
  return (Object.entries(paths).find(([, value]) => value === path)?.[0] as Page | undefined) ?? 'today';
};
const queryView = () => new URLSearchParams(window.location.search).get('view');
type ThemePreference = 'system' | 'light' | 'dark';
const THEME_KEY = 'trinity-os:theme-preference';
const getThemePreference = (): ThemePreference => {
  const value = localStorage.getItem(THEME_KEY);
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
};
const resolveTheme = (preference: ThemePreference) =>
  preference === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : preference;

function StudentApp() {
  const [page, setPage] = useState<Page>(pageFromLocation);
  const [planView, setPlanView] = useState<PlanView>(() => (['overview', 'calendar', 'weekly', 'routine'].includes(queryView() ?? '') ? queryView() as PlanView : 'overview'));
  const [trainView, setTrainView] = useState<TrainView>(() => (['timer', 'drill', 'wrong', 'resources'].includes(queryView() ?? '') ? queryView() as TrainView : 'timer'));
  const [insightsView, setInsightsView] = useState<InsightsView>(() => (['overview', 'performance', 'bottlenecks', 'review'].includes(queryView() ?? '') ? queryView() as InsightsView : 'overview'));
  const [data, setData] = useState<AppData>(initialData); const [menu, setMenu] = useState(false); const [settings, setSettings] = useState(false); const [backupPreview,setBackupPreview]=useState<ParsedBackup|null>(null); const [passwordDialog, setPasswordDialog] = useState(false); const [passwordRequired, setPasswordRequired] = useState(Boolean(loadCloudflareConfig().mustChangePassword)); const [toast, setToast] = useState(''); const fileRef = useRef<HTMLInputElement>(null); const [authenticated, setAuthenticated] = useState(Boolean(loadCloudflareConfig().token)); const [identity, setIdentity] = useState<SessionIdentity | null>(null); const syncing = useRef(false); const scrollPositions = useRef(new Map<string, number>()); const [themePreference, setThemePreference] = useState<ThemePreference>(getThemePreference);
  const sidebarRef = useRef<HTMLElement>(null);
  useDialogFocus(menu, sidebarRef, () => setMenu(false));
  const settingsRef = useRef<HTMLElement>(null);
  useDialogFocus(settings, settingsRef, () => setSettings(false));
  const contextLabel = [...primaryNav, ...utilityNav].find((item) => item.id === page)?.label ?? 'Archive';
  const username = loadCloudflareConfig().username || '내 계정';
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const theme = resolveTheme(themePreference);
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0f1115' : '#0b1628');
    };
    applyTheme();
    const onSystemThemeChange = () => { if (themePreference === 'system') applyTheme(); };
    media.addEventListener('change', onSystemThemeChange);
    return () => media.removeEventListener('change', onSystemThemeChange);
  }, [themePreference]);
  useEffect(() => { if (identity) saveData(identity.userId, data); }, [data, identity]);
  useEffect(() => { const retry = () => { if (identity) setData((value) => ({ ...value })); }; window.addEventListener('online', retry); return () => window.removeEventListener('online', retry); }, [identity]);
  useEffect(() => { if (!authenticated) { setIdentity(null); return; } void validateSession().then((profile) => { if (!profile) { logoutLocal(); setAuthenticated(false); return; } setPasswordRequired(Boolean(profile.mustChangePassword)); setData(loadData(profile.userId)); setIdentity(profile); }); }, [authenticated]);
  useEffect(() => { if (!identity) return; const timer = window.setTimeout(async () => { if (syncing.current) return; syncing.current = true; try { const result = await autoSyncCloudflareData(data, identity.userId); if (result.action === 'downloaded' && result.data) { saveData(identity.userId, result.data); setData(result.data); } } catch { /* Local data remains authoritative until the next retry. */ } finally { syncing.current = false; } }, 1500); return () => window.clearTimeout(timer); }, [data, identity]);
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
  const importData = async (file?: File) => { if (!file) return; try { setBackupPreview(await parseBackup(file)); } catch (error) { setToast(error instanceof Error ? error.message : '가져오기에 실패했습니다.'); window.setTimeout(() => setToast(''), 3000); } finally { if(fileRef.current)fileRef.current.value=''; } };
  const confirmImport=async()=>{if(!backupPreview)return;try{const version=backupPreview.version;setData(await restoreBackup(backupPreview));setBackupPreview(null);setToast(version===2?'App Data와 Learning Archive를 복원했습니다.':'App Data를 복원했습니다.');setSettings(false);}catch(error){setToast(error instanceof Error?error.message:'복원에 실패했습니다.');}finally{window.setTimeout(()=>setToast(''),3000)}};
  const exportAll=async()=>{try{await downloadBackup(data);setToast('전체 백업을 다운로드했습니다.');}catch(error){setToast(error instanceof Error?`전체 백업 실패: ${error.message}`:'전체 백업에 실패했습니다.');}finally{window.setTimeout(()=>setToast(''),3000)}};
  const changeTheme = (next: ThemePreference) => {
    localStorage.setItem(THEME_KEY, next);
    setThemePreference(next);
  };
  const screen = page === 'today' ? <Dashboard data={data} update={update} navigate={navigate} /> : page === 'plan' ? <PlanHub data={data} update={update} view={planView} onView={(view) => changeSubview('plan', view, setPlanView)} /> : page === 'train' ? <TrainHub data={data} update={update} view={trainView} onView={(view) => changeSubview('train', view, setTrainView)} /> : page === 'test' ? <ScoreTracker data={data} update={update} /> : page === 'insights' ? <InsightsHub data={data} update={update} view={insightsView} onView={(view) => changeSubview('insights', view, setInsightsView)} /> : page === 'archive' ? <LearningArchive data={data} update={update} onNavigate={navigate} /> : page === 'study-room' ? <StudyRoom data={data} /> : page === 'coach' ? <CoachPage data={data} /> : page === 'feedback' ? <FeedbackInbox data={data} update={update} /> : page === 'workspace' ? <NotionWorkspace data={data} update={update} /> : page === 'profile' ? <Arena data={data} /> : <ExamArchive />;
  if (!authenticated) return <LoginPage onAuthenticated={() => { const config = loadCloudflareConfig(); setAuthenticated(true); setPasswordRequired(Boolean(config.mustChangePassword)); }} />;
  if (!identity) return <main className="login-page" role="status">안전하게 계정을 확인하는 중…</main>;
  return <div className="app-shell learning-shell">
    <aside ref={sidebarRef} tabIndex={menu ? -1 : undefined} role={menu ? 'dialog' : undefined} aria-modal={menu || undefined} aria-label={menu ? '메뉴' : undefined} className={menu ? 'open' : ''}><div className="brand"><div className="brand-mark">T</div><div><strong>TRINITY OS</strong><span>Learning Operating System</span></div><button className="mobile-close" aria-label="메뉴 닫기" onClick={() => setMenu(false)}><X /></button></div><nav className="primary-nav" aria-label="핵심 메뉴">{primaryNav.map(({ id, label, icon: Icon }) => <button key={id} aria-current={page === id ? 'page' : undefined} className={page === id ? 'active' : ''} onClick={() => navigate(id)}><Icon size={19} /><span>{label}</span></button>)}</nav><div className="utility-nav"><span>UTILITY</span>{utilityNav.map(({ id, label, icon: Icon }) => <button key={id} aria-current={page === id ? 'page' : undefined} className={page === id ? 'active' : ''} onClick={() => navigate(id)}><Icon size={17} /><span>{label}</span></button>)}</div><div className="account-area"><button className="account-button" onClick={() => { setMenu(false); setSettings(true); }} aria-label={`${username} 계정 및 설정`}><span className="account-avatar"><UserRound size={19} /></span><span><b>{username}</b><small>Settings</small></span><Settings size={16} /></button></div></aside>
    {menu && <div className="nav-backdrop" onClick={() => setMenu(false)} />}<main><div className="mobile-bar"><button aria-label="메뉴 열기" aria-expanded={menu} onClick={() => setMenu(true)}><Menu /></button><div className="mobile-context"><strong>{contextLabel}</strong><small>{new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}</small></div><button aria-label="설정 열기" onClick={() => setSettings(true)}><Settings /></button></div><div className="page-wrap"><CamStudyProvider data={data} active={page === 'study-room'} onOpen={() => navigate('study-room')}><PageTransition transitionKey={currentKey()}>{screen}</PageTransition></CamStudyProvider></div></main>
    <nav className="mobile-tab-bar" aria-label="핵심 메뉴">{primaryNav.map(({ id, label, icon: Icon }) => <button key={id} aria-current={page === id ? 'page' : undefined} className={page === id ? 'active' : ''} onClick={() => navigate(id)}><Icon /><span>{label}</span></button>)}</nav>
    {settings && <div className="sheet-backdrop settings-sheet-backdrop" onClick={() => setSettings(false)}><aside ref={settingsRef} tabIndex={-1} className="detail-sheet settings-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(event) => event.stopPropagation()}><header><div><p className="eyebrow">SYSTEM</p><h2 id="settings-title">데이터 및 설정</h2></div><button className="icon-button" aria-label="설정 닫기" onClick={() => setSettings(false)}><X /></button></header><div className="sheet-content"><section className="theme-setting" aria-labelledby="theme-setting-title"><div><b id="theme-setting-title">화면 테마</b><p>시스템은 기기 설정을 따르고, 라이트·다크는 직접 고정합니다.</p></div><div className="theme-options" role="group" aria-label="화면 테마 선택"><button className={themePreference === 'system' ? 'active' : ''} aria-pressed={themePreference === 'system'} onClick={() => changeTheme('system')}><Laptop size={16} />시스템</button><button className={themePreference === 'light' ? 'active' : ''} aria-pressed={themePreference === 'light'} onClick={() => changeTheme('light')}><Sun size={16} />라이트</button><button className={themePreference === 'dark' ? 'active' : ''} aria-pressed={themePreference === 'dark'} onClick={() => changeTheme('dark')}><Moon size={16} />다크</button></div></section><div className="inline-settings"><label><span>수능 날짜</span><input type="date" value={data.examDate} onChange={(event) => setData({ ...data, examDate: event.target.value })} /></label><label><span>오늘의 문장 · 한 줄에 하나</span><textarea rows={5} value={data.quotes.join('\n')} onChange={(event) => setData({ ...data, quotes: event.target.value.split('\n').filter(Boolean) })} /></label></div><CloudflareSync data={data} update={update} /><div className="settings-list"><button onClick={() => { setSettings(false); setPasswordDialog(true); }}><Settings /><span><b>비밀번호 변경</b><small>현재 비밀번호를 확인하고 변경합니다.</small></span></button><button onClick={exportAll}><Download /><span><b>전체 백업 다운로드</b><small>Backup v2 · Calendar, Sessions, Scores, Wrong Answer, Learning Archive, Core Rules, Review History 포함</small></span></button><button onClick={() => fileRef.current?.click()}><Upload /><span><b>백업 복원</b><small>파일 내용을 미리 확인한 뒤 복원합니다.</small></span></button><input ref={fileRef} hidden type="file" accept="application/json" onChange={(event) => importData(event.target.files?.[0])} /></div>{backupPreview&&<section className="backup-preview"><b>복원 미리보기 · Backup v{backupPreview.version}</b><p>Calendar {Object.keys(backupPreview.app.calendar).length} · Sessions {backupPreview.app.sessions.length} · Scores {backupPreview.app.scores.length} · Wrong Answer {backupPreview.app.wrongAnswerDrills.length}</p>{backupPreview.learningArchive?<p>Learning Archive: Entries {backupPreview.learningArchive.entries.length} · Annotations {backupPreview.learningArchive.annotations.length} · Core Rules {backupPreview.learningArchive.coreRules.length} · Rule Links {backupPreview.learningArchive.ruleLinks.length} · Reviews {backupPreview.learningArchive.reviews.length}</p>:<p>Learning Archive 데이터는 포함되어 있지 않습니다.</p>}<div className="backup-preview-actions"><button type="button" onClick={()=>setBackupPreview(null)}>취소</button><button type="button" onClick={confirmImport}>복원 실행</button></div></section>}<div className="privacy-note"><ShieldCheck /><div><b>계정별 전체 백업</b><p>App Data는 기기에, Learning Archive는 로그인한 학생 계정의 D1 데이터에 복원됩니다.</p></div></div></div><footer>TRINITY OS v{APP_VERSION}</footer></aside></div>}
    {(passwordRequired || passwordDialog) && <PasswordChangeDialog required={passwordRequired} onClose={() => setPasswordDialog(false)} onChanged={() => { setPasswordRequired(false); setPasswordDialog(false); setToast('비밀번호를 변경했습니다.'); }} />}{toast && <div className="toast" role="status">{toast}</div>}
  </div>;
}

export default function App() {
  const portal = new URLSearchParams(window.location.search).get('portal');
  if (portal === 'teacher' || portal === 'tutor') return <Suspense fallback={<main className="team-page" role="status">교사 포털을 불러오는 중…</main>}><CollaborativePortal role="subject_teacher" /></Suspense>;
  if (portal === 'english-teacher') return <Suspense fallback={<main className="team-page" role="status">교사 포털을 불러오는 중…</main>}><CollaborativePortal role="subject_teacher" subjectHint="영어" /></Suspense>;
  if (portal === 'manager') return <Suspense fallback={<main className="team-page" role="status">교사 포털을 불러오는 중…</main>}><CollaborativePortal role="academic_manager" /></Suspense>;
  if (portal === 'admin' || portal === 'owner') return <FeedbackAdmin />;
  if (portal === 'legacy-owner') return <SupportOwner />;
  if (portal === 'parent') return <SupportPortal role="parent" />;
  return <StudentApp />;
}
