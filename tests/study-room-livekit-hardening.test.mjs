import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('LiveKit reconnect does not stop browser-owned camera or microphone tracks', () => {
  const livekit = read('src/hooks/useLiveKitRoom.ts');
  assert.doesNotMatch(livekit, /room\.disconnect\(true\)/);
  assert.match(livekit, /room\.disconnect\(false\)/);
});

test('remote audio autoplay failure exposes a user-gesture recovery path', () => {
  const livekit = read('src/hooks/useLiveKitRoom.ts');
  const page = read('src/pages/StudyRoom.tsx');
  assert.match(livekit, /RoomEvent\.AudioPlaybackStatusChanged/);
  assert.match(livekit, /room\.canPlaybackAudio/);
  assert.match(livekit, /room\.startAudio\(\)/);
  assert.match(page, /오디오 켜기/);
});

test('pending getUserMedia requests cannot resurrect camera or microphone after stop', () => {
  const media = read('src/hooks/useCamera.ts');
  assert.match(media, /cameraRequest/);
  assert.match(media, /microphoneRequest/);
  assert.match(media, /cameraRequest\.current !== requestId \|\| !cameraWanted\.current/);
  assert.match(media, /microphoneRequest\.current !== requestId \|\| !microphoneWanted\.current/);
});

test('duplicate presence connection is surfaced instead of pretending to remain connected', () => {
  const room = read('src/hooks/useStudyRoom.ts');
  assert.match(room, /event\.code === 4001/);
  assert.match(room, /setPresenceState\('offline'\)/);
  assert.match(room, /다른 탭 또는 기기/);
});
