import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const target = path.join(root, 'src/pages/ResourceLibrary.tsx');
const cssPath = path.join(root, 'src/plan-library.css');

if (!fs.existsSync(target) || !fs.existsSync(cssPath)) {
  throw new Error('TRINITY-OS 저장소 루트에서 실행해 주세요.');
}

let source = fs.readFileSync(target, 'utf8');
let css = fs.readFileSync(cssPath, 'utf8');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const replaceOnce = (input, search, replacement, label) => {
  if (input.includes(replacement)) return input;
  assert(input.includes(search), `${label}: 현재 main 코드와 기준점이 다릅니다.`);
  return input.replace(search, replacement);
};

// 1) Icons
source = replaceOnce(
  source,
  "import { AlertCircle, BookOpen, Check, ChevronRight, Clock3, ExternalLink, FileText, Filter, Link2, Minus, Plus, Search, Upload, X } from 'lucide-react';",
  "import { AlertCircle, BookOpen, Check, ChevronRight, Clock3, Download, ExternalLink, FileText, Filter, Link2, Minus, Plus, Search, Trash2, Upload, X } from 'lucide-react';",
  'lucide icon import'
);

// 2) File open / download / delete helpers
const helperStart = source.indexOf(" const openResourcePdf=async(r:Resource)=>{");
const helperEnd = source.indexOf(" const addOfficial=(r:Resource)=>{", helperStart);
assert(helperStart >= 0 && helperEnd > helperStart, 'PDF helper block을 찾지 못했습니다.');

const helperBlock = ` const fetchResourceFile=async(r:Resource)=>{
  const c=loadCloudflareConfig();
  const examId=examDocumentId(r);
  let response:Response;
  if(examId){
   response=await fetch(\`\${c.url.replace(/\\/$/,'')}/api/exams/\${encodeURIComponent(examId)}/file\`,{
    headers:{Authorization:\`Bearer \${c.token}\`}
   });
  }else if(r.fileId){
   response=await request(\`/files?id=\${encodeURIComponent(r.fileId)}\`);
  }else{
   throw new Error('연결된 PDF가 없습니다.');
  }
  if(!response.ok){
   const body=await response.json().catch(()=>({})) as {error?:string};
   throw new Error(body.error||'PDF 요청 실패');
  }
  return response;
 };
 const openResourcePdf=async(r:Resource)=>{
  const response=await fetchResourceFile(r);
  if(pdf)URL.revokeObjectURL(pdf);
  setPdf(URL.createObjectURL(await response.blob()));
 };
 const downloadResourcePdf=async(r:Resource)=>{
  const response=await fetchResourceFile(r);
  const blob=await response.blob();
  const href=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  const clean=(r.name||'TRINITY').replace(/[\\\\/:*?"<>|]+/g,'_').trim()||'TRINITY';
  anchor.href=href;
  anchor.download=clean.toLowerCase().endsWith('.pdf')?clean:\`\${clean}.pdf\`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(()=>URL.revokeObjectURL(href),1500);
 };
 const deleteResource=async(r:Resource)=>{
  const message=r.fileId
   ? \`"\${r.name}"을 삭제할까요? 업로드한 PDF 파일도 서버에서 함께 삭제됩니다.\`
   : \`"\${r.name}"을 내 자료실에서 삭제할까요?\`;
  if(!window.confirm(message))return;

  if(r.fileId){
   await request(\`/files?id=\${encodeURIComponent(r.fileId)}\`,{method:'DELETE'});
  }

  if(pdf){
   URL.revokeObjectURL(pdf);
   setPdf('');
  }

  update(v=>({
   ...v,
   resources:v.resources.filter(item=>item.id!==r.id),
   sessions:v.sessions.map(session=>session.resourceId===r.id?{...session,resourceId:undefined}:session),
   wrongAnswerDrills:v.wrongAnswerDrills.map(item=>item.resourceId===r.id?{...item,resourceId:undefined}:item),
   calendar:Object.fromEntries(Object.entries(v.calendar).map(([key,entry])=>[
    key,
    {...entry,plans:entry.plans?.map(plan=>plan.resourceId===r.id?{...plan,resourceId:undefined}:plan)}
   ]))
  }));
  setSelected('');
 };
`;

source = source.slice(0, helperStart) + helperBlock + source.slice(helperEnd);

