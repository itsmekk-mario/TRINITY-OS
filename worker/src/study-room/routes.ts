import type { StudyRoomDurableObject } from './StudyRoomDurableObject.ts';
import { boundedJson } from '../security.ts';

type User = {
  id: number;
  username: string;
  arena_public_id?: string | null;
};

type RoomRow = {
  id: string;
  invite_code: string;
  name: string;
  owner_user_id: number;
  created_at: string;
  is_active: number;
  max_participants: number;
};

export interface StudyRoomRouteEnv {
  DB: D1Database;
  STUDY_ROOM: DurableObjectNamespace<StudyRoomDurableObject>;

  LIVEKIT_URL?: string;
  LIVEKIT_API_KEY?: string;
  LIVEKIT_API_SECRET?: string;
}

type Json = (
  body: unknown,
  status?: number,
  origin?: string,
  extra?: HeadersInit,
) => Response;

const CODE_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const encoder = new TextEncoder();

const roomDto = (row: RoomRow) => ({
  id: row.id,
  code: row.invite_code,
  name: row.name,
  maxParticipants: row.max_participants,
  createdAt: row.created_at,
});

const codeFromPath = (
  pathname: string,
  suffix = '',
) =>
  pathname.match(
    new RegExp(
      `^/api/study-rooms/([A-HJ-NP-Z2-9]{6,8})${suffix}$`,
    ),
  )?.[1] ?? '';

const inviteCode = () => {
  const bytes = new Uint8Array(6);

  crypto.getRandomValues(bytes);

  return [...bytes]
    .map(
      (value) =>
        CODE_ALPHABET[
          value % CODE_ALPHABET.length
        ],
    )
    .join('');
};

const participantId = (user: User) =>
  user.arena_public_id ||
  `student-${user.id}`;

async function activeRoom(
  db: D1Database,
  code: string,
) {
  return db
    .prepare(
      `
      SELECT
        id,
        invite_code,
        name,
        owner_user_id,
        created_at,
        is_active,
        max_participants
      FROM study_rooms
      WHERE invite_code=?
        AND is_active=1
      `,
    )
    .bind(code)
    .first<RoomRow>();
}

/**
 * 현재 사용자가 실제 Study Room presence에 들어와 있는지 확인한다.
 *
 * LiveKit token endpoint를 직접 호출해서
 * 10명 제한 / Study Room 참가 과정을 우회하는 것을 막는다.
 */
async function hasActiveMembership(
  db: D1Database,
  roomId: string,
  userId: number,
) {
  const row = await db
    .prepare(
      `
      SELECT 1 AS ok
      FROM study_room_members
      WHERE room_id=?
        AND user_id=?
        AND left_at IS NULL
      LIMIT 1
      `,
    )
    .bind(roomId, userId)
    .first<{ ok: number }>();

  return Boolean(row?.ok);
}

