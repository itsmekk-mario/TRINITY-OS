import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const here = path.dirname(fileURLToPath(import.meta.url));
const payload = path.join(here, 'payload');

const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const write = (p, value) => {
  const target = path.join(root, p);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
  console.log(`updated ${p}`);
};
const mustContain = (source, needle, label) => {
  if (!source.includes(needle)) throw new Error(`${label}: expected source block not found`);
};
const replaceOnce = (source, from, to, label) => {
  mustContain(source, from, label);
  return source.replace(from, to);
};
const replaceAllChecked = (source, from, to, label, min = 1) => {
  const count = source.split(from).length - 1;
  if (count < min) throw new Error(`${label}: expected at least ${min} matches, found ${count}`);
  return source.split(from).join(to);
};

// Guard against applying on top of the old base64 photo patch.
{
  const source = read('src/types.ts');
  if (source.includes("dataUrl: string")) {
    throw new Error('Old base64 photo patch detected. Apply this consolidated patch on the latest clean main branch instead.');
  }
}

// 1) Shared types: handwriting notes + Supabase image reference only.
{
  const file = 'src/types.ts';
  let source = read(file);
  if (!source.includes('export type WrongAnswerImage')) {
    source = replaceOnce(
      source,
      "export type DrillRetry = { id: '3d' | '7d' | '14d'; label: string; dueDate: string; completedDate?: string };\n",
      "export type DrillRetry = { id: '3d' | '7d' | '14d'; label: string; dueDate: string; completedDate?: string };\n" +
      "export type WrongAnswerImage = { provider: 'supabase'; bucket: string; path: string; name: string; mime: 'image/jpeg'; width: number; height: number; size: number; createdAt: string };\n" +
      "export type HandwritingPoint = { x: number; y: number; pressure: number };\n" +
      "export type HandwritingStroke = { id: string; tool: 'pen' | 'eraser'; color: string; width: number; points: HandwritingPoint[] };\n" +
      "export type HandwritingNote = { id: string; date: string; subject: Subject; inquiryTrack?: InquiryTrack; title: string; strokes: HandwritingStroke[]; createdAt: string; updatedAt: string };\n",
      'types insert',
    );
  }
  source = source.replace(
    /export type WrongAnswerDrill = \{[^\n]+\};/,
    "export type WrongAnswerDrill = { id: string; date: string; subject: Subject; inquiryTrack?: InquiryTrack; source: string; question: string; wrongJudgment: string; missedCue: string; correction: string; transfer: string; scoreId?: string; capabilityGoalId?: string; archiveEntryId?: string; bottleneck?: DrillBottleneck; retries?: DrillRetry[]; problemImage?: WrongAnswerImage };",
  );
  if (!source.includes('handwritingNotes: HandwritingNote[];')) {
    source = replaceOnce(source, '  wrongAnswerDrills: WrongAnswerDrill[];\n', '  wrongAnswerDrills: WrongAnswerDrill[];\n  handwritingNotes: HandwritingNote[];\n', 'AppData handwritingNotes');
  }
  write(file, source);
}

// 2) Initial app data.
{
  const file = 'src/lib/storage.ts';
  let source = read(file);
  if (!source.includes('  handwritingNotes: [],')) {
    source = replaceOnce(source, '  wrongAnswerDrills: [],\n', '  wrongAnswerDrills: [],\n  handwritingNotes: [],\n', 'storage handwritingNotes');
  }
  write(file, source);
}

// 3) App route parser: Train notes subview.
{
  const file = 'src/App.tsx';
  let source = read(file);
  source = replaceAllChecked(
    source,
    '["timer", "drill", "wrong", "resources"]',
    '["timer", "drill", "wrong", "notes", "resources"]',
    'App Train views',
    2,
  );
  write(file, source);
}

