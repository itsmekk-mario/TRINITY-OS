# TRINITY OS Security

## Authentication architecture

Student passwords are stored as PBKDF2-HMAC-SHA256 hashes with per-account salts and 100,000 iterations. Cloudflare Workers Web Crypto currently rejects higher PBKDF2 iteration counts, so the runtime-compatible ceiling is used consistently. Student sessions expire after seven days by default and can be configured with `SESSION_TTL_DAYS` (1–30). Password changes revoke every prior session.

Browser sessions and personal API tokens are distinct authorization types. Personal tokens are limited to explicit `sync:read` and/or `sync:write` scopes. They cannot change passwords, use AI endpoints, or mutate Arena state.

The production frontend currently uses a Bearer token because its Worker is hosted on a separate `workers.dev` origin. Before moving to HttpOnly cookies, attach the Worker to `api.trinityos.mcv.kr`, verify same-site behavior, and migrate clients without creating a login outage.

## Session handling

- `POST /api/auth/logout` deletes the current session server-side. The browser clears local authentication even if the request fails.
- Disabled users and expired or revoked sessions cannot authenticate.
- Student login failures are limited per IP, username, and 15-minute window. Unknown users and wrong passwords receive the same response and both perform PBKDF2 work.
- Support logout and account deactivation revoke support sessions in D1.

## Teacher and parent authorization

`student_support_assignments` is the authorization boundary. Every request resolves an opaque student public ID to a real user, verifies the authenticated support account's assignment, checks its role and permissions, and then reads `learning_state.user_id`. Subject teachers receive only their subject projection; parents receive a reduced academic summary without wrong-answer details, private journals, Plaire, Notion data, AI chats, tokens, or integration configuration.

## Arena integrity

`POST /api/arena/score` is disabled. `POST /api/arena/recalculate` ignores client scoring fields and calculates the score from the authenticated student's D1 learning state, using server time, server-selected season, and server-derived week. Rankings expose random Arena public IDs rather than numeric database user IDs. Private group ranking requires membership, and joining a private group requires its invite code.

## Secrets management

Never commit `SYNC_TOKEN`, `NVIDIA_API_KEY`, or `SUPABASE_SERVICE_ROLE_KEY`. Store them with Wrangler:

```bash
npx wrangler secret put SYNC_TOKEN --config wrangler.toml
npx wrangler secret put NVIDIA_API_KEY --config wrangler.toml
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config wrangler.toml
```

Supabase service-role credentials remain Worker-only. Upstream Supabase response bodies are not returned to clients. If a real credential was ever committed, rotate it in the provider console; removing it from current source does not invalidate it.

## Production deployment checklist

- [ ] `ALLOWED_ORIGIN` is the production frontend domain
- [ ] `NVIDIA_API_KEY` is stored as a Worker secret
- [ ] `SYNC_TOKEN` is stored as a Worker secret
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is stored as a Worker secret
- [ ] `ENVIRONMENT=production`
- [ ] `AI_DEBUG` is disabled
- [ ] Cloudflare HTTPS is enabled
- [ ] Admin endpoints are protected (Cloudflare Access recommended in front of `/api/admin/*`)
- [ ] Rate limiting is enabled
- [ ] `public/_headers` is deployed
- [ ] D1 migration `0008_security_hardening.sql` is applied
- [ ] Tests and production build pass
