import type { AppData } from '../../src/types';
type Env = { DB: D1Database; SUPABASE_URL?: string; SUPABASE_SERVICE_ROLE_KEY?: string; SUPABASE_BUCKET?: string };
export function publicExamPath(key: string): string | null {
 if (!key || key.length > 500 || /[\\:%?#\u0000-\u001f\u007f]/.test(key) || !key.toLowerCase().endsWith('.pdf')) return null;
 const parts = key.split('/');
 if (parts.some(part => !part || part === '.' || part === '..' || part.trim() !== part)) return null;
 return 'exams/' + parts.map(encodeURIComponent).join('/');
}
type Account = { id: string; username: string; role: 'tutor' | 'parent' };
type Helpers = { json: (body: unknown, status?: number, origin?: string) => Response; sha256: (s:string)=>Promise<string>; passwordHash:(p:string,s:string)=>Promise<string>; randomHex:(size?:number)=>string };
const strings = (v: unknown, max=200) => typeof v === 'string' ? v.trim().slice(0,max) : '';
const storageReady = (env: Env) => Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
const storageUrl = (env: Env, key: string) => `${env.SUPABASE_URL!.replace(/\/+$/, '')}/storage/v1/object/${encodeURIComponent(env.SUPABASE_BUCKET || 'exam-pdfs')}/${key.split('/').map(encodeURIComponent).join('/')}`;
const storageHeaders = (env: Env) => ({ Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY!}`, apikey: env.SUPABASE_SERVICE_ROLE_KEY! });
const selectFields = (v: any, keys: string[]) => Object.fromEntries(keys.filter(k=>v[k]!==undefined).map(k=>[k,v[k]]));
export function projection(data: AppData, role: Account['role']) {
 const math = (v: {subject?:string}) => role==='parent'||v.subject==='수학';
 const resources=(data.resources??[]).filter(math).map(v=>selectFields(v,['id','subject','name','total','done']));
 const sessions=(data.sessions??[]).filter(math).map(v=>selectFields(v,['id','subject','date','seconds','startedAt','endedAt','segments','focusDrops']));
 const plans=Object.values(data.calendar??{}).flatMap(day=>(day.plans??[]).filter(math).map(p=>({...selectFields(p,role==='tutor'?['id','subject','title','detail','quantity','done']:['id','subject','title','quantity','done']),date:day.date})));
 const goals=(data.weeklyCapabilityGoals??[]).filter(math).map(v=>selectFields(v,role==='tutor'?['id','weekStart','subject','ability','successCriterion','drillDesign','evidence','done']:['id','weekStart','subject','ability','done']));
 const daily=(data.dailyDrills??[]).filter(math).map(v=>selectFields(v,role==='tutor'?['id','date','subject','title','action','successCriterion','reflection','done','minutes']:['id','date','subject','title','done','minutes']));
 const scores=(data.scores??[]).filter(v=>role==='parent'||v.math!==undefined||v.reviews?.수학||v.subject==='수학').map(v=>role==='parent'?selectFields(v,['id','name','date','korean','math','english']):{...selectFields(v,['id','name','date','math']),review:v.reviews?.수학,...(v.subject==='수학'?selectFields(v,['cause','nextAction','errorType']):{})});
 const wrong=role==='tutor'?(data.wrongAnswerDrills??[]).filter(v=>v.subject==='수학').map(v=>selectFields(v,['id','date','source','question','wrongJudgment','missedCue','correction','transfer','retries'])):[];
 const monthly=(data.monthlyPlans??[]).filter(math).map(v=>selectFields(v,role==='tutor'?['id','month','subject','title','objective','strategy','successCriterion','done']:['id','month','subject','title','done']));
 const analysis=role==='tutor'?(data.trinity??[]).filter(v=>v.subject==='수학').map(v=>selectFields(v,['id','date','fields'])):[];
 const routine=(data.routine??[]).filter(math).map(v=>selectFields(v,role==='tutor'?['id','time','subject','title','detail']:['id','time','subject','title']));
 const checklist=(data.goals??[]).filter(math).map(v=>selectFields(v,['id','subject','text','done']));
 return {resources,sessions,plans,goals,daily,scores,wrong,monthly,analysis,routine,checklist};
}
export async function support(request:Request, env:Env, owner:boolean, origin:string, h:Helpers):Promise<Response|null> {
 const url=new URL(request.url), path=url.pathname, method=request.method;
 if(!path.startsWith('/api/support/')&&!path.startsWith('/api/exams')) return null;
 const out=(v:unknown,s=200)=>h.json(v,s,origin);
 try {
  if(path==='/api/support/login'&&method==='POST'){
   const b=await request.json<any>();const username=strings(b.username,40), role=b.role;
   if(!['tutor','parent'].includes(role)||typeof b.password!=='string'||b.password.length>256)return out({error:'입력을 확인하세요.'},400);
   const now=Date.now(), window=Math.floor(now/900000), key=await h.sha256((request.headers.get('CF-Connecting-IP')||'local')+':'+window);
   await env.DB.prepare('INSERT INTO support_login_attempts(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1').bind(key,now+900000).run();
   const tries=await env.DB.prepare('SELECT attempts FROM support_login_attempts WHERE key=?').bind(key).first<{attempts:number}>();
   if((tries?.attempts??0)>15)return out({error:'시도가 많습니다. 15분 후 다시 로그인하세요.'},429);
   await env.DB.prepare('DELETE FROM support_login_attempts WHERE expires_at<?').bind(now).run();
   const a=await env.DB.prepare('SELECT * FROM support_accounts WHERE username=? AND role=? AND active=1').bind(username,role).first<Account&{salt:string;password_hash:string}>();
   const hash=await h.passwordHash(b.password,a?.salt??'dummy-salt-for-login');
   if(!a||hash!==a.password_hash)return out({error:'아이디 또는 비밀번호가 올바르지 않습니다.'},401);
   const token=h.randomHex();
   await env.DB.prepare('INSERT INTO support_sessions(token_hash,account_id,expires_at) VALUES(?,?,?)').bind(await h.sha256(token),a.id,new Date(now+7*86400000).toISOString()).run();
   return out({token,username:a.username,role:a.role});
  }
  const bearer=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  const account=owner?null:await env.DB.prepare("SELECT a.id,a.username,a.role FROM support_sessions s JOIN support_accounts a ON a.id=s.account_id WHERE s.token_hash=? AND a.active=1 AND datetime(s.expires_at)>datetime('now')").bind(await h.sha256(bearer)).first<Account>();
  if(!owner&&!account)return out({error:'로그인이 필요합니다.'},401);
  if(path==='/api/support/logout'&&method==='POST'){await env.DB.prepare('DELETE FROM support_sessions WHERE token_hash=?').bind(await h.sha256(bearer)).run();return out({ok:true});}
  if(path==='/api/support/accounts'){
   if(!owner)return out({error:'학생만 계정을 관리할 수 있습니다.'},403);
   if(method==='GET')return out({accounts:(await env.DB.prepare('SELECT id,username,role,active FROM support_accounts ORDER BY created_at').all()).results});
   const b=await request.json<any>();
   if(method==='PUT'){await env.DB.prepare('UPDATE support_accounts SET active=0 WHERE id=?').bind(strings(b.id)).run();return out({ok:true});}
   if(method==='POST'){
    const username=strings(b.username,40);if(!username||!['tutor','parent'].includes(b.role)||typeof b.password!=='string'||b.password.length<12||b.password.length>256)return out({error:'아이디와 12자 이상의 비밀번호, 역할을 확인하세요.'},400);
    if(await env.DB.prepare('SELECT id FROM support_accounts WHERE username=?').bind(username).first())return out({error:'이미 사용 중인 아이디입니다.'},409);
    const salt=h.randomHex(16);
    await env.DB.prepare('INSERT INTO support_accounts(id,username,role,password_hash,salt,created_at) VALUES(?,?,?,?,?,?)').bind(h.randomHex(16),username,b.role,await h.passwordHash(b.password,salt),salt,new Date().toISOString()).run();return out({ok:true},201);
   }
  }
  if(path==='/api/support/data'&&method==='GET'){
   if(!account)return out({error:'전용 계정으로 로그인하세요.'},403);
   const row=await env.DB.prepare('SELECT payload,updated_at FROM learning_state WHERE id=1').first<{payload:string;updated_at:string}>();
   return out({role:account.role,username:account.username,updatedAt:row?.updated_at??null,data:row?projection(JSON.parse(row.payload),account.role):null});
  }
  if(path==='/api/support/comments'){
   if(method==='GET'){
    const sql=owner?'SELECT c.*,a.username,a.role FROM support_comments c JOIN support_accounts a ON a.id=c.account_id ORDER BY c.created_at DESC LIMIT 300':'SELECT c.*,a.username,a.role FROM support_comments c JOIN support_accounts a ON a.id=c.account_id WHERE c.account_id=? ORDER BY c.created_at DESC LIMIT 300';
    const q=env.DB.prepare(sql);return out({comments:(await (owner?q:q.bind(account!.id)).all()).results});
   }
   if(method==='POST'&&account){
    const b=await request.json<any>();const body=strings(b.body,4000),target=strings(b.target,200);
    if(!body||!target)return out({error:'대상과 의견을 입력하세요.'},400);
    await env.DB.prepare('INSERT INTO support_comments(id,account_id,target,body,created_at) VALUES(?,?,?,?,?)').bind(h.randomHex(16),account.id,target,body,new Date().toISOString()).run();return out({ok:true},201);
   }
   return out({error:'의견 작성 권한이 없습니다.'},403);
  }
  if(path==='/api/exams'&&method==='GET'){
   if(account?.role==='parent')return out({error:'자료실 접근 권한이 없습니다.'},403);
   const q=env.DB.prepare(account?'SELECT * FROM exam_documents WHERE subject=? ORDER BY year DESC,created_at DESC':'SELECT * FROM exam_documents ORDER BY year DESC,created_at DESC');
   return out({documents:(await (account?q.bind('수학'):q).all()).results});
  }
  if(path==='/api/exams'&&method==='POST'){
   if(!owner)return out({error:'학생만 자료를 등록할 수 있습니다.'},403);
   const b=await request.json<any>(),title=strings(b.title),agency=strings(b.agency),subject=strings(b.subject),key=strings(b.object_key,500),year=Number(b.year);
   if(!title||!['평가원','교육청','사관학교'].includes(agency)||!['국어','수학','영어','탐구'].includes(subject)||!Number.isInteger(year)||year<1980||year>2100||!key.toLowerCase().endsWith('.pdf'))return out({error:'자료 양식을 확인하세요.'},400);
   if(!publicExamPath(key))return out({error:'public/exams/ 아래의 상대 PDF 경로를 입력하세요. URL이나 상위 폴더 경로는 사용할 수 없습니다.'},400);
   if(await env.DB.prepare('SELECT id FROM exam_documents WHERE object_key=?').bind(key).first())return out({error:'이미 등록된 파일입니다.'},409);
   const id=h.randomHex(16);
   await env.DB.prepare('INSERT INTO exam_documents(id,title,agency,year,subject,object_key,created_at) VALUES(?,?,?,?,?,?,?)').bind(id,title,agency,year,subject,key,new Date().toISOString()).run();return out({ok:true,id,storage:storageReady(env)?'supabase':'public'},201);
  }
  if(path.startsWith('/api/exams/')&&!path.endsWith('/file')&&method==='DELETE'){
   if(!owner)return out({error:'Only the owner can remove PDFs.'},403);
   const id=path.slice('/api/exams/'.length),doc=await env.DB.prepare('SELECT object_key FROM exam_documents WHERE id=?').bind(id).first<{object_key:string}>();
   if(!doc)return out({error:'Document not found.'},404);
   if(storageReady(env))await fetch(storageUrl(env,doc.object_key),{method:'DELETE',headers:storageHeaders(env)});
   await env.DB.prepare('DELETE FROM exam_documents WHERE id=?').bind(id).run();
   return out({ok:true});
  }
  if(path.startsWith('/api/exams/')&&path.endsWith('/file')&&method==='PUT'){
   if(!owner)return out({error:'Only the owner can upload PDFs.'},403);
   if(!storageReady(env))return out({error:'Supabase Storage is not configured on this Worker.'},503);
   const id=path.slice('/api/exams/'.length,-'/file'.length),doc=await env.DB.prepare('SELECT object_key FROM exam_documents WHERE id=?').bind(id).first<{object_key:string}>();
   if(!doc)return out({error:'Document not found.'},404);
   const length=Number(request.headers.get('Content-Length')||0),type=(request.headers.get('Content-Type')||'').toLowerCase();
   if(!request.body||length>20*1024*1024||!type.startsWith('application/pdf'))return out({error:'Upload a PDF no larger than 20 MB.'},400);
   const uploaded=await fetch(storageUrl(env,doc.object_key),{method:'POST',headers:{...storageHeaders(env),'Content-Type':'application/pdf','x-upsert':'false'},body:request.body});
   if(!uploaded.ok)return out({error:'Supabase rejected the PDF upload.'},502);
   return out({ok:true},201);
  }
  if(path.startsWith('/api/exams/')&&path.endsWith('/file')&&method==='GET'){
   if(account?.role==='parent')return out({error:'PDF access is not available for this role.'},403);
   if(!storageReady(env))return out({error:'Supabase Storage is not configured on this Worker.'},503);
   const id=path.slice('/api/exams/'.length,-'/file'.length),doc=await env.DB.prepare('SELECT object_key,subject FROM exam_documents WHERE id=?').bind(id).first<{object_key:string;subject:string}>();
   if(!doc||account&&doc.subject!=='?섑븰')return out({error:'Document not found.'},404);
   const file=await fetch(storageUrl(env,doc.object_key),{headers:storageHeaders(env)});
   if(!file.ok||!file.body)return out({error:'The PDF has not been uploaded yet.'},404);
   return new Response(file.body,{headers:{'Content-Type':'application/pdf','Content-Disposition':'inline','Cache-Control':'private, max-age=300','Access-Control-Allow-Origin':origin}});
  }
  if(path.startsWith('/api/exams/')&&method==='GET'){
   if(account?.role==='parent')return out({error:'자료실 접근 권한이 없습니다.'},403);
   const doc=await env.DB.prepare('SELECT object_key,subject FROM exam_documents WHERE id=?').bind(path.slice('/api/exams/'.length)).first<{object_key:string;subject:string}>();
   if(!doc||account&&doc.subject!=='수학')return out({error:'자료를 찾을 수 없습니다.'},404);
   const pdfPath=publicExamPath(doc.object_key);
   if(!pdfPath)return out({error:'기존 파일 경로를 확인하세요.'},400);
   return out(storageReady(env)?{storage:'supabase',path:pdfPath,public:true}:{path:pdfPath,public:true});
  }
  return out({error:'Not found'},404);
 }catch{ return out({error:'요청을 처리하지 못했습니다. D1 마이그레이션과 연결을 확인하세요.'},503); }
}