// 4) TrainHub: notes tab + authenticated Supabase image viewer.
{
  const file = 'src/pages/TrainHub.tsx';
  let source = read(file);
  if (!source.includes("import HandwritingNotes from './HandwritingNotes';")) {
    source = replaceOnce(source, "import QuickCaptureSheet from '../components/learning/QuickCaptureSheet';\n", "import QuickCaptureSheet from '../components/learning/QuickCaptureSheet';\nimport ProblemImageView from '../components/learning/ProblemImageView';\nimport HandwritingNotes from './HandwritingNotes';\n", 'TrainHub notes/image import');
  }
  source = replaceOnce(source, "export type TrainView = 'timer' | 'drill' | 'wrong' | 'resources';", "export type TrainView = 'timer' | 'drill' | 'wrong' | 'notes' | 'resources';", 'TrainView type');
  source = replaceOnce(source, "const tabs = [{ id: 'timer', label: 'Timer' }, { id: 'drill', label: 'Drill' }, { id: 'wrong', label: 'Wrong Answers' }, { id: 'resources', label: 'Resources' }] as const;", "const tabs = [{ id: 'timer', label: 'Timer' }, { id: 'drill', label: 'Drill' }, { id: 'wrong', label: 'Wrong Answers' }, { id: 'notes', label: 'Notes' }, { id: 'resources', label: 'Resources' }] as const;", 'TrainHub tabs');

  const cardStart = '  const card = (item:WrongAnswerDrill) => ';
  const cardLineStart = source.indexOf(cardStart);
  if (cardLineStart < 0) throw new Error('TrainHub wrong-answer card not found');
  const cardLineEnd = source.indexOf('\n', cardLineStart);
  const nextCard = `  const card = (item:WrongAnswerDrill) => <button className="interactive-card wrong-answer-card" key={item.id} onClick={() => setSelected(item)}>{item.problemImage&&<ProblemImageView image={item.problemImage} className="wrong-card-image" alt="문제 사진"/>}<span className={\`subject-badge \${item.subject}\`}>{item.subject}</span><small>{item.date} · {item.source}</small><h2>{item.question || '문항 미입력'}</h2><div className="math-record-output wrong-card-output"><RichMathText value={item.correction || item.missedCue} fallback="교정 행동을 기록하세요."/></div><span>상세 보기 <ArrowRight size={14} /></span></button>;`;
  source = source.slice(0, cardLineStart) + nextCard + source.slice(cardLineEnd);

  source = replaceOnce(
    source,
    '<div className="sheet-content"><section><b>잘못된 판단</b>',
    '<div className="sheet-content">{selected.problemImage&&<section><b>문제 사진</b><ProblemImageView image={selected.problemImage} className="wrong-detail-image" alt="첨부한 문제"/></section>}<section><b>잘못된 판단</b>',
    'TrainHub detail photo',
  );
  source = replaceOnce(
    source,
    ": view === 'wrong' ? <WrongAnswers data={data} edit={() => onView('drill')} quick={()=>setQuickOpen(true)} /> : <Resources data={data} update={update} />",
    ": view === 'wrong' ? <WrongAnswers data={data} edit={() => onView('drill')} quick={()=>setQuickOpen(true)} /> : view === 'notes' ? <HandwritingNotes data={data} update={update} /> : <Resources data={data} update={update} />",
    'TrainHub notes render',
  );
  write(file, source);
}

