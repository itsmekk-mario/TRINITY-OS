import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseBackupValue} from '../src/lib/backupFormat.ts';

test('v1 backup import remains compatible and reports no Learning Archive',async()=>{
 const defaults={calendar:{},sessions:[],scores:[],wrongAnswerDrills:[]};
 const app={...defaults,sessions:[{id:'s',date:'2026-09-17',subject:'수학',seconds:60}]};
 const backup=parseBackupValue({version:1,data:app},defaults);
 assert.equal(backup.version,1);
 assert.equal(backup.app.sessions[0].id,'s');
 assert.equal(backup.learningArchive,undefined);
});
