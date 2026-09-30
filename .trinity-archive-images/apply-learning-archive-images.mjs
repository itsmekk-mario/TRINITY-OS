import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const write = (p, value) => fs.writeFileSync(path.join(root, p), value, 'utf8');
function mustReplace(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`${label}: expected source block not found`);
  return source.replace(from, to);
}
function mustReplaceRegex(source, regex, to, label) {
  if (!regex.test(source)) throw new Error(`${label}: expected source pattern not found`);
  regex.lastIndex = 0;
  return source.replace(regex, to);
}

// 1) Shared image type naming.
{
  const file = 'src/types.ts';
  let s = read(file);
  s = mustReplace(
    s,
    "export type WrongAnswerImage = { provider: 'supabase'; bucket: string; path: string; name: string; mime: 'image/jpeg'; width: number; height: number; size: number; createdAt: string };",
    "export type StoredLearningImage = { provider: 'supabase'; bucket: string; path: string; name: string; mime: 'image/jpeg'; width: number; height: number; size: number; createdAt: string };\nexport type WrongAnswerImage = StoredLearningImage;",
    'types: stored learning image alias',
  );
  write(file, s);
}

// 2) Reuse the existing image compressor/uploader for Archive scope.
{
  const file = 'src/lib/problemImage.ts';
  let s = read(file);
  s = mustReplace(
    s,
    'export async function uploadProblemImage(image: PreparedProblemImage): Promise<WrongAnswerImage> {',
    "export async function uploadProblemImage(image: PreparedProblemImage, scope: 'wrong-answer' | 'archive' = 'wrong-answer'): Promise<WrongAnswerImage> {",
    'problemImage: scoped upload signature',
  );
  s = mustReplace(
    s,
    "  const query = new URLSearchParams({\n    name: image.name,\n    width: String(image.width),\n    height: String(image.height),\n  });",
    "  const query = new URLSearchParams({\n    name: image.name,\n    width: String(image.width),\n    height: String(image.height),\n    scope,\n  });",
    'problemImage: scoped query',
  );
  write(file, s);
}

// 3) Worker Storage endpoint: archive namespace + backward-compatible legacy paths.
{
  const file = 'worker/src/problem-images.ts';
  let s = read(file);
  s = mustReplace(
    s,
    "const safeDimension=(value:string|null)=>{const n=Number(value);return Number.isFinite(n)&&n>0&&n<=12000?Math.round(n):0};\nconst encodePath=(value:string)=>value.split('/').map(encodeURIComponent).join('/');",
    "const safeDimension=(value:string|null)=>{const n=Number(value);return Number.isFinite(n)&&n>0&&n<=12000?Math.round(n):0};\nconst safeScope=(value:string|null)=>value==='archive'?'archive':'wrong-answer';\nconst encodePath=(value:string)=>value.split('/').map(encodeURIComponent).join('/');",
    'worker image: scope helper',
  );
  s = mustReplace(
    s,
    "function ownedPath(path:string,userId:number){\n  return path.startsWith(`${userId}/`) && /^\\d+\\/\\d{4}-\\d{2}-\\d{2}\\/[a-f0-9]{32}\\.jpg$/.test(path);\n}",
    "function ownedPath(path:string,userId:number){\n  if(!path.startsWith(`${userId}/`))return false;\n  return /^\\d+\\/(?:wrong-answer|archive)\\/\\d{4}-\\d{2}-\\d{2}\\/[a-f0-9]{32}\\.jpg$/.test(path)\n    || /^\\d+\\/\\d{4}-\\d{2}-\\d{2}\\/[a-f0-9]{32}\\.jpg$/.test(path);\n}",
    'worker image: ownership path',
  );
  s = mustReplace(
    s,
    "    const today=new Date().toISOString().slice(0,10),path=`${user.id}/${today}/${h.randomHex(16)}.jpg`;",
    "    const scope=safeScope(url.searchParams.get('scope')),today=new Date().toISOString().slice(0,10),path=`${user.id}/${scope}/${today}/${h.randomHex(16)}.jpg`;",
    'worker image: scoped object path',
  );
  write(file, s);
}

