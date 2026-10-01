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

const must = (condition, message) => {
  if (!condition) throw new Error(message);
};

const backupRoot = path.join(
  root,
  `.trinity-library-actions-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`
);
fs.mkdirSync(path.join(backupRoot, 'src/pages'), { recursive: true });
fs.copyFileSync(target, path.join(backupRoot, 'src/pages/ResourceLibrary.tsx'));
fs.copyFileSync(cssPath, path.join(backupRoot, 'src/plan-library.css'));

// 1) Icons: tolerate import ordering and already-patched states.
if (!/\bDownload\b/.test(source.split('\n')[1] ?? '')) {
  source = source.replace(
    /import\s*\{([^}]+)\}\s*from\s*'lucide-react';/,
    (full, icons) => {
      const names = icons.split(',').map((v) => v.trim()).filter(Boolean);
      for (const icon of ['Download', 'Trash2']) {
        if (!names.includes(icon)) names.push(icon);
      }
      names.sort((a, b) => a.localeCompare(b));
      return `import { ${names.join(', ')} } from 'lucide-react';`;
    }
  );
} else if (!/\bTrash2\b/.test(source.split('\n')[1] ?? '')) {
  source = source.replace(
    /import\s*\{([^}]+)\}\s*from\s*'lucide-react';/,
    (full, icons) => {
      const names = icons.split(',').map((v) => v.trim()).filter(Boolean);
      if (!names.includes('Trash2')) names.push('Trash2');
      names.sort((a, b) => a.localeCompare(b));
      return `import { ${names.join(', ')} } from 'lucide-react';`;
    }
  );
}

// 2) Replace the current open helper with fetch/open/download/delete helpers.
// Use stable function boundaries, not the button label text.
if (!source.includes('const downloadResourcePdf=async')) {
  const start = source.indexOf(' const openResourcePdf=async(r:Resource)=>{');
  const end = source.indexOf(' const addOfficial=(r:Resource)=>{', start);
  must(start >= 0 && end > start, 'PDF helper 위치를 찾지 못했습니다.');

  const block = ` const fetchResourceFile=async(r:Resource)=>{
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
  anchor.style.display='none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(()=>URL.revokeObjectURL(href),2000);
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
  source = source.slice(0, start) + block + source.slice(end);
}

// 3) Insert Download immediately after the official PDF-open button.
// Match by handler/disabled props rather than localized label text.
if (!source.includes("disabled={busy||!examDocumentId(active)} onClick={()=>void task(()=>downloadResourcePdf(active))}")) {
  const officialOpen = /(<button className="button primary" disabled=\{busy\|\|!examDocumentId\(active\)\} onClick=\{\(\)=>void task\(\(\)=>openResourcePdf\(active\)\)\}\}>[\s\S]*?<\/button>)/;
  must(officialOpen.test(source), '공용 기출 PDF 열기 버튼을 찾지 못했습니다.');
  source = source.replace(
    officialOpen,
    `$1<button className="button" disabled={busy||!examDocumentId(active)} onClick={()=>void task(()=>downloadResourcePdf(active))}><Download size={15}/>다운로드</button>`
  );
}

// 4) In My Library, wrap the existing PDF-open button with a fragment and append Download.
if (!source.includes('disabled={busy} onClick={()=>void task(()=>downloadResourcePdf(active))}')) {
  const mineOpen = /(\{\(active\.fileId\|\|examDocumentId\(active\)\)&&)(<button className="button primary" disabled=\{busy\} onClick=\{\(\)=>void task\(\(\)=>openResourcePdf\(active\)\)\}\}>[\s\S]*?<\/button>)(\})/;
  must(mineOpen.test(source), '내 자료실 PDF 열기 버튼을 찾지 못했습니다.');
  source = source.replace(
    mineOpen,
    `$1<>$2<button className="button" disabled={busy} onClick={()=>void task(()=>downloadResourcePdf(active))}><Download size={15}/>다운로드</button></>$3`
  );
}

// 5) Add Delete after Daily Plan inside My Library actions.
if (!source.includes('className="button library-delete-button"')) {
  const marker = '><Plus size={15}/>Daily Plan</button></div>';
  must(source.includes(marker), 'Daily Plan 버튼 위치를 찾지 못했습니다.');
  source = source.replace(
    marker,
    '><Plus size={15}/>Daily Plan</button><button className="button library-delete-button" disabled={busy} onClick={()=>void task(()=>deleteResource(active))}><Trash2 size={15}/>삭제</button></div>'
  );
}

// 6) CSS
const cssMarker = '/* Library download / delete actions */';
if (!css.includes(cssMarker)) {
  css += `

${cssMarker}
.library-primary-actions{align-items:center}
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
.library-delete-button:disabled{opacity:.45}
html[data-theme='dark'] .library-delete-button{
  color:#ff8a80!important;
  border-color:rgba(255,138,128,.18)!important;
  background:rgba(255,138,128,.07)!important;
}
@media(max-width:760px){.library-delete-button{margin-left:0}}
`;
}

fs.writeFileSync(target, source, 'utf8');
fs.writeFileSync(cssPath, css, 'utf8');

console.log('✓ Library 삭제/다운로드 기능 적용 완료');
console.log('✓ 공용 기출: PDF 열기 + 다운로드 + 내 자료실 추가');
console.log('✓ 내 자료실: PDF 열기 + 다운로드 + Daily Plan + 삭제');
console.log('✓ 개인 PDF 삭제 시 서버 저장 파일도 삭제');
console.log('✓ 과거 학습 기록은 유지하고 resourceId 연결만 해제');
console.log(`✓ 백업: ${path.basename(backupRoot)}`);