// 3) Official library: add Download
const officialOld = `<div className="library-primary-actions"><button className="button primary" disabled={busy||!examDocumentId(active)} onClick={()=>void task(()=>openResourcePdf(active))}><FileText size={15}/>{'PDF \\\\uC5F4\\\\uAE30'}</button><button className="button" disabled={data.resources.some(x=>x.officialId===officialKey(active))} onClick={()=>addOfficial(active)}>`;
const officialNew = `<div className="library-primary-actions"><button className="button primary" disabled={busy||!examDocumentId(active)} onClick={()=>void task(()=>openResourcePdf(active))}><FileText size={15}/>{'PDF \\\\uC5F4\\\\uAE30'}</button><button className="button" disabled={busy||!examDocumentId(active)} onClick={()=>void task(()=>downloadResourcePdf(active))}><Download size={15}/>다운로드</button><button className="button" disabled={data.resources.some(x=>x.officialId===officialKey(active))} onClick={()=>addOfficial(active)}>`;
source = replaceOnce(source, officialOld, officialNew, '공용 기출 다운로드 버튼');

// 4) My library: add Download + Delete
const mineOpen = `{(active.fileId||examDocumentId(active))&&<button className="button primary" disabled={busy} onClick={()=>void task(()=>openResourcePdf(active))}><FileText size={15}/>{'PDF \\\\uC5F4\\\\uAE30'}</button>}`;
const mineOpenNew = `{(active.fileId||examDocumentId(active))&&<><button className="button primary" disabled={busy} onClick={()=>void task(()=>openResourcePdf(active))}><FileText size={15}/>{'PDF \\\\uC5F4\\\\uAE30'}</button><button className="button" disabled={busy} onClick={()=>void task(()=>downloadResourcePdf(active))}><Download size={15}/>다운로드</button></>}`;
source = replaceOnce(source, mineOpen, mineOpenNew, '내 자료실 다운로드 버튼');

const dailyPlanButtonEnd = `}><Plus size={15}/>Daily Plan</button></div>`;
const dailyPlanButtonEndNew = `}><Plus size={15}/>Daily Plan</button><button className="button library-delete-button" disabled={busy} onClick={()=>void task(()=>deleteResource(active))}><Trash2 size={15}/>삭제</button></div>`;
source = replaceOnce(source, dailyPlanButtonEnd, dailyPlanButtonEndNew, '내 자료실 삭제 버튼');

// 5) Styling
const cssMarker = '/* Library download / delete actions */';
if (!css.includes(cssMarker)) {
  css += `

${cssMarker}
.library-primary-actions{
  align-items:center;
}
.library-delete-button{
  margin-left:auto;
  color:#b42318!important;
  border-color:rgba(180,35,24,.18)!important;
  background:rgba(180,35,24,.055)!important;
}
.library-delete-button:hover{
  border-color:rgba(180,35,24,.28)!important;
  background:rgba(180,35,24,.09)!important;
}
.library-delete-button:disabled{
  opacity:.45;
}
html[data-theme='dark'] .library-delete-button{
  color:#ff8a80!important;
  border-color:rgba(255,138,128,.18)!important;
  background:rgba(255,138,128,.07)!important;
}
@media(max-width:760px){
  .library-delete-button{margin-left:0}
}
`;
}

// Backups
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.join(root, `.trinity-library-actions-backup-${stamp}`);
fs.mkdirSync(path.join(backup, 'src/pages'), { recursive: true });
fs.copyFileSync(target, path.join(backup, 'src/pages/ResourceLibrary.tsx'));
fs.copyFileSync(cssPath, path.join(backup, 'src/plan-library.css'));

fs.writeFileSync(target, source, 'utf8');
fs.writeFileSync(cssPath, css, 'utf8');

console.log('✓ Library 삭제/다운로드 기능 적용 완료');
console.log('✓ 공용 기출: PDF 열기 + 다운로드 + 내 자료실 추가');
console.log('✓ 내 자료실: PDF 열기 + 다운로드 + Daily Plan + 삭제');
console.log('✓ 개인 PDF 삭제 시 서버의 PDF 원본도 함께 삭제');
console.log('✓ 기존 학습 기록은 보존하고 resourceId 연결만 해제');
console.log(`✓ 백업: ${path.basename(backup)}`);
