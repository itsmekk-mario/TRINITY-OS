import { useEffect, useRef, useState } from 'react';
import { BarChart3, BookOpenCheck, CalendarDays, CalendarRange, Clock3, Crosshair, Database, Download, FileText, Gauge, LayoutDashboard, Menu, Settings, ShieldCheck, Upload, X } from 'lucide-react';
import type { AppData } from './types';
import { downloadBackup, loadData, parseBackup, saveData } from './lib/storage';
import { APP_VERSION } from './data/config';
import Dashboard from './pages/Dashboard';
import Routine from './pages/Routine';
import CalendarPage from './pages/CalendarPage';
import TimerPage from './pages/TimerPage';
import ScoreTracker from './pages/ScoreTracker';
import Resources from './pages/Resources';
import PlaireReview from './pages/PlaireReview';
import Statistics from './pages/Statistics';
import WeeklyDrill from './pages/WeeklyDrill';
import PlanningPage from './pages/PlanningPage';
import NotionWorkspace from './pages/NotionWorkspace';
import CloudflareSync from './components/CloudflareSync';
import LoginPage from './components/LoginPage';
import { logoutLocal, validateSession } from './lib/auth';
import { loadCloudflareConfig } from './lib/cloudflare';

const nav = [
  ['dashboard','Dashboard',LayoutDashboard],['plans','Weekly · Monthly Plan',CalendarRange],['calendar','Calendar',CalendarDays],['routine','Daily Routine',BookOpenCheck],['timer','Study Timer',Clock3],['notion','Notion',FileText],['scores','Score Tracker',Gauge],['resources','Resource Database',Database],['drill','Weekly Drill',Crosshair],['plaire','Review Hub',ShieldCheck],['statistics','Statistics',BarChart3],
] as const;

export default function App() {
  const [page,setPage]=useState('dashboard'); const [data,setData]=useState<AppData>(loadData); const [menu,setMenu]=useState(false); const [settings,setSettings]=useState(false); const [toast,setToast]=useState(''); const fileRef=useRef<HTMLInputElement>(null); const [authenticated,setAuthenticated]=useState(Boolean(loadCloudflareConfig().token));
  useEffect(()=>saveData(data),[data]);
  useEffect(()=>{if(authenticated)validateSession().then(ok=>{if(!ok){logoutLocal();setAuthenticated(false)}})},[authenticated]);
  const update=(fn:(value:AppData)=>AppData)=>setData((value)=>fn(value));
  const navigate=(next:string)=>{setPage(next);setMenu(false);window.scrollTo({top:0,behavior:'smooth'})};
  const importData=async(file?:File)=>{if(!file)return;try{setData(await parseBackup(file));setToast('백업 데이터를 복원했습니다.');setSettings(false)}catch(e){setToast(e instanceof Error?e.message:'가져오기에 실패했습니다.')}finally{setTimeout(()=>setToast(''),2200)}};
  const screen=page==='dashboard'?<Dashboard data={data} update={update} navigate={navigate}/>:page==='plans'?<PlanningPage data={data} update={update}/>:page==='calendar'?<CalendarPage data={data} update={update}/>:page==='routine'?<Routine data={data} update={update}/>:page==='timer'?<TimerPage data={data} update={update}/>:page==='notion'?<NotionWorkspace data={data} update={update}/>:page==='scores'?<ScoreTracker data={data} update={update}/>:page==='resources'?<Resources data={data} update={update}/>:page==='drill'?<WeeklyDrill data={data} update={update}/>:page==='plaire'?<PlaireReview data={data} update={update}/>:<Statistics data={data}/>;
  if(!authenticated)return <LoginPage onAuthenticated={()=>setAuthenticated(true)}/>;
  return <div className="app-shell">
    <aside className={menu?'open':''}><div className="brand"><div className="brand-mark">T</div><div><strong>TRINITY OS</strong><span>Personal Learning OS</span></div><button className="mobile-close" onClick={()=>setMenu(false)}><X/></button></div><nav>{nav.map(([id,label,Icon],index)=><button key={id} className={page===id?'active':''} onClick={()=>navigate(id)}><Icon size={19}/><span>{label}</span>{index===7&&<i>CORE</i>}</button>)}</nav><div className="aside-footer"><blockquote>盡人事待天命</blockquote><p>Do the work. Accept the result.</p><button onClick={()=>setSettings(true)}><Settings size={17}/> 데이터 및 설정</button></div></aside>
    {menu&&<div className="nav-backdrop" onClick={()=>setMenu(false)}/>}<main><div className="mobile-bar"><button onClick={()=>setMenu(true)}><Menu/></button><strong>TRINITY OS</strong><button onClick={()=>setSettings(true)}><Settings/></button></div><div className="page-wrap">{screen}</div></main>
    {settings&&<div className="modal-backdrop" onClick={()=>setSettings(false)}><div className="modal settings-modal" onClick={(e)=>e.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">SYSTEM</p><h2>데이터 및 설정</h2></div><button onClick={()=>setSettings(false)}><X/></button></div><div className="inline-settings"><label><span>수능 날짜</span><input type="date" value={data.examDate} onChange={(e)=>setData({...data,examDate:e.target.value})}/></label><label><span>오늘의 문장 · 한 줄에 하나</span><textarea rows={5} value={data.quotes.join('\n')} onChange={(e)=>setData({...data,quotes:e.target.value.split('\n').filter(Boolean)})}/></label></div><CloudflareSync data={data} update={update}/><div className="settings-list"><button onClick={()=>downloadBackup(data)}><Download/><span><b>데이터 백업</b><small>모든 기록을 JSON 파일로 내보냅니다.</small></span></button><button onClick={()=>fileRef.current?.click()}><Upload/><span><b>백업 복원</b><small>다른 기기의 TRINITY OS 데이터를 가져옵니다.</small></span></button><input ref={fileRef} hidden type="file" accept="application/json" onChange={(e)=>importData(e.target.files?.[0])}/></div><div className="privacy-note"><ShieldCheck/><div><b>기기 내 저장</b><p>LocalStorage가 기본이며, Cloudflare Worker 연결 시 기기 간 동기화를 지원합니다.</p></div></div><footer>TRINITY OS v{APP_VERSION}</footer></div></div>}
    {toast&&<div className="toast">{toast}</div>}
  </div>;
}