// 5) Weekly Drill: prepare locally -> upload to Supabase on save -> sync metadata -> clean replaced object.
{
  const file = 'src/pages/WeeklyDrill.tsx';
  let source = read(file);
  source = replaceOnce(source, "import { Check, ClipboardPenLine, RefreshCw, Sparkles, Target, Trash2 } from 'lucide-react';", "import { Check, ClipboardPenLine, ImagePlus, RefreshCw, Sparkles, Target, Trash2 } from 'lucide-react';", 'WeeklyDrill icon import');
  source = replaceOnce(source, "import type { AppData, DrillBottleneck, DrillRetry, Subject, WeeklyCapabilityGoal, WrongAnswerDrill } from '../types';", "import type { AppData, DrillBottleneck, DrillRetry, Subject, WeeklyCapabilityGoal, WrongAnswerDrill, WrongAnswerImage } from '../types';\nimport { deleteProblemImage, prepareProblemImage, releasePreparedProblemImage, uploadProblemImage, type PreparedProblemImage } from '../lib/problemImage';\nimport ProblemImageView from '../components/learning/ProblemImageView';\nimport { loadCloudflareConfig, uploadCloudflareData } from '../lib/cloudflare';", 'WeeklyDrill photo imports');

  const stateNeedle = "  const [weekStart, setWeekStart] = useState(weekStartKey()); const [goal, setGoal] = useState(goalBlank(weekStartKey())); const [drill, setDrill] = useState(drillBlank()); const [openGoal, setOpenGoal] = useState(false); const [openDrill, setOpenDrill] = useState(false);\n";
  source = replaceOnce(source, stateNeedle, stateNeedle + "  const [imageBusy, setImageBusy] = useState(false); const [imageError, setImageError] = useState(''); const [pendingImage, setPendingImage] = useState<PreparedProblemImage | null>(null); const [originalProblemImage, setOriginalProblemImage] = useState<WrongAnswerImage | undefined>();\n", 'WeeklyDrill image state');

  const setWeekNeedle = "  const setWeek = (value: string) => { setWeekStart(value); setGoal(goalBlank(value)); };\n";
  const helpers = `  const clearPendingImage = () => { if (pendingImage) releasePreparedProblemImage(pendingImage); setPendingImage(null); };\n  const attachProblemImage = async (file?: File) => {\n    if (!file) return;\n    setImageBusy(true); setImageError('');\n    try { const prepared = await prepareProblemImage(file); if (pendingImage) releasePreparedProblemImage(pendingImage); setPendingImage(prepared); }\n    catch (error) { setImageError(error instanceof Error ? error.message : '사진 첨부에 실패했습니다.'); }\n    finally { setImageBusy(false); }\n  };\n  const beginNewDrill = () => { clearPendingImage(); setOriginalProblemImage(undefined); setImageError(''); setDrill(drillBlank()); setOpenDrill(true); };\n  const beginEditDrill = (item: WrongAnswerDrill) => { clearPendingImage(); setOriginalProblemImage(item.problemImage); setImageError(''); setDrill({ ...item }); setOpenDrill(true); window.scrollTo({ top: 0, behavior: 'smooth' }); };\n  const cancelDrill = () => {\n    const uncommitted = drill.problemImage && drill.problemImage.path !== originalProblemImage?.path ? drill.problemImage : undefined;\n    if (uncommitted) void deleteProblemImage(uncommitted).catch(() => undefined);\n    clearPendingImage(); setOriginalProblemImage(undefined); setImageError(''); setDrill(drillBlank()); setOpenDrill(false);\n  };\n`;
  source = replaceOnce(source, setWeekNeedle, setWeekNeedle + helpers, 'WeeklyDrill image helpers');

  const oldSave = "  const saveDrill = () => { if (!drill.source.trim() || !drill.wrongJudgment.trim()) return; update((value) => ({ ...value, wrongAnswerDrills: drill.id ? value.wrongAnswerDrills.map(item => item.id === drill.id ? { ...item, ...drill } : item) : [{ ...drill, id: uid(), retries: retryPlan(drill.date) }, ...value.wrongAnswerDrills] })); setDrill(drillBlank()); setOpenDrill(false); };";
  const newSave = `  const saveDrill = async () => {\n    if (!drill.source.trim() || !drill.wrongJudgment.trim() || imageBusy) return;\n    setImageBusy(true); setImageError('');\n    try {\n      let problemImage = drill.problemImage;\n      if (pendingImage) {\n        problemImage = await uploadProblemImage(pendingImage);\n        setDrill((value) => ({ ...value, problemImage }));\n        releasePreparedProblemImage(pendingImage); setPendingImage(null);\n      }\n      const record: WrongAnswerDrill = drill.id ? { ...drill, problemImage } : { ...drill, id: uid(), retries: retryPlan(drill.date), problemImage };\n      const nextData: AppData = { ...data, wrongAnswerDrills: drill.id ? data.wrongAnswerDrills.map((item) => item.id === drill.id ? record : item) : [record, ...data.wrongAnswerDrills] };\n      const storageChanged = (originalProblemImage?.path ?? '') !== (problemImage?.path ?? '');\n      if (storageChanged) await uploadCloudflareData(nextData, loadCloudflareConfig());\n      update(() => nextData);\n      if (storageChanged && originalProblemImage && originalProblemImage.path !== problemImage?.path) await deleteProblemImage(originalProblemImage).catch(() => undefined);\n      setOriginalProblemImage(undefined); setDrill(drillBlank()); setOpenDrill(false);\n    } catch (error) { setImageError(error instanceof Error ? error.message : '오답 저장에 실패했습니다.'); }\n    finally { setImageBusy(false); }\n  };`;
  source = replaceOnce(source, oldSave, newSave, 'WeeklyDrill saveDrill');

  const oldDelete = "  const deleteDrill = (id: string) => update((value) => ({ ...value, wrongAnswerDrills: value.wrongAnswerDrills.filter((item) => item.id !== id) }));";
  const newDelete = `  const deleteDrill = async (id: string) => {\n    const target = data.wrongAnswerDrills.find((item) => item.id === id);\n    const nextData: AppData = { ...data, wrongAnswerDrills: data.wrongAnswerDrills.filter((item) => item.id !== id) };\n    try {\n      if (target?.problemImage) await uploadCloudflareData(nextData, loadCloudflareConfig());\n      update(() => nextData);\n      if (target?.problemImage) await deleteProblemImage(target.problemImage).catch(() => undefined);\n    } catch (error) { setImageError(error instanceof Error ? error.message : '오답 삭제에 실패했습니다.'); }\n  };`;
  source = replaceOnce(source, oldDelete, newDelete, 'WeeklyDrill deleteDrill');

  source = replaceOnce(source, "<button className=\"button\" onClick={() => { setDrill(drillBlank()); setOpenDrill(true); }}><ClipboardPenLine size={16} /> 오답 Drill</button>", "<button className=\"button\" onClick={beginNewDrill}><ClipboardPenLine size={16} /> 오답 Drill</button>", 'WeeklyDrill new button');

  const photoNeedle = '<Field label="문항 / 상황"><input value={drill.question} onChange={(event) => setDrill({ ...drill, question: event.target.value })} placeholder="예: 국어 비문학 12번 내용일치" /></Field>';
  const photoUi = `<Field label="문제 사진 · 선택"><div className="problem-image-uploader">{pendingImage?<div className="problem-image-preview"><img src={pendingImage.previewUrl} alt="첨부할 문제"/><div><b>{pendingImage.name}</b><small>{Math.round(pendingImage.size/1024)}KB · Supabase 업로드 대기</small><div><label className="button small"><ImagePlus size={14}/>교체<input type="file" accept="image/*" hidden disabled={imageBusy} onChange={(event)=>{void attachProblemImage(event.target.files?.[0]);event.currentTarget.value='';}}/></label><button className="button small danger" type="button" onClick={()=>{clearPendingImage();setDrill({...drill,problemImage:undefined});setImageError('')}}><Trash2 size={14}/>삭제</button></div></div></div>:drill.problemImage?<div className="problem-image-preview"><ProblemImageView image={drill.problemImage} alt="첨부한 문제"/><div><b>{drill.problemImage.name}</b><small>{Math.round(drill.problemImage.size/1024)}KB · Supabase Storage</small><div><label className="button small"><ImagePlus size={14}/>교체<input type="file" accept="image/*" hidden disabled={imageBusy} onChange={(event)=>{void attachProblemImage(event.target.files?.[0]);event.currentTarget.value='';}}/></label><button className="button small danger" type="button" onClick={()=>{clearPendingImage();setDrill({...drill,problemImage:undefined});setImageError('')}}><Trash2 size={14}/>삭제</button></div></div></div>:<label className="problem-image-drop"><ImagePlus size={20}/><b>{imageBusy?'사진 압축 중…':'문제 사진 첨부'}</b><small>JPG · PNG · WebP → JPEG 900KB 이하 → private Storage</small><input type="file" accept="image/*" hidden disabled={imageBusy} onChange={(event)=>{void attachProblemImage(event.target.files?.[0]);event.currentTarget.value='';}}/></label>}{imageError&&<p className="team-error">{imageError}</p>}</div></Field>`;
  source = replaceOnce(source, photoNeedle, photoNeedle + photoUi, 'WeeklyDrill photo field');

  source = replaceOnce(source, '<button className="button" onClick={() => setOpenDrill(false)}>취소</button><SaveButton onClick={saveDrill} label="오답 Drill 저장" />', '<button className="button" onClick={cancelDrill}>취소</button><SaveButton onClick={()=>void saveDrill()} label={imageBusy?"저장 중…":"오답 Drill 저장"} />', 'WeeklyDrill cancel/save buttons');

  const editNeedle = '<button className="button small" onClick={() => { setDrill({ ...item }); setOpenDrill(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}>수정</button>';
  source = replaceAllChecked(source, editNeedle, '<button className="button small" onClick={() => beginEditDrill(item)}>수정</button>', 'WeeklyDrill edit button');
  source = replaceAllChecked(source, '<button className="icon-button danger" onClick={() => deleteDrill(item.id)} aria-label="삭제"><Trash2 size={17} /></button>', '<button className="icon-button danger" onClick={() => void deleteDrill(item.id)} aria-label="삭제"><Trash2 size={17} /></button>', 'WeeklyDrill delete button');

  const listNeedle = "<h3>{item.question || '문항 미입력'}</h3>";
  source = replaceAllChecked(source, listNeedle, listNeedle + '{item.problemImage&&<ProblemImageView image={item.problemImage} className="drill-problem-thumb" alt="문제 사진"/>}', 'WeeklyDrill list photo');
  write(file, source);
}