// 4) Frontend Archive API type.
{
  const file = 'src/lib/archiveApi.ts';
  let s = read(file);
  if (!s.startsWith("import type { WrongAnswerImage } from '../types';")) {
    s = "import type { WrongAnswerImage } from '../types';\n" + s;
  }
  s = mustReplace(
    s,
    "reviewEnabled:boolean;wrongAnswerId?:string|null;nextReviewAt?:string;reviewBucket?:'today'|'overdue'|'upcoming';annotations:Annotation[];coreRules:CoreRule[]};",
    "reviewEnabled:boolean;images:WrongAnswerImage[];wrongAnswerId?:string|null;nextReviewAt?:string;reviewBucket?:'today'|'overdue'|'upcoming';annotations:Annotation[];coreRules:CoreRule[]};",
    'archiveApi: entry images',
  );
  write(file, s);
}

// 5) D1 schema declaration for new installs.
{
  const file = 'worker/schema.sql';
  let s = read(file);
  s = mustReplace(
    s,
    "  review_enabled INTEGER NOT NULL DEFAULT 0 CHECK(review_enabled IN (0,1)),\n  created_at TEXT NOT NULL,",
    "  review_enabled INTEGER NOT NULL DEFAULT 0 CHECK(review_enabled IN (0,1)),\n  images_json TEXT NOT NULL DEFAULT '[]',\n  created_at TEXT NOT NULL,",
    'schema: archive images_json',
  );
  write(file, s);
}

