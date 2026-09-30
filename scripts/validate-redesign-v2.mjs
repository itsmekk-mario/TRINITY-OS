import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const errors=[];const warnings=[];
const exists=p=>fs.existsSync(path.join(root,p));
const text=p=>fs.readFileSync(path.join(root,p),'utf8');
const requireFile=p=>{if(!exists(p))errors.push(`missing ${p}`)};
[
 'src/trinity-redesign-v2.css','src/pages/Dashboard.tsx','src/pages/PlanHub.tsx','src/pages/DailyDrillPanel.tsx',
 'src/pages/ResourceLibrary.tsx','src/pages/Resources.tsx','src/components/DayLabelEditor.tsx','src/components/PlanLinks.tsx',
 'src/components/navigation/HubLayout.tsx','src/components/navigation/SegmentedControl.tsx'
].forEach(requireFile);
if(errors.length){console.error(errors.join('\n'));process.exit(1)}
const main=text('src/main.tsx');
if(!main.includes("import './trinity-redesign-v2.css';"))errors.push('V2 CSS is not imported from src/main.tsx');
const app=text('src/App.tsx');
for(const token of ['desktop-context-bar','skip-link','mobilePrimaryNav','id="main-content"'])if(!app.includes(token))errors.push(`App shell missing ${token}`);
const train=text('src/pages/TrainHub.tsx');
if(!train.includes("{ id: 'notes', label: 'Notes' }"))warnings.push('Handwriting Notes is not visible in Study tabs');
const resource=text('src/pages/Resources.tsx');
if((resource.match(/ResourceLibrary/g)||[]).length<2)errors.push('Resources no longer renders the unified ResourceLibrary');
const css=text('src/trinity-redesign-v2.css');
for(const token of ['today-command-center','plan-flow','daily-execution-panel','library-workspace','@media(max-width:760px)','prefers-reduced-motion'])if(!css.includes(token))errors.push(`CSS missing ${token}`);
const opens=(css.match(/{/g)||[]).length,closes=(css.match(/}/g)||[]).length;
if(opens!==closes)errors.push(`CSS brace mismatch ${opens} != ${closes}`);
if(css.length<50000)warnings.push(`Design layer is unexpectedly small (${css.length} bytes)`);
console.log(`TRINITY redesign validation: ${errors.length?'FAIL':'PASS'}`);
console.log(`CSS: ${(css.length/1024).toFixed(1)} KiB · braces ${opens}/${closes}`);
if(warnings.length)console.warn(warnings.map(x=>`WARN: ${x}`).join('\n'));
if(errors.length){console.error(errors.map(x=>`ERROR: ${x}`).join('\n'));process.exit(1)}
