import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createLiveKitToken } from '../worker/src/study-room/livekit.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const decode = (value) => JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));

test('LiveKit JWT is short-lived, correctly signed, room-bound, and least-privilege', async () => {
  const result = await createLiveKitToken({
    apiKey: 'LK_test_key',
    apiSecret: 'test-secret-with-at-least-thirty-two-characters',
    serverUrl: 'wss://cam.trinityos.mcv.kr',
    roomId: 'room-123',
    identity: 'student-7',
    nowSeconds: 1_800_000_000,
  });
  const [header, payload, signature] = result.token.split('.');
  assert.deepEqual(decode(header), { alg: 'HS256', typ: 'JWT' });
  const claims = decode(payload);
  assert.equal(claims.iss, 'LK_test_key');
  assert.equal(claims.sub, 'student-7');
  assert.equal(claims.exp - claims.iat, 600);
  assert.deepEqual(claims.video, {
    room: 'trinity-study-room-123',
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
    canPublishSources: ['camera', 'microphone'],
  });
  assert.equal(
    signature,
    createHmac('sha256', 'test-secret-with-at-least-thirty-two-characters')
      .update(`${header}.${payload}`).digest('base64url'),
  );
});

test('token endpoint rejects unauthenticated and non-present users and does not trust client identity', () => {
  const routes = read('worker/src/study-room/routes.ts');
  const presence = read('worker/src/study-room/StudyRoomDurableObject.ts');
  assert.match(routes, /if \(!user\).*401/);
  assert.match(routes, /authorizeMediaToken\(participantId\(user\), connectionId\)/);
  assert.match(presence, /attachment\.connectionId !== connectionId/);
  assert.doesNotMatch(routes, /participantName|participantIdentity/);
  assert.match(routes, /activeRoom\(env\.DB, liveKitCode\)/);
});

test('Cloudflare Realtime SFU credentials and session APIs are removed', () => {
  const worker = read('worker/src/index.ts') + read('worker/src/study-room/routes.ts');
  const presence = read('worker/src/study-room/StudyRoomDurableObject.ts');
  const client = read('src/hooks/useLiveKitRoom.ts') + read('src/lib/studyRoom.ts');
  assert.doesNotMatch(worker + presence + client, /CALLS_APP_ID|CALLS_APP_SECRET|rtc\.live\.cloudflare\.com/);
  assert.doesNotMatch(presence, /registerRealtimeSession|beginRealtimeSession|registerPublishedTrack|subscriptionSource/);
  assert.match(client, /new Room\(/);
  assert.match(client, /createLiveKitAccess/);
});

test('camera and microphone acquisition are independently controlled and video is bandwidth-limited', () => {
  const media = read('src/hooks/useCamera.ts');
  const livekit = read('src/hooks/useLiveKitRoom.ts');
  assert.match(media, /width:\s*\{ ideal: 640, max: 640 \}/);
  assert.match(media, /height:\s*\{ ideal: 360, max: 360 \}/);
  assert.match(media, /frameRate:\s*\{ ideal: 15, max: 15 \}/);
  assert.match(media, /echoCancellation:\s*true/);
  assert.match(livekit, /maxBitrate:\s*450_000/);
  assert.match(livekit, /adaptiveStream:\s*true/);
  assert.match(livekit, /dynacast:\s*true/);
});

test('participant join/leave, camera/microphone state, cleanup, and reconnect remain implemented', () => {
  const presence = read('worker/src/study-room/StudyRoomDurableObject.ts');
  const roomHook = read('src/hooks/useStudyRoom.ts');
  const livekit = read('src/hooks/useLiveKitRoom.ts');
  assert.match(presence, /participant-joined/);
  assert.match(presence, /participant-left/);
  assert.match(presence, /microphone-state/);
  assert.match(roomHook, /scheduleReconnect/);
  assert.match(livekit, /RoomEvent\.Reconnecting/);
  assert.match(livekit, /RoomEvent\.Reconnected/);
  assert.match(livekit, /room\.disconnect\(true\)/);
  assert.match(livekit, /track\.detach\(\)\.forEach/);
});

test('LiveKit outage degrades media only while D1 room creation remains independent', () => {
  const routes = read('worker/src/study-room/routes.ts');
  const page = read('src/pages/StudyRoom.tsx');
  const lobby = read('src/pages/StudyRoomLobby.tsx');
  assert.match(routes, /INSERT INTO study_rooms/);
  assert.match(routes, /캠 서버가 아직 설정되지 않았습니다/);
  assert.match(page, /학습방 기능은 계속 작동합니다/);
  assert.match(lobby, /방 생성과 학습 기능은 계속 사용할 수 있으며/);
});

test('D1 schema stores metadata and never media payloads', () => {
  const migration = read('worker/migrations/0010_cam_study_rooms.sql');
  assert.match(migration, /study_rooms/);
  assert.match(migration, /study_room_members/);
  assert.doesNotMatch(migration, /video|blob|base64|media_stream/i);
});

test('self-hosted deployment uses pinned images, UDP mux, loopback signaling, and ignored secrets', () => {
  const compose = read('infra/livekit/docker-compose.yml');
  const config = read('infra/livekit/livekit.yaml');
  const gitignore = read('.gitignore');
  assert.match(compose, /livekit\/livekit-server:v1\.12\.0/);
  assert.match(compose, /127\.0\.0\.1:7880:7880\/tcp/);
  assert.match(config, /udp_port:\s*7882/);
  assert.doesNotMatch(config, /port_range_start|port_range_end|API_SECRET/);
  assert.match(gitignore, /\.env\*/);
});