// 6) Quick Capture: keep prepared Blob out of AppData, upload only after canonical record exists.
{
  const file = 'src/components/learning/QuickCaptureSheet.tsx';
  let source = read(file);
  source = replaceOnce(source, "import type { AppData, DrillBottleneck, Subject } from '../../types';", "import type { AppData, DrillBottleneck, Subject, WrongAnswerImage } from '../../types';", 'QuickCapture type import');
  source = replaceOnce(source, "import { X } from 'lucide-react';", "import { ImagePlus, Trash2, X } from 'lucide-react';", 'QuickCapture icons');
  source = replaceOnce(source, "import { SUBJECTS } from '../../data/config';", "import { SUBJECTS } from '../../data/config';\nimport { deleteProblemImage, prepareProblemImage, releasePreparedProblemImage, uploadProblemImage, type PreparedProblemImage } from '../../lib/problemImage';\nimport ProblemImageView from './ProblemImageView';", 'QuickCapture image imports');

  const stateNeedle = " const [subject,setSubject]=useState<Subject>('수학'),[source,setSource]=useState(''),[question,setQuestion]=useState(''),[wrongJudgment,setWrongJudgment]=useState(''),[missedCue,setMissedCue]=useState(''),[correction,setCorrection]=useState(''),[nextAction,setNextAction]=useState(''),[bottleneck,setBottleneck]=useState<DrillBottleneck>('전략·판단'),[ruleId,setRuleId]=useState(''),[rules,setRules]=useState<CoreRule[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false),[requestId,setRequestId]=useState(()=>crypto.randomUUID());";
  source = replaceOnce(source, stateNeedle, stateNeedle + "\n const [problemImage,setProblemImage]=useState<PreparedProblemImage|null>(null),[uploadedImage,setUploadedImage]=useState<WrongAnswerImage|null>(null),[imageBusy,setImageBusy]=useState(false),[imageError,setImageError]=useState('');", 'QuickCapture image state');
  source = replaceOnce(source, " useEffect(()=>{if(open){setSaved(false);setError('');setRequestId(crypto.randomUUID())}},[open]);", " useEffect(()=>{if(open){setSaved(false);setError('');setImageError('');setUploadedImage(null);setRequestId(crypto.randomUUID())}},[open]);", 'QuickCapture reset');
  source = replaceOnce(source, " const input={subject,source,question,wrongJudgment,missedCue,correction,nextAction},suggestion=classifyWrongAnswer(input),ruleSuggestions=suggestCoreRules(rules,input);\n", " const input={subject,source,question,wrongJudgment,missedCue,correction,nextAction},suggestion=classifyWrongAnswer(input),ruleSuggestions=suggestCoreRules(rules,input);\n const attachImage=async(file?:File)=>{if(!file)return;setImageBusy(true);setImageError('');try{const prepared=await prepareProblemImage(file);if(problemImage)releasePreparedProblemImage(problemImage);setProblemImage(prepared);setUploadedImage(null)}catch(cause){setImageError(cause instanceof Error?cause.message:'사진 첨부에 실패했습니다.')}finally{setImageBusy(false)}};\n const closeSheet=()=>{if(busy)return;if(problemImage)releasePreparedProblemImage(problemImage);if(uploadedImage&&!saved)void deleteProblemImage(uploadedImage).catch(()=>undefined);setProblemImage(null);setUploadedImage(null);setImageError('');onClose()};\n", 'QuickCapture image helpers');

  const submitStart = source.indexOf(' const submit=async()=>{');
  const submitEnd = source.indexOf(' if(!open)return null;', submitStart);
  if (submitStart < 0 || submitEnd < 0) throw new Error('QuickCapture submit block not found');
  const submit = ` const submit=async()=>{if(busy)return;setBusy(true);setError('');setImageError('');try{await uploadCloudflareData(data,loadCloudflareConfig());const result=await archiveApi<{data:AppData;wrongAnswerId:string}>('/api/learning-intelligence/quick-capture','POST',{requestId,subject,coreRuleId:ruleId||undefined,wrongAnswer:{date:toDateKey(),source,question,wrongJudgment,missedCue,correction,nextAction,bottleneck}});let remoteImage=uploadedImage;if(problemImage&&!remoteImage){remoteImage=await uploadProblemImage(problemImage);setUploadedImage(remoteImage);releasePreparedProblemImage(problemImage);setProblemImage(null)}const next=remoteImage?{...result.data,wrongAnswerDrills:result.data.wrongAnswerDrills.map(item=>item.id===result.wrongAnswerId?{...item,problemImage:remoteImage!}:item)}:result.data;if(remoteImage)await uploadCloudflareData(next,loadCloudflareConfig());update(()=>next);setSaved(true)}catch(cause){setError(cause instanceof Error?cause.message:'저장에 실패했습니다.')}finally{setBusy(false)}};\n`;
  source = source.slice(0, submitStart) + submit + source.slice(submitEnd);

  const qNeedle = '<label>문항<input value={question} onChange={event=>setQuestion(event.target.value)} placeholder="21번"/></label>';
  const qUi = `<label>문제 사진 (선택)<div className="quick-problem-image">{problemImage?<><img src={problemImage.previewUrl} alt="문제 사진"/><div><small>{Math.round(problemImage.size/1024)}KB · 업로드 대기</small><button type="button" className="text-button" onClick={()=>{releasePreparedProblemImage(problemImage);setProblemImage(null)}}>사진 삭제</button></div></>:uploadedImage?<><ProblemImageView image={uploadedImage} alt="업로드된 문제 사진"/><div><small>Supabase Storage 업로드 완료</small><button type="button" className="text-button" onClick={()=>{void deleteProblemImage(uploadedImage);setUploadedImage(null)}}>사진 삭제</button></div></>:<label className="problem-image-drop compact"><ImagePlus size={16}/><b>{imageBusy?'압축 중…':'사진 선택'}</b><small>사진은 AppData가 아니라 private Storage에 저장됩니다.</small><input type="file" accept="image/*" hidden disabled={imageBusy} onChange={event=>{void attachImage(event.target.files?.[0]);event.currentTarget.value='';}}/></label>}{imageError&&<span className="team-error">{imageError}</span>}</div></label>`;
  source = replaceOnce(source, qNeedle, qNeedle + qUi, 'QuickCapture photo UI');
  source = replaceAllChecked(source, 'onClick={()=>!busy&&onClose()}', 'onClick={()=>!busy&&closeSheet()}', 'QuickCapture backdrop close');
  source = replaceAllChecked(source, 'onClick={onClose}', 'onClick={closeSheet}', 'QuickCapture close buttons');
  write(file, source);
}

