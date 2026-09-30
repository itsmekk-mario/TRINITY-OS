type Env={SUPABASE_URL?:string;SUPABASE_SECRET_KEY?:string;SUPABASE_SERVICE_ROLE_KEY?:string;SUPABASE_BUCKET?:string};
type User={id:number}|null;
type Tools={json:(value:unknown,status?:number,origin?:string)=>Response;randomHex:(size?:number)=>string};

const MAX_IMAGE_BYTES=2*1024*1024;
const DEFAULT_BUCKET='trinity-problem-images';
const safeName=(value:string|null)=>((value||'problem-photo.jpg').trim().slice(0,180)||'problem-photo.jpg');
const safeDimension=(value:string|null)=>{const n=Number(value);return Number.isFinite(n)&&n>0&&n<=12000?Math.round(n):0};
const safeScope=(value:string|null)=>value==='archive'?'archive':'wrong-answer';
const encodePath=(value:string)=>value.split('/').map(encodeURIComponent).join('/');

function config(env:Env){
  const url=(env.SUPABASE_URL||'').replace(/\/+$/,'');
  const key=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY||'';
  const bucket=(env.SUPABASE_BUCKET||DEFAULT_BUCKET).trim()||DEFAULT_BUCKET;
  if(!url||!key)return null;
  return {url,key,bucket};
}
function ownedPath(path:string,userId:number){
  if(!path.startsWith(`${userId}/`))return false;
  return /^\d+\/(?:wrong-answer|archive)\/\d{4}-\d{2}-\d{2}\/[a-f0-9]{32}\.jpg$/.test(path)
    || /^\d+\/\d{4}-\d{2}-\d{2}\/[a-f0-9]{32}\.jpg$/.test(path);
}
function storageHeaders(key:string,contentType?:string){
  return {apikey:key,...(!key.startsWith('sb_secret_')?{Authorization:`Bearer ${key}`}:{ }),...(contentType?{'Content-Type':contentType}:{})};
}
async function storageError(response:Response){
  const body=await response.text().catch(()=> '');
  return body.slice(0,500);
}

export async function problemImages(request:Request,env:Env,user:User,origin:string,h:Tools):Promise<Response|null>{
  const url=new URL(request.url);
  if(url.pathname!=='/api/problem-images')return null;
  const out=(value:unknown,status=200)=>h.json(value,status,origin);
  if(!user)return out({error:'Unauthorized'},401);
  const cfg=config(env);
  if(!cfg)return out({error:'Supabase Storage 설정이 필요합니다.'},503);

  if(request.method==='POST'){
    const mime=(request.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase();
    if(mime!=='image/jpeg')return out({error:'압축된 JPEG 이미지만 업로드할 수 있습니다.'},415);
    const declared=Number(request.headers.get('Content-Length')||0);
    if(declared>MAX_IMAGE_BYTES)return out({error:'문제 사진은 2MB 이하만 업로드할 수 있습니다.'},413);
    const bytes=await request.arrayBuffer();
    if(!bytes.byteLength)return out({error:'빈 이미지입니다.'},400);
    if(bytes.byteLength>MAX_IMAGE_BYTES)return out({error:'문제 사진은 2MB 이하만 업로드할 수 있습니다.'},413);
    const scope=safeScope(url.searchParams.get('scope')),today=new Date().toISOString().slice(0,10),path=`${user.id}/${scope}/${today}/${h.randomHex(16)}.jpg`;
    const target=`${cfg.url}/storage/v1/object/${encodeURIComponent(cfg.bucket)}/${encodePath(path)}`;
    const response=await fetch(target,{method:'POST',headers:{...storageHeaders(cfg.key,mime),'x-upsert':'false','cache-control':'3600'},body:bytes});
    if(!response.ok){console.error(JSON.stringify({message:'supabase storage upload failed',status:response.status,detail:await storageError(response)}));return out({error:'문제 사진을 Storage에 저장하지 못했습니다.'},502);}
    return out({image:{provider:'supabase',bucket:cfg.bucket,path,name:safeName(url.searchParams.get('name')),mime:'image/jpeg',width:safeDimension(url.searchParams.get('width')),height:safeDimension(url.searchParams.get('height')),size:bytes.byteLength,createdAt:new Date().toISOString()}},201);
  }

  const path=(url.searchParams.get('path')||'').trim();
  if(!path||!ownedPath(path,user.id))return out({error:'허용되지 않는 파일 경로입니다.'},403);

  if(request.method==='GET'){
    const target=`${cfg.url}/storage/v1/object/authenticated/${encodeURIComponent(cfg.bucket)}/${encodePath(path)}`;
    const response=await fetch(target,{headers:storageHeaders(cfg.key)});
    if(response.status===404)return out({error:'문제 사진을 찾을 수 없습니다.'},404);
    if(!response.ok){console.error(JSON.stringify({message:'supabase storage download failed',status:response.status,detail:await storageError(response)}));return out({error:'문제 사진을 불러오지 못했습니다.'},502);}
    const headers=new Headers();
    headers.set('Content-Type',response.headers.get('Content-Type')||'image/jpeg');
    headers.set('Cache-Control','private, max-age=300');
    if(origin){headers.set('Access-Control-Allow-Origin',origin);headers.set('Vary','Origin');}
    return new Response(response.body,{status:200,headers});
  }

  if(request.method==='DELETE'){
    const target=`${cfg.url}/storage/v1/object/${encodeURIComponent(cfg.bucket)}`;
    const response=await fetch(target,{method:'DELETE',headers:storageHeaders(cfg.key,'application/json'),body:JSON.stringify({prefixes:[path]})});
    if(response.status===404)return out({ok:true,alreadyDeleted:true});
    if(!response.ok){console.error(JSON.stringify({message:'supabase storage delete failed',status:response.status,detail:await storageError(response)}));return out({error:'문제 사진을 삭제하지 못했습니다.'},502);}
    return out({ok:true});
  }

  return out({error:'Method not allowed'},405);
}
