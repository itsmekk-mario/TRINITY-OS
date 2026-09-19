# TRINITY OS self-hosted LiveKit

This stack runs a single-node LiveKit SFU and Caddy on the Windows home PC. It is sized for a small 4–6 person study room. D1 and the Study Room Durable Object remain on Cloudflare; only real-time audio/video uses this PC.

## Required network layout

- `cam.trinityos.mcv.kr` must be a Cloudflare **DNS-only** A record (gray cloud) pointing to the current public IPv4.
- Router forwards TCP `80`, TCP `443`, TCP `7881`, and UDP `7882` to `192.168.25.33`.
- Reserve `192.168.25.33` in the router's DHCP settings. The current lease is dynamic, so this is required before relying on forwarding rules.
- Caddy terminates HTTPS/WSS and proxies only signaling to LiveKit on internal port `7880`.
- WebRTC media reaches LiveKit directly on UDP `7882`; TCP `7881` is the fallback. Cloudflare's orange-cloud proxy does not carry these media ports.

No public IP is stored in this repository. If the ISP changes it, update the DNS A record manually or with a separately authorized Cloudflare DDNS client.

## Prerequisites

Install Docker Desktop for Windows from the official Docker documentation, enable the WSL 2 backend, and enable **Start Docker Desktop when you sign in**. This repository intentionally does not install Docker automatically.

Verify in PowerShell:

```powershell
docker --version
docker compose version
```

## Initialize secrets

From the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\initialize-livekit-env.ps1 -AcmeEmail you@example.com
```

The script creates `infra/livekit/.env` without printing the secret. `.env` files are ignored by Git. Use the same generated key and secret as Worker secrets; never copy them into frontend variables or `wrangler.toml`.

```powershell
cd worker
npx wrangler secret put LIVEKIT_API_KEY --config wrangler.toml
npx wrangler secret put LIVEKIT_API_SECRET --config wrangler.toml
```

Enter the values from `infra/livekit/.env` interactively. `LIVEKIT_URL=wss://cam.trinityos.mcv.kr` is non-secret and is already set in `wrangler.toml`.

## Start and verify

Run the read-only network diagnostic first:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\livekit-network-check.ps1
```

Preview and then apply the minimum firewall rules from an elevated PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-livekit-firewall.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\setup-livekit-firewall.ps1 -Apply
```

Start the stack:

```powershell
cd infra\livekit
docker compose up -d
docker compose ps
docker compose logs --tail 100
cd ..\..
powershell -ExecutionPolicy Bypass -File .\scripts\check-livekit.ps1
```

Both containers use `restart: unless-stopped`. Docker Desktop must itself start at Windows login for unattended reboot recovery.

## TLS and TURN notes

Caddy can obtain and renew the public certificate only after DNS points to this public IPv4 and inbound TCP 80/443 reaches this PC. A self-signed certificate is not valid for browser LiveKit clients.

Embedded TURN/TLS is intentionally disabled in this first home deployment. TURN/TLS needs a separate TURN hostname/certificate and normally TCP 443, which conflicts with Caddy without a layer-4 proxy. UDP `7882` plus ICE/TCP `7881` is the minimal supported deployment. If restrictive school/mobile networks cannot connect, add a dedicated TURN hostname and L4 configuration after the base path is proven.

## Security

- `LIVEKIT_API_SECRET` exists only in ignored `.env` and the Cloudflare Worker secret store.
- Join tokens last 10 minutes, are bound to one opaque D1 room ID and the authenticated participant identity, and permit only camera/microphone publish plus subscribe.
- The Worker issues tokens only while the same participant and connection ID are active in the room Durable Object.
- Port `7880` binds to host loopback only; Caddy is the sole public signaling endpoint.