// 7) New source files.
for (const relative of [
  'src/lib/problemImage.ts',
  'src/components/learning/ProblemImageView.tsx',
  'src/pages/HandwritingNotes.tsx',
  'worker/src/problem-images.ts',
]) {
  const sourcePath = path.join(payload, relative);
  if (!fs.existsSync(sourcePath)) throw new Error(`payload missing: ${relative}`);
  write(relative, fs.readFileSync(sourcePath, 'utf8'));
}

// 8) Styles.
{
  const file = 'src/styles.css';
  let source = read(file);
  const marker = '/* TRINITY handwriting + Supabase wrong-answer photo patch */';
  if (!source.includes(marker)) {
    source += `\n\n${marker}\n.problem-image-uploader{display:grid;gap:8px}.problem-image-drop{display:grid;place-items:center;gap:5px;min-height:132px;padding:18px;border:1px dashed var(--line);border-radius:12px;background:var(--surface-subtle,#fafbfc);color:var(--muted);text-align:center;cursor:pointer}.problem-image-drop:hover{border-color:var(--gold,#a48649)}.problem-image-drop b{color:var(--text);font-size:12px}.problem-image-drop small{font-size:10px}.problem-image-drop.compact{min-height:82px;padding:12px}.problem-image-preview{display:grid;grid-template-columns:minmax(120px,220px) 1fr;gap:14px;align-items:center;padding:10px;border:1px solid var(--line);border-radius:12px;background:var(--surface,#fff)}.problem-image-preview img,.drill-problem-thumb,.wrong-card-image,.wrong-detail-image,.quick-problem-image img{display:block;max-width:100%;border:1px solid var(--line);border-radius:10px;background:#fff;object-fit:contain}.problem-image-state{display:grid;place-items:center;min-height:90px;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--surface-subtle,#fafbfc);color:var(--muted);font-size:10px}.problem-image-preview img,.problem-image-preview .problem-image-state{width:100%;max-height:190px;min-height:120px}.problem-image-preview>div{display:grid;gap:6px}.problem-image-preview>div>div{display:flex;gap:6px;flex-wrap:wrap}.problem-image-preview small{color:var(--muted);font-size:10px}.drill-problem-thumb{width:min(260px,100%);max-height:180px;margin-top:10px}.wrong-card-image{width:100%;height:130px;margin-bottom:10px;object-fit:cover}.wrong-card-image.problem-image-state{height:130px}.wrong-detail-image{width:min(680px,100%);max-height:520px;margin-top:10px}.quick-problem-image{display:grid;gap:8px}.quick-problem-image img,.quick-problem-image .problem-image-state{max-height:190px}.quick-problem-image>div{display:flex;align-items:center;justify-content:space-between;gap:8px}.handwriting-page{display:grid;gap:18px}.handwriting-layout{display:grid;grid-template-columns:minmax(210px,.28fr) minmax(0,.72fr);gap:16px;align-items:start}.handwriting-library{position:sticky;top:18px;max-height:calc(100vh - 36px);overflow:auto}.handwriting-note-list{display:grid;gap:7px}.handwriting-note-list>button{display:grid;grid-template-columns:auto 1fr;gap:4px 8px;width:100%;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--surface,#fff);color:var(--text);text-align:left}.handwriting-note-list>button:hover,.handwriting-note-list>button.active{border-color:var(--gold,#a48649);background:var(--surface-subtle,#faf9f5)}.handwriting-note-list b{align-self:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.handwriting-note-list small{grid-column:1/-1;color:var(--muted);font-size:9px}.handwriting-editor{display:grid;gap:12px;min-width:0}.handwriting-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:9px;border:1px solid var(--line);border-radius:11px;background:var(--surface-subtle,#fafbfc)}.handwriting-tool-group{display:flex;gap:4px}.handwriting-tool-group.right{margin-left:auto}.handwriting-tool-group button{display:flex;align-items:center;gap:5px;min-height:34px;padding:0 10px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--muted);font-size:11px;font-weight:700}.handwriting-tool-group button.active{border-color:var(--line);background:var(--surface,#fff);color:var(--text)}.handwriting-tool-group button:disabled{opacity:.4}.handwriting-colors{display:flex;gap:5px;padding:0 4px}.handwriting-colors button{width:24px;height:24px;border:2px solid transparent;border-radius:50%;background:var(--ink);box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}.handwriting-colors button.active{border-color:var(--gold,#a48649);box-shadow:0 0 0 2px var(--surface,#fff),0 0 0 3px var(--gold,#a48649)}.handwriting-width{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:10px;font-weight:700}.handwriting-width select{min-height:32px;border:1px solid var(--line);border-radius:8px;background:var(--surface,#fff);color:var(--text);padding:0 8px}.handwriting-paper-wrap{overflow:auto;padding:10px;border:1px solid var(--line);border-radius:12px;background:var(--surface-subtle,#eef1f4)}.handwriting-canvas{display:block;width:100%;aspect-ratio:4/5;min-height:520px;border:1px solid #d9dde4;border-radius:5px;background-color:#fff;background-image:linear-gradient(rgba(45,72,106,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(45,72,106,.08) 1px,transparent 1px);background-size:24px 24px;box-shadow:0 8px 22px rgba(15,23,42,.08);touch-action:none;user-select:none;-webkit-user-select:none;cursor:crosshair}.handwriting-actions{display:flex;justify-content:flex-end;align-items:center;gap:8px}.handwriting-actions>span{margin-right:auto;color:var(--muted);font-size:11px}@media(max-width:900px){.handwriting-layout{grid-template-columns:1fr}.handwriting-library{position:static;max-height:none}.handwriting-note-list{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.problem-image-preview{grid-template-columns:1fr}.handwriting-note-list{grid-template-columns:1fr}.handwriting-meta.form-grid.three{grid-template-columns:1fr}.handwriting-tool-group.right{margin-left:0}.handwriting-canvas{min-height:420px}.handwriting-actions{flex-wrap:wrap}.handwriting-actions .button{flex:1}}\n`;
  }
  write(file, source);
}