function base64Url(
  bytes: Uint8Array,
) {
  let binary = '';

  const chunkSize = 0x8000;

  for (
    let offset = 0;
    offset < bytes.length;
    offset += chunkSize
  ) {
    const chunk = bytes.subarray(
      offset,
      offset + chunkSize,
    );

    binary += String.fromCharCode(
      ...chunk,
    );
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function encodeJson(value: unknown) {
  return base64Url(
    encoder.encode(
      JSON.stringify(value),
    ),
  );
}

/**
 * LiveKit access token 생성.
 *
 * LiveKit은 HS256 JWT를 사용한다.
 *
 * 중요:
 * - API Secret은 Worker 밖으로 절대 노출하지 않는다.
 * - identity에는 실명/이메일 대신 TRINITY opaque participant ID 사용.
 * - camera source만 publish 허용.
 * - microphone / screen share / data publish 금지.
 */
async function createLiveKitToken(
  env: StudyRoomRouteEnv,
  room: RoomRow,
  user: User,
) {
  const apiKey =
    env.LIVEKIT_API_KEY?.trim();

  const apiSecret =
    env.LIVEKIT_API_SECRET?.trim();

  const rawUrl =
    env.LIVEKIT_URL?.trim();

  if (
    !apiKey ||
    !apiSecret ||
    !rawUrl
  ) {
    throw new Error(
      'LIVEKIT_NOT_CONFIGURED',
    );
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new Error(
      'LIVEKIT_URL_INVALID',
    );
  }

  if (
    parsedUrl.protocol !== 'ws:' &&
    parsedUrl.protocol !== 'wss:'
  ) {
    throw new Error(
      'LIVEKIT_URL_INVALID',
    );
  }

  const identity =
    participantId(user);

  /**
   * 표시용 방 이름을 LiveKit room name으로 직접 사용하지 않는다.
   *
   * UUID 기반 opaque room name을 사용해
   * 사용자 입력값/PII가 LiveKit 로그 등에 남는 범위를 줄인다.
   */
  const roomName =
    `trinity-study-${room.id}`;

  const now =
    Math.floor(Date.now() / 1000);

  /**
   * 2시간짜리 접속 토큰.
   *
   * 만료 후 완전히 재접속하면
   * Worker에서 새 토큰을 다시 발급받으면 된다.
   */
  const expiresAt =
    now + 2 * 60 * 60;

  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const payload = {
    iss: apiKey,

    sub: identity,

    /**
     * 작은 시간 오차(clock skew)를 허용한다.
     */
    nbf: now - 5,

    exp: expiresAt,

    video: {
      room: roomName,

      roomJoin: true,

      canSubscribe: true,

      canPublish: true,

      /**
       * LiveKit DataChannel 기반 사용자 데이터 송신은
       * 캠스터디 MVP에서 사용하지 않는다.
       */
      canPublishData: false,

      /**
       * microphone / screen share 차단.
       */
      canPublishSources: [
        'camera',
      ],
    },
  };

  const headerEncoded =
    encodeJson(header);

  const payloadEncoded =
    encodeJson(payload);

  const unsignedToken =
    `${headerEncoded}.${payloadEncoded}`;

  const key =
    await crypto.subtle.importKey(
      'raw',
      encoder.encode(apiSecret),
      {
        name: 'HMAC',
        hash: 'SHA-256',
      },
      false,
      ['sign'],
    );

  const signatureBuffer =
    await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(
        unsignedToken,
      ),
    );

  const signature =
    base64Url(
      new Uint8Array(
        signatureBuffer,
      ),
    );

  return {
    token:
      `${unsignedToken}.${signature}`,

    url:
      rawUrl.replace(/\/+$/, ''),

    roomName,

    expiresAt:
      expiresAt * 1000,
  };
}

export async function connectStudyRoomWebSocket(
  request: Request,
  env: StudyRoomRouteEnv,
): Promise<Response | null> {
  const url =
    new URL(request.url);

  const code =
    codeFromPath(
      url.pathname,
      '/websocket',
    );

  if (
    !code ||
    request.method !== 'GET'
  ) {
    return null;
  }

  if (
    request.headers
      .get('Upgrade')
      ?.toLowerCase() !==
    'websocket'
  ) {
    return new Response(
      'WebSocket upgrade required',
      {
        status: 426,
      },
    );
  }

  return env.STUDY_ROOM
    .getByName(code)
    .fetch(request);
}

export async function handleStudyRoomApi(
  request: Request,
  env: StudyRoomRouteEnv,
  user: User | null,
  origin: string,
  json: Json,
): Promise<Response | null> {
  const url =
    new URL(request.url);

  if (
    !url.pathname.startsWith(
      '/api/study-rooms',
    )
  ) {
    return null;
  }

  if (!user) {
    return json(
      {
        error:
          '로그인이 필요합니다.',
      },
      401,
      origin,
    );
  }

  /**
   * Study Room 생성
   */
  if (
    url.pathname ===
      '/api/study-rooms' &&
    request.method === 'POST'
  ) {
    const body =
      await boundedJson<{
        name?: unknown;
        maxParticipants?: unknown;
      }>(request);

    const name =
      typeof body.name === 'string'
        ? body.name
            .trim()
            .slice(0, 40)
        : '';

    const requestedMax =
      Number(
        body.maxParticipants,
      );

    const maxParticipants =
      Number.isInteger(
        requestedMax,
      ) &&
      requestedMax >= 2 &&
      requestedMax <= 10
        ? requestedMax
        : 10;

    if (!name) {
      return json(
        {
          error:
            '방 이름을 입력해 주세요.',
        },
        400,
        origin,
      );
    }

    const id =
      crypto.randomUUID();

    const createdAt =
      new Date().toISOString();

    for (
      let attempt = 0;
      attempt < 8;
      attempt += 1
    ) {
      const code =
        inviteCode();

      try {
        await env.DB
          .prepare(
            `
            INSERT INTO study_rooms(
              id,
              invite_code,
              name,
              owner_user_id,
              created_at,
              is_active,
              max_participants
            )
            VALUES(?,?,?,?,?,1,?)
            `,
          )
          .bind(
            id,
            code,
            name,
            user.id,
            createdAt,
            maxParticipants,
          )
          .run();

        return json(
          {
            room: {
              id,
              code,
              name,
              maxParticipants,
              createdAt,
            },
          },
          201,
          origin,
        );
      } catch (error) {
        if (
          !String(error)
            .toLowerCase()
            .includes('unique')
        ) {
          throw error;
        }
      }
    }

    return json(
      {
        error:
          '방 코드를 만들지 못했습니다. 다시 시도해 주세요.',
      },
      503,
      origin,
    );
  }

  /**
   * Study Room invite code 확인
   */
  if (
    url.pathname ===
      '/api/study-rooms/join' &&
    request.method === 'POST'
  ) {
    const body =
      await boundedJson<{
        code?: unknown;
      }>(request);

    const code =
      typeof body.code === 'string'
        ? body.code
            .toUpperCase()
            .replace(
              /[^A-HJ-NP-Z2-9]/g,
              '',
            )
            .slice(0, 8)
        : '';

    const room =
      code
        ? await activeRoom(
            env.DB,
            code,
          )
        : null;

    return room
      ? json(
          {
            room:
              roomDto(room),
          },
          200,
          origin,
        )
      : json(
          {
            error:
              '존재하지 않거나 종료된 Study Room입니다.',
          },
          404,
          origin,
        );
  }

  /**
   * Durable Object WebSocket ticket 발급.
   *
   * 기존 presence 구조를 그대로 유지한다.
   */
  const ticketCode =
    codeFromPath(
      url.pathname,
      '/ticket',
    );

  if (
    ticketCode &&
    request.method === 'POST'
  ) {
    const room =
      await activeRoom(
        env.DB,
        ticketCode,
      );

    if (!room) {
      return json(
        {
          error:
            '존재하지 않거나 종료된 Study Room입니다.',
        },
        404,
        origin,
      );
    }

    const tokenBytes =
      new Uint8Array(32);

    crypto.getRandomValues(
      tokenBytes,
    );

    const token =
      [...tokenBytes]
        .map((value) =>
          value
            .toString(16)
            .padStart(2, '0'),
        )
        .join('');

    const expiresAt =
      Date.now() + 60_000;

    const connectionId =
      crypto.randomUUID();

    try {
      await env.STUDY_ROOM
        .getByName(ticketCode)
        .createTicket({
          token,
          expiresAt,
          roomId: room.id,
          roomName: room.name,
          maxParticipants:
            room.max_participants,
          userId: user.id,
          participantId:
            participantId(user),
          username:
            user.username,
          connectionId,
        });
    } catch (error) {
      if (
        String(error)
          .toLowerCase()
          .includes('full')
      ) {
        return json(
          {
            error:
              '이 Study Room은 현재 가득 찼습니다.',
          },
          409,
          origin,
        );
      }

      throw error;
    }

    return json(
      {
        ticket: token,
        expiresAt,
        websocketPath:
          `/api/study-rooms/${ticketCode}/websocket`,
        room:
          roomDto(room),
      },
      200,
      origin,
    );
  }

  /**
   * LiveKit access token 발급
   *
   * Cloudflare Realtime의:
   *
   * /realtime/session
   * /realtime/publish
   * /realtime/subscribe
   * /realtime/renegotiate
   *
   * 를 전부 대체한다.
   */
  const liveKitCode =
    codeFromPath(
      url.pathname,
      '/livekit/token',
    );

  if (
    liveKitCode &&
    request.method === 'POST'
  ) {
    const room =
      await activeRoom(
        env.DB,
        liveKitCode,
      );

    if (!room) {
      return json(
        {
          error:
            '존재하지 않거나 종료된 Study Room입니다.',
        },
        404,
        origin,
      );
    }

    /**
     * 먼저 Durable Object WebSocket presence에
     * 정상적으로 들어온 사용자만 LiveKit token 발급.
     *
     * 따라서 token endpoint 직접 호출로
     * 최대 인원 제한을 우회하기 어렵게 한다.
     */
    const member =
      await hasActiveMembership(
        env.DB,
        room.id,
        user.id,
      );

    if (!member) {
      return json(
        {
          error:
            'Study Room 연결을 먼저 완료해 주세요.',
        },
        409,
        origin,
      );
    }

    try {
      const access =
        await createLiveKitToken(
          env,
          room,
          user,
        );

      return json(
        access,
        200,
        origin,
        {
          'Cache-Control':
            'no-store',
        },
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : '';

      if (
        message ===
          'LIVEKIT_NOT_CONFIGURED' ||
        message ===
          'LIVEKIT_URL_INVALID'
      ) {
        return json(
          {
            error:
              'LiveKit 서버 설정이 필요합니다.',
          },
          503,
          origin,
        );
      }

      console.error(
        JSON.stringify({
          message:
            'LiveKit token creation failed',
          roomId:
            room.id,
          participantId:
            participantId(user),
        }),
      );

      return json(
        {
          error:
            'LiveKit 접속 토큰을 만들지 못했습니다.',
        },
        500,
        origin,
      );
    }
  }

  return json(
    {
      error: 'Not found',
    },
    404,
    origin,
  );
}