// 6) Archive API persistence, backup/export/import, and live D1 migration.
{
  const file = 'worker/src/archive.ts';
  let s = read(file);

  s = mustReplace(
    s,
    'reviewEnabled:Boolean(row.review_enabled),createdAt:row.created_at,updatedAt:row.updated_at,wrongAnswerId:row.wrong_answer_id??null});',
    'reviewEnabled:Boolean(row.review_enabled),images:parseJson(row.images_json,[]),createdAt:row.created_at,updatedAt:row.updated_at,wrongAnswerId:row.wrong_answer_id??null});',
    'archive worker: entryOut images',
  );

  s = mustReplace(
    s,
    "const optionalDate=(v:unknown)=>{if(v!==undefined&&v!==null&&!iso(v))throw new Error('INVALID_BACKUP')};\nfunction arrayOf(value:unknown,max:number){if(!Array.isArray(value)||value.length>max)throw new Error('INVALID_BACKUP');return value as Record<string,unknown>[]}",
    "const optionalDate=(v:unknown)=>{if(v!==undefined&&v!==null&&!iso(v))throw new Error('INVALID_BACKUP')};\nfunction storedImages(value:unknown,code:'INVALID_ENTRY'|'INVALID_BACKUP'){\n if(value===undefined||value===null)return [];\n if(!Array.isArray(value)||value.length>6)throw new Error(code);\n return value.map(raw=>{\n  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error(code);\n  const item=raw as Record<string,unknown>,provider=clean(item.provider,20),bucket=clean(item.bucket,100),objectPath=clean(item.path,300),name=clean(item.name,180),mime=clean(item.mime,40),createdAt=clean(item.createdAt,40),width=Number(item.width),height=Number(item.height),size=Number(item.size);\n  if(provider!=='supabase'||!bucket||!objectPath||!name||mime!=='image/jpeg'||!Number.isInteger(width)||width<1||width>12000||!Number.isInteger(height)||height<1||height>12000||!Number.isInteger(size)||size<1||size>2*1024*1024||!iso(createdAt))throw new Error(code);\n  return {provider:'supabase',bucket,path:objectPath,name,mime:'image/jpeg',width,height,size,createdAt};\n });\n}\nfunction arrayOf(value:unknown,max:number){if(!Array.isArray(value)||value.length>max)throw new Error('INVALID_BACKUP');return value as Record<string,unknown>[]}",
    'archive worker: stored image validator',
  );

  s = mustReplace(
    s,
    "b.reviewEnabled===true?1:0] as const;",
    "b.reviewEnabled===true?1:0,JSON.stringify(storedImages(b.images,'INVALID_BACKUP'))] as const;",
    'archive worker: imported entry images',
  );
  s = mustReplace(
    s,
    "body.reviewEnabled===true?1:0] as const;",
    "body.reviewEnabled===true?1:0,JSON.stringify(storedImages(body.images,'INVALID_ENTRY'))] as const;",
    'archive worker: runtime entry images',
  );

  s = mustReplace(
    s,
    "key_expression,review_enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET",
    "key_expression,review_enabled,images_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET",
    'archive worker: import insert images column',
  );
  s = mustReplace(
    s,
    "key_expression=excluded.key_expression,review_enabled=excluded.review_enabled,updated_at=excluded.updated_at WHERE archive_entries.user_id=excluded.user_id",
    "key_expression=excluded.key_expression,review_enabled=excluded.review_enabled,images_json=excluded.images_json,updated_at=excluded.updated_at WHERE archive_entries.user_id=excluded.user_id",
    'archive worker: import upsert images',
  );
  s = mustReplace(
    s,
    "key_expression,review_enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,user.id,...values,now,now)",
    "key_expression,review_enabled,images_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,user.id,...values,now,now)",
    'archive worker: runtime insert images',
  );
  s = mustReplace(
    s,
    "key_expression=?,review_enabled=?,updated_at=? WHERE id=? AND user_id=?').bind(...v,new Date().toISOString(),id,user.id)",
    "key_expression=?,review_enabled=?,images_json=?,updated_at=? WHERE id=? AND user_id=?').bind(...v,new Date().toISOString(),id,user.id)",
    'archive worker: runtime update images',
  );

  s = mustReplace(
    s,
    "async function owner(db:D1Database,id:string,userId:number){return db.prepare('SELECT id FROM archive_entries WHERE id=? AND user_id=?').bind(id,userId).first()}\nasync function ensureIntelligence(db:D1Database,userId:number){await ensureLearningGraphReady(db,userId)}",
    "async function owner(db:D1Database,id:string,userId:number){return db.prepare('SELECT id FROM archive_entries WHERE id=? AND user_id=?').bind(id,userId).first()}\nasync function ensureArchiveImageColumn(db:D1Database){const columns=await db.prepare('PRAGMA table_info(archive_entries)').all<{name:string}>();if(columns.results.length&&!columns.results.some(column=>column.name==='images_json'))await db.prepare(\"ALTER TABLE archive_entries ADD COLUMN images_json TEXT NOT NULL DEFAULT '[]'\").run()}\nasync function ensureIntelligence(db:D1Database,userId:number){await ensureLearningGraphReady(db,userId)}",
    'archive worker: live migration helper',
  );
  s = mustReplace(
    s,
    " try{\n  await ensureIntelligence(env.DB,user.id);",
    " try{\n  await ensureArchiveImageColumn(env.DB);\n  await ensureIntelligence(env.DB,user.id);",
    'archive worker: live migration call',
  );

  write(file, s);
}