// 9) Worker: route image bytes through authenticated Worker -> Supabase Storage.
{
  const file = 'worker/src/index.ts';
  let source = read(file);
  if (!source.includes('SUPABASE_SECRET_KEY?: string;')) {
    source = replaceOnce(source, '  DB: D1Database; SYNC_TOKEN?: string; NVIDIA_API_KEY?: string; NVIDIA_MODEL?: string; NVIDIA_BASE_URL?: string;\n', '  DB: D1Database; SYNC_TOKEN?: string; NVIDIA_API_KEY?: string; NVIDIA_MODEL?: string; NVIDIA_BASE_URL?: string; SUPABASE_SECRET_KEY?: string;\n', 'worker Supabase secret env type');
  }
  if (!source.includes("import { problemImages } from './problem-images.ts';")) {
    source = replaceOnce(source, "import { syncLearningProjection } from './learning-graph.ts';\n", "import { syncLearningProjection } from './learning-graph.ts';\nimport { problemImages } from './problem-images.ts';\n", 'worker image import');
  }
  source = replaceOnce(
    source,
    "const url = new URL(request.url), declared=Number(request.headers.get('Content-Length')||0), limit=['/api/sync','/api/archive/import'].includes(url.pathname)?MAX_SYNC_BODY:MAX_JSON_BODY;",
    "const url = new URL(request.url), declared=Number(request.headers.get('Content-Length')||0), limit=url.pathname==='/api/problem-images'?2*1024*1024:['/api/sync','/api/archive/import'].includes(url.pathname)?MAX_SYNC_BODY:MAX_JSON_BODY;",
    'worker image body limit',
  );
  source = replaceOnce(
    source,
    "  const studyRoomResponse = await handleStudyRoomApi(request, env, sessionUser, origin, json);\n  if (studyRoomResponse) return studyRoomResponse;\n",
    "  const studyRoomResponse = await handleStudyRoomApi(request, env, sessionUser, origin, json);\n  if (studyRoomResponse) return studyRoomResponse;\n  const problemImageResponse = await problemImages(request, env, sessionUser, origin, { json, randomHex });\n  if (problemImageResponse) return problemImageResponse;\n",
    'worker image route',
  );
  write(file, source);
}

