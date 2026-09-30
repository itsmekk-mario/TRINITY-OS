type Env={DB:D1Database;SUPABASE_URL?:string;SUPABASE_SECRET_KEY?:string;SUPABASE_SERVICE_ROLE_KEY?:string;SUPABASE_BUCKET?:string};
type Helpers={json:(v:unknown,status?:number,origin?:string)=>Response;randomHex:(size?:number)=>string;boundedJson:<T>(r:Request)=>Promise<T>};
export async function library(request:Request,env:Env,user:{id:number;is_admin?:number}|null,origin:string,h:Helpers):Promise<Response|null>{
 const url=new URL(request.url);if(!url.pathname.startsWith('/api/library'))return null;
 const out=(v:unknown,status=200)=>h.json(v,status,origin);
 if(!user)return out({error:'Unauthorized'},401);
 await env.DB.batch([env.DB.prepare('CREATE TABLE IF NOT EXISTS library_catalog (id TEXT PRIMARY KEY,payload TEXT NOT NULL)'),env.DB.prepare('CREATE TABLE IF NOT EXISTS library_files (id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,path TEXT NOT NULL,name TEXT NOT NULL,size INTEGER NOT NULL)')]);
 if(url.pathname==='/api/library/catalog'){
  if(request.method==='GET'){
   const [rows,examRows]=await Promise.all([
    env.DB.prepare('SELECT payload FROM library_catalog ORDER BY id').all<{payload:string}>(),
    env.DB.prepare('SELECT id,title,agency,year,subject,object_key,created_at FROM exam_documents ORDER BY year DESC,created_at DESC').all<{id:string;title:string;agency:string;year:number;subject:string;object_key:string;created_at:string}>()
   ]);
   const manual=rows.results.map(r=>JSON.parse(r.payload));
   const exams=examRows.results.map(doc=>{
    const monthMatch=doc.title.match(/(?:^|\D)(3|4|5|6|7|9|10|11|12)(?:\uC6D4|\uD3C9|\uBAA8)/);
    return {
     id:`exam:${doc.id}`,
     officialId:doc.id,
     name:doc.title,
     subject:doc.subject,
     group:doc.agency,
     examType:doc.title.includes('\uC218\uB2A5')
      ?'\uC218\uB2A5'
      :doc.agency==='\uAD50\uC721\uCCAD'
       ?'\uD559\uB825\uD3C9\uAC00'
       :'\uBAA8\uC758\uD3C9\uAC00',
     examYear:doc.year,
     examMonth:monthMatch?Number(monthMatch[1]):undefined,
     documentType:doc.title.includes('\uD574\uC124')
      ?'\uD574\uC124'
      :doc.title.includes('\uC815\uB2F5')
       ?'\uC815\uB2F5'
       :'\uBB38\uC81C\uC9C0',
     total:1,
     done:0
    };
   });
   return out({resources:[...exams,...manual]});
  }
  if(request.method!=='POST')return out({error:'Method not allowed'},405);
  if(user.is_admin!==1)return out({error:'관리자만 공용 자료를 등록할 수 있습니다.'},403);
  const r=await h.boundedJson<Record<string,unknown>>(request);
  let source:URL;try{source=new URL(String(r.sourceUrl));}catch{return out({error:'공식 URL을 입력하세요.'},400);}
  if(source.protocol!=='https:'||!['ebsi.co.kr','kice.re.kr','suneung.re.kr','sen.go.kr'].some(host=>source.hostname===host||source.hostname.endsWith('.'+host)))return out({error:'허용된 공식 출처 URL만 등록할 수 있습니다.'},400);
  if(!String(r.name ?? '').trim()||!['국어','수학','영어','탐구','통사','통과'].includes(String(r.subject)))return out({error:'자료명과 과목을 확인하세요.'},400);
  const id=h.randomHex(16),record={id,name:String(r.name).slice(0,180),subject:r.subject,group:String(r.examType ?? ''),examType:r.examType,examYear:r.examYear,examMonth:r.examMonth,documentType:r.documentType,sourceUrl:source.href,total:1,done:0};
  await env.DB.prepare('INSERT INTO library_catalog(id,payload) VALUES(?,?)').bind(id,JSON.stringify(record)).run();return out({resource:record},201);
 }
 if(url.pathname!=='/api/library/files')return out({error:'Not found'},404);
 const key=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY,bucket=env.SUPABASE_BUCKET||'trinity-problem-images',base=(env.SUPABASE_URL||'').replace(/\/+$/,'');
 if(!key||!base)return out({error:'PDF 저장소 설정이 필요합니다.'},503);
 const headers={apikey:key,...(!key.startsWith('sb_secret_')?{Authorization:`Bearer ${key}`}:{})};
 // Refuse any public bucket, even when the Worker itself authorizes the request.
 const check=await fetch(`${base}/storage/v1/bucket/${encodeURIComponent(bucket)}`,{headers});
 if(!check.ok|| (await check.json() as {public?:boolean}).public!==false)return out({error:'PDF 업로드에는 비공개 버킷이 필요합니다.'},503);
 if(request.method==='POST'){
  const reader=request.body?.getReader();if(!reader)return out({error:'PDF를 선택하세요.'},400);
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>20*1024*1024){await reader.cancel();return out({error:'PDF는 20MB 이하여야 합니다.'},413);}chunks.push(value);}
  const merged=new Uint8Array(size);let offset=0;for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.byteLength;}const bytes=merged.buffer;
  if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')return out({error:'유효한 PDF 파일을 선택하세요.'},415);
  const id=h.randomHex(16),path=`${user.id}/library/${id}.pdf`,name=(url.searchParams.get('name')||'document.pdf').slice(0,180);
  const response=await fetch(`${base}/storage/v1/object/${encodeURIComponent(bucket)}/${path}`,{method:'POST',headers:{...headers,'Content-Type':'application/pdf','x-upsert':'false'},body:bytes});
  if(!response.ok)return out({error:'PDF 저장 실패'},502);
  try{await env.DB.prepare('INSERT INTO library_files(id,user_id,path,name,size) VALUES(?,?,?,?,?)').bind(id,user.id,path,name,bytes.byteLength).run();}catch{await fetch(`${base}/storage/v1/object/${encodeURIComponent(bucket)}`,{method:'DELETE',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({prefixes:[path]})});return out({error:'파일 등록 실패'},500);}
  return out({id,name,size:bytes.byteLength},201);
 }
 const file=await env.DB.prepare('SELECT path FROM library_files WHERE id=? AND user_id=?').bind(url.searchParams.get('id'),user.id).first<{path:string}>();if(!file)return out({error:'Not found'},404);
 if(request.method==='GET'){
  const response=await fetch(`${base}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${file.path}`,{headers});if(!response.ok)return out({error:'PDF 열기 실패'},502);
  return new Response(response.body,{headers:{'Content-Type':'application/pdf','Content-Disposition':'inline','Cache-Control':'private, no-store','Access-Control-Allow-Origin':origin,'Vary':'Origin','X-Content-Type-Options':'nosniff'}});
 }
 if(request.method==='DELETE'){
  const response=await fetch(`${base}/storage/v1/object/${encodeURIComponent(bucket)}`,{method:'DELETE',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({prefixes:[file.path]})});if(!response.ok)return out({error:'PDF 삭제 실패'},502);
  await env.DB.prepare('DELETE FROM library_files WHERE id=? AND user_id=?').bind(url.searchParams.get('id'),user.id).run();return out({ok:true});
 }
 return out({error:'Method not allowed'},405);
}