// 7) Learning Archive UI: multiple photos, edit lifecycle, detail gallery.
{
  const file = 'src/pages/LearningArchive.tsx';
  let s = read(file);

  s = mustReplace(
    s,
    "import { Check,FileText,Link2,Plus,Trash2 } from 'lucide-react';",
    "import { Check,FileText,ImagePlus,Link2,Plus,Trash2 } from 'lucide-react';",
    'LearningArchive: icon import',
  );
  s = mustReplace(
    s,
    "import type { AppData } from '../types';",
    "import type { AppData,WrongAnswerImage } from '../types';\nimport { deleteProblemImage,prepareProblemImage,releasePreparedProblemImage,uploadProblemImage,type PreparedProblemImage } from '../lib/problemImage';\nimport ProblemImageView from '../components/learning/ProblemImageView';",
    'LearningArchive: image imports',
  );
  s = mustReplace(
    s,
    "keyExpression:'',reviewEnabled:false});",
    "keyExpression:'',reviewEnabled:false,images:[] as WrongAnswerImage[]});",
    'LearningArchive: blank images',
  );
  s = mustReplace(
    s,
    " const archiveParams=()=>{",
    " const [archivePreparedImages,setArchivePreparedImages]=useState<PreparedProblemImage[]>([]),[removedArchiveImages,setRemovedArchiveImages]=useState<WrongAnswerImage[]>([]),[archiveImageBusy,setArchiveImageBusy]=useState(false),[archiveImageError,setArchiveImageError]=useState('');\n const archiveParams=()=>{",
    'LearningArchive: image states',
  );

  const oldSave = " const save=async()=>{if(!form.title.trim())return;setBusy(true);try{const payload={...form,month:/\\uC218\\uB2A5/.test(`${form.examName} ${form.sourceName}`)?11:form.month};await archiveApi(editing?`/api/archive/entries/${editing.id}`:'/api/archive/entries',editing?'PATCH':'POST',payload);setOpen(false);setEditing(undefined);setForm(blank());await load()}catch(e){setError(e instanceof Error?e.message:'저장 실패')}finally{setBusy(false)}};\n const remove=async(id:string)=>{if(!window.confirm('이 Archive Entry를 삭제할까요?'))return;await archiveApi(`/api/archive/entries/${id}`,'DELETE');setSelected(undefined);await load()};";
  const newSave = " const releaseArchivePrepared=()=>{archivePreparedImages.forEach(releasePreparedProblemImage);setArchivePreparedImages([])};\n const resetArchiveImageEditor=()=>{releaseArchivePrepared();setRemovedArchiveImages([]);setArchiveImageError('')};\n const startArchiveCreate=()=>{resetArchiveImageEditor();setEditing(undefined);setForm(blank());setOpen(true)};\n const startArchiveEdit=(entry:ArchiveEntry)=>{resetArchiveImageEditor();setEditing(entry);setForm({...blank(),...entry,images:entry.images??[]});setSelected(undefined);setOpen(true)};\n const cancelArchiveEdit=()=>{resetArchiveImageEditor();setOpen(false);setEditing(undefined);setForm(blank())};\n const attachArchiveImages=async(files:FileList|null)=>{if(!files?.length)return;const slots=Math.max(0,6-(form.images?.length??0)-archivePreparedImages.length);if(!slots){setArchiveImageError('Archive Entry에는 사진을 최대 6장까지 첨부할 수 있습니다.');return}setArchiveImageBusy(true);setArchiveImageError('');const next:PreparedProblemImage[]=[];try{for(const file of Array.from(files).slice(0,slots))next.push(await prepareProblemImage(file));setArchivePreparedImages(current=>[...current,...next]);if(files.length>slots)setArchiveImageError(`최대 6장까지만 첨부되어 ${slots}장만 추가했습니다.`)}catch(e){next.forEach(releasePreparedProblemImage);setArchiveImageError(e instanceof Error?e.message:'사진 첨부에 실패했습니다.')}finally{setArchiveImageBusy(false)}};\n const removePreparedArchiveImage=(index:number)=>setArchivePreparedImages(current=>{const target=current[index];if(target)releasePreparedProblemImage(target);return current.filter((_,i)=>i!==index)});\n const removeStoredArchiveImage=(image:WrongAnswerImage)=>{setForm(current=>({...current,images:(current.images??[]).filter(item=>item.path!==image.path)}));setRemovedArchiveImages(current=>current.some(item=>item.path===image.path)?current:[...current,image])};\n const save=async()=>{if(!form.title.trim())return;setBusy(true);setError('');setArchiveImageError('');const uploaded:WrongAnswerImage[]=[];let persisted=false;try{for(const image of archivePreparedImages)uploaded.push(await uploadProblemImage(image,'archive'));const payload={...form,images:[...(form.images??[]),...uploaded],month:/\\uC218\\uB2A5/.test(`${form.examName} ${form.sourceName}`)?11:form.month};await archiveApi(editing?`/api/archive/entries/${editing.id}`:'/api/archive/entries',editing?'PATCH':'POST',payload);persisted=true;await Promise.allSettled(removedArchiveImages.map(image=>deleteProblemImage(image)));resetArchiveImageEditor();setOpen(false);setEditing(undefined);setForm(blank());await load()}catch(e){if(!persisted)await Promise.allSettled(uploaded.map(image=>deleteProblemImage(image)));setError(e instanceof Error?e.message:'저장 실패')}finally{setBusy(false)}};\n const remove=async(id:string)=>{if(!window.confirm('이 Archive Entry를 삭제할까요?'))return;const target=entries.find(entry=>entry.id===id)||selected;setBusy(true);setError('');try{await archiveApi(`/api/archive/entries/${id}`,'DELETE');setSelected(undefined);await Promise.allSettled((target?.images??[]).map(image=>deleteProblemImage(image)));await load()}catch(e){setError(e instanceof Error?e.message:'Archive Entry 삭제 실패')}finally{setBusy(false)}};";
  s = mustReplace(s, oldSave, newSave, 'LearningArchive: save/remove image lifecycle');

  s = mustReplace(
    s,
    "<button className=\"button primary\" onClick={()=>{setEditing(undefined);setForm(blank());setOpen(true)}}><Plus size={16}/>Entry</button>",
    "<button className=\"button primary\" onClick={startArchiveCreate}><Plus size={16}/>Entry</button>",
    'LearningArchive: new entry action',
  );
  s = mustReplace(
    s,
    "<span>Annotation {entry.annotations.length}</span>",
    "<span>Annotation {entry.annotations.length}</span><span>사진 {entry.images?.length??0}</span>",
    'LearningArchive: list photo count',
  );
  s = mustReplace(
    s,
    "{open&&<div className=\"sheet-backdrop\" onClick={()=>setOpen(false)}><aside className=\"detail-sheet archive-editor\" onClick={e=>e.stopPropagation()}><header><h2>{editing?'Entry 수정':'Archive Entry'}</h2><button className=\"icon-button\" onClick={()=>setOpen(false)}>×</button></header>",
    "{open&&<div className=\"sheet-backdrop\" onClick={cancelArchiveEdit}><aside className=\"detail-sheet archive-editor\" onClick={e=>e.stopPropagation()}><header><h2>{editing?'Entry 수정':'Archive Entry'}</h2><button className=\"icon-button\" onClick={cancelArchiveEdit}>×</button></header>",
    'LearningArchive: editor close cleanup',
  );

  s = mustReplace(
    s,
    "</div><Field label=\"메모\"><TextArea value={form.memo}",
    "</div><section className=\"archive-image-editor\"><div className=\"archive-image-editor-head\"><div><b>첨부 사진</b><small>{(form.images?.length??0)+archivePreparedImages.length} / 6 · 문제·지문·해설·풀이 흔적</small></div><label className=\"button\"><ImagePlus size={15}/>{archiveImageBusy?'압축 중…':'사진 추가'}<input type=\"file\" accept=\"image/*\" multiple hidden disabled={archiveImageBusy||(form.images?.length??0)+archivePreparedImages.length>=6} onChange={event=>{void attachArchiveImages(event.target.files);event.currentTarget.value=''}}/></label></div>{archiveImageError&&<p className=\"team-error\">{archiveImageError}</p>}<div className=\"archive-image-grid\">{(form.images??[]).map(image=><figure className=\"archive-image-tile\" key={image.path}><ProblemImageView image={image} className=\"archive-image-preview\" alt={image.name||'Archive 첨부 사진'}/><figcaption><span>{image.name}</span><button type=\"button\" className=\"icon-button danger\" aria-label=\"사진 삭제\" onClick={()=>removeStoredArchiveImage(image)}><Trash2 size={14}/></button></figcaption></figure>)}{archivePreparedImages.map((image,index)=><figure className=\"archive-image-tile pending\" key={`${image.previewUrl}-${index}`}><img className=\"archive-image-preview\" src={image.previewUrl} alt={image.name}/><figcaption><span>{image.name} · {Math.round(image.size/1024)}KB</span><button type=\"button\" className=\"icon-button danger\" aria-label=\"사진 삭제\" onClick={()=>removePreparedArchiveImage(index)}><Trash2 size={14}/></button></figcaption></figure>)}{!(form.images?.length??0)&&!archivePreparedImages.length&&<label className=\"archive-image-empty\"><ImagePlus size={20}/><b>사진 첨부</b><small>최대 6장 · 저장 시 Supabase private Storage 업로드</small><input type=\"file\" accept=\"image/*\" multiple hidden disabled={archiveImageBusy} onChange={event=>{void attachArchiveImages(event.target.files);event.currentTarget.value=''}}/></label>}</div></section><Field label=\"메모\"><TextArea value={form.memo}",
    'LearningArchive: editor image UI',
  );

  s = mustReplace(
    s,
    "</dl><button className=\"button\" onClick={()=>void createWrong(selected)}>",
    "</dl>{selected.images?.length?<div className=\"archive-question-images\"><div className=\"document-section-title compact\"><span>IMG</span><h3>첨부 사진</h3></div><div className=\"archive-image-grid read-only\">{selected.images.map((image,index)=><figure className=\"archive-image-tile\" key={image.path}><ProblemImageView image={image} className=\"archive-image-preview\" alt={`${selected.title} 첨부 사진 ${index+1}`}/><figcaption><span>{image.name}</span></figcaption></figure>)}</div></div>:null}<button className=\"button\" onClick={()=>void createWrong(selected)}>",
    'LearningArchive: detail image gallery',
  );

  s = mustReplace(
    s,
    "<button className=\"button\" onClick={()=>{setEditing(selected);setForm({...blank(),...selected});setSelected(undefined);setOpen(true)}}>문서 수정</button>",
    "<button className=\"button\" onClick={()=>startArchiveEdit(selected)}>문서 수정</button>",
    'LearningArchive: edit action',
  );

  write(file, s);
}

