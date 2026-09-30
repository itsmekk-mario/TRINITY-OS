import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root=process.cwd();
const here=path.dirname(fileURLToPath(import.meta.url));
const payload=path.join(here,'payload');
const must=(condition,message)=>{if(!condition)throw new Error(`TRINITY redesign: ${message}`)};
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const write=(p,v)=>{const target=path.join(root,p);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,v,'utf8');};
const copy=(p)=>{const source=path.join(payload,p);must(fs.existsSync(source),`payload missing ${p}`);const target=path.join(root,p);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);};
const replaceOnce=(source,from,to,label)=>{
  if(source.includes(to)) return source;
  must(source.includes(from),`${label}: expected source block not found. Pull latest main, then retry.`);
  return source.replace(from,to);
};
const git=(...args)=>{try{return execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();}catch{return '';}};

must(fs.existsSync(path.join(root,'package.json')),'run this from the TRINITY-OS repository root');
must(fs.existsSync(path.join(root,'src/App.tsx')),'src/App.tsx not found');
must(fs.existsSync(path.join(root,'src/main.tsx')),'src/main.tsx not found');

const head=git('rev-parse','HEAD');
const dirty=git('status','--porcelain');
console.log(`Repository HEAD: ${head||'unknown'}`);
if(dirty) console.warn('Working tree has local changes. They are preserved, but review git diff after applying.');

const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const backup=path.join(root,'.trinity-redesign-backup',stamp);
const targets=[
  'src/main.tsx','src/App.tsx','src/pages/Dashboard.tsx','src/pages/PlanHub.tsx','src/pages/DailyDrillPanel.tsx',
  'src/pages/Resources.tsx','src/pages/ResourceLibrary.tsx','src/components/DayLabelEditor.tsx','src/components/PlanLinks.tsx',
  'src/components/navigation/HubLayout.tsx','src/components/navigation/SegmentedControl.tsx','src/pages/TrainHub.tsx',
];
for(const p of targets){const src=path.join(root,p);if(!fs.existsSync(src))continue;const dest=path.join(backup,p);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(src,dest);}
console.log(`Safety backup: ${path.relative(root,backup)}`);

// Full replacements: these are the intentionally redesigned work surfaces.
for(const p of [
  'src/trinity-redesign-v2.css',
  'src/pages/Dashboard.tsx','src/pages/PlanHub.tsx','src/pages/DailyDrillPanel.tsx',
  'src/pages/Resources.tsx','src/pages/ResourceLibrary.tsx',
  'src/components/DayLabelEditor.tsx','src/components/PlanLinks.tsx',
  'src/components/navigation/HubLayout.tsx','src/components/navigation/SegmentedControl.tsx',
]) copy(p);

// Install the validator into the repository so manual application has the same safety gate.
{
  const validator=path.join(here,'scripts','validate-redesign-v2.mjs');
  must(fs.existsSync(validator),'validator missing');
  const target=path.join(root,'scripts','validate-redesign-v2.mjs');
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(validator,target);
}

// Ensure the V2 design layer loads LAST. This is deliberate: old fragmented CSS remains as compatibility fallback.
{
  let s=read('src/main.tsx');
  if(!s.includes("import './trinity-redesign-v2.css';")){
    const anchors=["import './plan-library.css';","import './monthly-plan.css';","import './mobile.css';"];
    const anchor=anchors.find(a=>s.includes(a));
    must(anchor,'cannot find a stable CSS import anchor in src/main.tsx');
    s=s.replace(anchor,`${anchor}\nimport './trinity-redesign-v2.css';`);
  }
  write('src/main.tsx',s);
}

