import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('CAM Study Room uses one Cloudflare Realtime SFU peer connection, not mesh signaling', () => {
  const sfu = read('src/hooks/useRealtimeSFU.ts');
  const presence = read('worker/src/study-room/StudyRoomDurableObject.ts');
  assert.equal((sfu.match(/new RTCPeerConnection/g) ?? []).length, 1);
  assert.match(sfu, /createRealtimeSession/);
  assert.match(sfu, /subscribeRealtimeTrack/);
  assert.doesNotMatch(presence, /ice-candidate|participant-unavailable/);
});

test('camera acquisition stays video-only and low bandwidth', () => {
  const camera = read('src/hooks/useCamera.ts');
  assert.match(camera, /audio:\s*false/);
  assert.match(camera, /ideal:\s*640/);
  assert.match(camera, /ideal:\s*480/);
  assert.match(camera, /ideal:\s*15/);
  assert.match(camera, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
});

test('Realtime credential is Worker-only and room capacity is ten', () => {
  const worker = read('worker/src/study-room/routes.ts');
  const client = read('src/lib/studyRoom.ts');
  const migration = read('worker/migrations/0010_cam_study_rooms.sql');
  assert.match(worker, /env\.CALLS_APP_SECRET/);
  assert.doesNotMatch(client, /CALLS_APP_SECRET|rtc\.live\.cloudflare\.com/);
  assert.match(migration, /BETWEEN 2 AND 10/);
});

test('D1 schema stores metadata and never media payloads', () => {
  const migration = read('worker/migrations/0010_cam_study_rooms.sql');
  assert.match(migration, /study_rooms/);
  assert.match(migration, /study_room_members/);
  assert.doesNotMatch(migration, /video|blob|base64|media_stream/i);
});
