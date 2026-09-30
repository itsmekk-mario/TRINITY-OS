import test from 'node:test';
import assert from 'node:assert/strict';
import {library} from '../worker/src/library.ts';
const h={json:(v,status=200)=>Response.json(v,{status}),randomHex:()=> 'abc',boundedJson:r=>r.json()};
const db={batch:async()=>[],prepare(sql){return {bind(...args){this.args=args;return this},first:async()=>null,all:async()=>({results:[]}),run:async()=>({})}}};
test('library requires session and blocks nonadmin catalog writes',async()=>{
 assert.equal((await library(new Request('https://test/api/library/catalog'),{DB:db},null,'',h)).status,401);
 assert.equal((await library(new Request('https://test/api/library/catalog',{method:'POST',body:'{}'}),{DB:db},{id:2},'',h)).status,403);
});
test('catalog rejects nonofficial domains and javascript URLs',async()=>{
 for(const sourceUrl of ['javascript:alert(1)','https://ebsi.co.kr.attacker.test/a','https://attacker.test/a']){
 const response=await library(new Request('https://test/api/library/catalog',{method:'POST',body:JSON.stringify({sourceUrl,name:'test',subject:'수학'})}),{DB:db},{id:1,is_admin:1},'',h);assert.equal(response.status,400);
 }
});
test('private file reads constrain both id and user, never call storage for other owner',async()=>{
 const original=globalThis.fetch;const calls=[];globalThis.fetch=async url=>{calls.push(url);return Response.json({public:false})};
 let bound;
 const ownedDb={...db,prepare(sql){return {bind(...args){bound={sql,args};return this},first:async()=>null}}};
 try{const response=await library(new Request('https://test/api/library/files?id=someone-elses-file'),{DB:ownedDb,SUPABASE_URL:'https://test.storage',SUPABASE_SECRET_KEY:'key'},{id:2},'',h);assert.equal(response.status,404);assert.match(bound.sql,/id=\? AND user_id=\?/);assert.deepEqual(bound.args,['someone-elses-file',2]);assert.equal(calls.length,1);}finally{globalThis.fetch=original;}
});
test('public buckets refuse private PDF access',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({public:true});
 try{assert.equal((await library(new Request('https://test/api/library/files?id=x'),{DB:db,SUPABASE_URL:'https://storage',SUPABASE_SECRET_KEY:'key'},{id:2},'',h)).status,503);}finally{globalThis.fetch=original;}
});
import {migratePlans,bumpDrafts} from '../src/lib/planGraph.ts';
import {parseBackupValue} from '../src/lib/backupFormat.ts';
test('legacy daily plans migrate once and backup keeps resource/day/weekly relations',()=>{
 const data={calendar:{},sessions:[],scores:[],wrongAnswerDrills:[],dailyDrills:[{id:'d',date:'2026-09-30',subject:'수학',title:'test',action:'solve',minutes:30,done:false,capabilityGoalId:'weekly'}]};
 const first=migratePlans(data),second=migratePlans(first);assert.equal(second.calendar['2026-09-30'].plans.length,1);assert.equal(second.calendar['2026-09-30'].plans[0].weeklyPlanId,'weekly');
 first.calendar['2026-09-30'].dayLabel='BUMP';first.calendar['2026-09-30'].plans[0].resourceId='pdf';
 const restored=parseBackupValue({version:1,data:JSON.parse(JSON.stringify(first))},data).app;
 assert.equal(restored.calendar['2026-09-30'].dayLabel,'BUMP');assert.equal(restored.calendar['2026-09-30'].plans[0].resourceId,'pdf');assert.deepEqual(bumpDrafts(restored,'2026-10-01').map(p=>p.resourceId),['pdf']);
});
test('deleted migrated daily plan does not reappear on reload',()=>{
 const data={calendar:{},sessions:[],scores:[],wrongAnswerDrills:[],dailyDrills:[{id:'d',date:'2026-09-30',subject:'수학',title:'test',action:'solve',minutes:30,done:false}]};
 const migrated=migratePlans(data);migrated.calendar['2026-09-30'].plans=[];assert.equal(migratePlans(migrated).calendar['2026-09-30'].plans.length,0);
});