// 10) Worker schema: normalized D1 stores only the small Storage reference metadata.
{
  const file = 'worker/schema.sql';
  let source = read(file);
  if (!source.includes('problem_image_json TEXT')) {
    source = replaceOnce(source, "  archive_entry_id TEXT,\n  retries_json TEXT NOT NULL DEFAULT '[]',", "  archive_entry_id TEXT,\n  problem_image_json TEXT,\n  retries_json TEXT NOT NULL DEFAULT '[]',", 'schema problem image');
  }
  write(file, source);
}

// 11) Learning projection: keep normalized wrong_answers in sync with the Storage reference.
{
  const file = 'worker/src/learning-graph.ts';
  let source = read(file);
  if (!source.includes('async function ensureWrongAnswerImageColumn')) {
    source = replaceOnce(
      source,
      "async function ensureRelationColumn(db:D1Database){\n",
      "async function ensureWrongAnswerImageColumn(db:D1Database){\n  const cols=await db.prepare('PRAGMA table_info(wrong_answers)').all<{name:string}>();\n  if(cols.results.length&&!cols.results.some(col=>col.name==='problem_image_json')){\n    await db.prepare('ALTER TABLE wrong_answers ADD COLUMN problem_image_json TEXT').run();\n  }\n}\n\nasync function ensureRelationColumn(db:D1Database){\n",
      'learning graph image column helper',
    );
  }
  source = replaceOnce(source, "export async function syncLearningProjection(db:D1Database,userId:number,payload:unknown,sourceUpdatedAt=nowIso()){\n", "export async function syncLearningProjection(db:D1Database,userId:number,payload:unknown,sourceUpdatedAt=nowIso()){\n  await ensureWrongAnswerImageColumn(db);\n", 'learning graph ensure image column');
  source = replaceOnce(
    source,
    "      score_id,capability_goal_id,archive_entry_id,retries_json,created_at,updated_at\n    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    "      score_id,capability_goal_id,archive_entry_id,problem_image_json,retries_json,created_at,updated_at\n    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    'learning graph insert columns',
  );
  source = replaceOnce(
    source,
    "      capability_goal_id=excluded.capability_goal_id,archive_entry_id=excluded.archive_entry_id,\n      retries_json=excluded.retries_json,updated_at=excluded.updated_at`).bind(",
    "      capability_goal_id=excluded.capability_goal_id,archive_entry_id=excluded.archive_entry_id,\n      problem_image_json=excluded.problem_image_json,retries_json=excluded.retries_json,updated_at=excluded.updated_at`).bind(",
    'learning graph update image',
  );
  source = replaceOnce(
    source,
    "        clean(item.archiveEntryId,100)||null,JSON.stringify(Array.isArray(item.retries)?item.retries:[]),now,now\n",
    "        clean(item.archiveEntryId,100)||null,record(item.problemImage)?JSON.stringify(item.problemImage):null,JSON.stringify(Array.isArray(item.retries)?item.retries:[]),now,now\n",
    'learning graph bind image',
  );
  source = replaceOnce(
    source,
    "  capabilityGoalId:r.capability_goal_id??undefined,archiveEntryId:r.archive_entry_id??undefined,\n  retries:parse<unknown[]>(r.retries_json,[]),\n",
    "  capabilityGoalId:r.capability_goal_id??undefined,archiveEntryId:r.archive_entry_id??undefined,\n  problemImage:parse<Record<string,unknown>|null>(r.problem_image_json,null)??undefined,retries:parse<unknown[]>(r.retries_json,[]),\n",
    'wrongAnswerDto image',
  );
  write(file, source);
}

// 12) Worker deployment config: public project URL/bucket name only. service_role remains a Worker secret.
{
  const file = 'worker/wrangler.toml';
  let source = read(file);
  if (!source.includes('SUPABASE_URL =')) {
    source = replaceOnce(source, 'LOCAL_AI_MODEL = "qwen3:8b"\n', 'LOCAL_AI_MODEL = "qwen3:8b"\nSUPABASE_URL = "https://yygaqttkjuigoczxhcgj.supabase.co"\nSUPABASE_BUCKET = "trinity-problem-images"\n', 'wrangler Supabase vars');
  }
  write(file, source);
}

console.log('\nTRINITY handwriting + Supabase Storage patch applied successfully.');
console.log('Next: npm install && npm run build && deploy the Worker.');
