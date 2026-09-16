# TRINITY OS Cloudflare Worker

The Worker keeps authentication, D1 Study Room metadata, and Durable Object presence. Camera and microphone media are relayed by the self-hosted LiveKit server; Cloudflare Realtime SFU is no longer used.

## LiveKit bindings

`LIVEKIT_URL` is a non-secret variable in `wrangler.toml`:

```text
wss://cam.trinityos.mcv.kr
```

Store the key pair as Worker secrets. The API secret must never be put in Vite variables, frontend code, Git, or a plain Wrangler variable.

```powershell
npx wrangler secret put LIVEKIT_API_KEY --config wrangler.toml
npx wrangler secret put LIVEKIT_API_SECRET --config wrangler.toml
```

The token route requires an authenticated session and an active participant connection in the matching Study Room Durable Object. Tokens expire after 10 minutes, are bound to one opaque room and participant identity, and allow only camera/microphone publishing and subscribing.

## Endpoints

- `POST /api/study-rooms`
- `POST /api/study-rooms/join`
- `POST /api/study-rooms/:code/ticket`
- `GET /api/study-rooms/:code/websocket`
- `POST /api/study-rooms/:code/livekit/token`
- `GET /api/study-rooms/media-status`

The media status response exposes only `online` and a coarse status; it does not expose keys, internal addresses, or server details.

Deployment and Windows networking instructions are in `../infra/livekit/README.md`.