// 8) Styling.
{
  const file = 'src/styles.css';
  let s = read(file);
  const css = `\n\n/* Learning Archive image attachments */\n.archive-image-editor{margin:18px 0;padding:16px;border:1px solid var(--line);border-radius:12px;background:var(--surface,#fff)}\n.archive-image-editor-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.archive-image-editor-head>div{display:grid;gap:3px}.archive-image-editor-head b{font-size:12px}.archive-image-editor-head small{font-size:10px;color:var(--muted)}.archive-image-editor-head .button{position:relative;cursor:pointer}\n.archive-image-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.archive-image-tile{margin:0;min-width:0;overflow:hidden;border:1px solid var(--line);border-radius:10px;background:#fafbfc}.archive-image-tile.pending{border-style:dashed}.archive-image-preview{display:block;width:100%;height:170px;object-fit:contain;background:#f2f4f6}.archive-image-tile figcaption{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:42px;padding:7px 9px;border-top:1px solid var(--line)}.archive-image-tile figcaption span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9px;color:var(--muted)}.archive-image-tile figcaption .icon-button{flex:0 0 auto;width:28px;height:28px}.archive-image-empty{display:grid;place-items:center;align-content:center;gap:5px;min-height:170px;padding:18px;border:1px dashed #cbd3dc;border-radius:10px;color:var(--muted);cursor:pointer;text-align:center}.archive-image-empty b{font-size:12px;color:var(--text)}.archive-image-empty small{font-size:9px;line-height:1.5}.archive-question-images{margin-top:28px;padding-top:4px}.document-section-title.compact{margin-bottom:14px}.archive-image-grid.read-only .archive-image-preview{height:220px}.archive-image-grid.read-only .archive-image-tile{cursor:default}\n@media(max-width:760px){.archive-image-grid{grid-template-columns:1fr 1fr}.archive-image-preview{height:150px}.archive-image-grid.read-only .archive-image-preview{height:190px}.archive-image-editor-head{align-items:flex-start;flex-direction:column}.archive-image-editor-head .button{width:100%;justify-content:center}}\n@media(max-width:440px){.archive-image-grid{grid-template-columns:1fr}.archive-image-preview,.archive-image-grid.read-only .archive-image-preview{height:auto;max-height:320px}}\n`;
  if (!s.includes('/* Learning Archive image attachments */')) s += css;
  write(file, s);
}

console.log('Applied Learning Archive Supabase image attachments.');
console.log('Next: npm run build && npm test');
console.log('Then deploy Worker because archive D1 persistence changed: cd worker && npx wrangler deploy');
