export type LiveKitTokenInput = {
  apiKey: string;
  apiSecret: string;
  serverUrl: string;
  roomId: string;
  identity: string;
  ttlSeconds?: number;
  nowSeconds?: number;
};

const encoder = new TextEncoder();

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function encodeJson(value: unknown): string {
  return base64Url(encoder.encode(JSON.stringify(value)));
}

export function liveKitHttpUrl(serverUrl: string): string {
  const url = new URL(serverUrl.trim());
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') throw new Error('LIVEKIT_URL_INVALID');
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url.toString();
}

export async function createLiveKitToken(input: LiveKitTokenInput) {
  const apiKey = input.apiKey.trim();
  const apiSecret = input.apiSecret.trim();
  const serverUrl = input.serverUrl.trim().replace(/\/+$/, '');
  if (!apiKey || !apiSecret || !serverUrl) throw new Error('LIVEKIT_NOT_CONFIGURED');
  liveKitHttpUrl(serverUrl);

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const ttl = Math.min(15 * 60, Math.max(60, input.ttlSeconds ?? 10 * 60));
  const expiresAt = now + ttl;
  const roomName = `trinity-study-${input.roomId}`;
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: apiKey,
    sub: input.identity,
    iat: now,
    nbf: now - 5,
    exp: expiresAt,
    jti: crypto.randomUUID(),
    video: {
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
      canPublishSources: ['camera', 'microphone', 'screen_share', 'screen_share_audio'],
    },
  };

  const unsigned = `${encodeJson(header)}.${encodeJson(payload)}`;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(apiSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(unsigned));

  return {
    token: `${unsigned}.${base64Url(new Uint8Array(signature))}`,
    url: serverUrl,
    roomName,
    expiresAt: expiresAt * 1000,
  };
}