// App shell: improve labels, navigation grouping, top context, mobile density and keyboard accessibility.
{
  let s=read('src/App.tsx');
  s=s.replace('{ id: "train", label: "Train", icon: Target }','{ id: "train", label: "Study", icon: Target }')
     .replace('{ id: "archive", label: "Learning Archive", icon: BookMarked }','{ id: "archive", label: "Archive", icon: BookMarked }')
     .replace('{ id: "feedback", label: "Teacher Feedback", icon: MessageSquareText }','{ id: "feedback", label: "Feedback", icon: MessageSquareText }')
     .replace('{ id: "workspace", label: "일정", icon: NotebookTabs }','{ id: "workspace", label: "Schedule", icon: NotebookTabs }');

  if(!s.includes('className="nav-section-label"')){
    s=replaceOnce(s,'<nav className="primary-nav" aria-label="핵심 메뉴">','<nav className="primary-nav" aria-label="핵심 메뉴">\n          <span className="nav-section-label">LEARNING FLOW</span>','sidebar section label');
  }
  if(!s.includes('const mobilePrimaryNav')){
    const from='  const visibleUtilityNav = beginnerMode\n    ? utilityNav.filter(({ id }) => id === "workspace")\n    : utilityNav;';
    const to=`${from}\n  // Keep the mobile dock to five primary actions. Archive remains available from the side menu.\n  const mobilePrimaryNav = visiblePrimaryNav.filter(({ id }) => id !== "archive");`;
    s=replaceOnce(s,from,to,'mobile nav derivation');
  }
  if(!s.includes('className="desktop-context-bar"')){
    s=replaceOnce(s,'      <main>\n        <div className="mobile-bar">',`      <main id="main-content">\n        <div className="desktop-context-bar">\n          <div className="desktop-context-copy"><span>TRINITY OS</span><b>{contextLabel}</b></div>\n          <div className="desktop-context-actions">\n            <span>{new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })}</span>\n            <button onClick={() => navigate("train:timer")}><Target size={15}/>공부 시작</button>\n            <button aria-label="설정 열기" onClick={() => setSettings(true)}><Settings size={15}/></button>\n          </div>\n        </div>\n        <div className="mobile-bar">`,'desktop context bar');
  } else if(s.includes('      <main>\n        <div className="desktop-context-bar">')) {
    s=s.replace('      <main>\n        <div className="desktop-context-bar">','      <main id="main-content">\n        <div className="desktop-context-bar">');
  }
  if(!s.includes('className="skip-link"')){
    s=replaceOnce(s,'    <div className="app-shell learning-shell">','    <div className="app-shell learning-shell">\n      <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>','skip link');
  }
  // Replace only the mobile bottom dock mapping, not the sidebar mapping.
  const dockMarker='<nav className="mobile-tab-bar" aria-label="핵심 메뉴">';
  const dockAt=s.indexOf(dockMarker);
  if(dockAt>=0){const tail=s.slice(dockAt);if(tail.includes('{visiblePrimaryNav.map(')){const fixed=tail.replace('{visiblePrimaryNav.map(({ id, label, icon: Icon }) => (','{mobilePrimaryNav.map(({ id, label, icon: Icon }) => (');s=s.slice(0,dockAt)+fixed;}}
  write('src/App.tsx',s);
}

// Study hub: surface handwritten notes instead of leaving the existing route hidden.
{
  let s=read('src/pages/TrainHub.tsx');
  const old="const tabs = [{ id: 'timer', label: 'Timer' }, { id: 'drill', label: 'Drill' }, { id: 'wrong', label: 'Wrong Answers' }, { id: 'resources', label: 'Library' }] as const;";
  const next="const tabs = [{ id: 'timer', label: 'Focus' }, { id: 'drill', label: 'Drill' }, { id: 'wrong', label: 'Wrong Answers' }, { id: 'notes', label: 'Notes' }, { id: 'resources', label: 'Library' }] as const;";
  if(s.includes(old))s=s.replace(old,next);
  else if(!s.includes("{ id: 'notes', label: 'Notes' }")) console.warn('TrainHub tabs changed upstream; Notes tab was not auto-inserted.');
  s=s.replace('title="계획을 실행하고, 행동을 교정합니다" description="집중 학습에서 오답 연습과 재도전까지 이어갑니다."','title="집중하고, 틀린 판단을 교정합니다" description="Focus → Drill → Wrong Answer → Notes → Library가 하나의 실행 흐름으로 이어집니다."');
  write('src/pages/TrainHub.tsx',s);
}

console.log('\nApplied: TRINITY OS System Redesign V2');
console.log('Next checks:');
console.log('  node ./scripts/validate-redesign-v2.mjs');
console.log('  npm run build');
console.log('  git diff --stat && git diff');
