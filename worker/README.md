# TRINITY OS Worker

The browser never calls NVIDIA NIM and never contains an NVIDIA API key. Its AI
entry points are authenticated Worker routes:

- POST /api/ai/daily-coach
- POST /api/ai/chat
- POST /api/ai/teacher-feedback-summary
- POST /api/ai/arena-coach

TRINITY Arena uses authenticated routes under `/api/arena` for nickname-only
profiles, goal groups, score snapshots, rankings, rivals, seasons, and badges.
These tables are separate from `learning_state`; public ranking responses never
include the student's private learning payload.

Architecture:

React component → src/lib/aiCoach.ts → Worker route → AI service → AI provider → NVIDIA NIM

src/lib/ai/providers/nvidia-kimi.ts owns the NVIDIA HTTP contract, timeout,
bounded retry, error parsing, and response validation. Routes only validate
input and build prompts. A future provider is added behind the AIProvider
interface without changing routes or React components.

## Required secret

Set NVIDIA_API_KEY only as a Worker secret; do not put it in wrangler.toml,
Vite variables, localStorage, or client source code.

    cd worker
    npx wrangler secret put NVIDIA_API_KEY --config wrangler.toml

## Non-secret configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| AI_PROVIDER | nvidia-kimi | Provider selected by the service layer |
| NVIDIA_MODEL | moonshotai/kimi-k3 | Optional NIM model override |
| NVIDIA_BASE_URL | NVIDIA chat completions URL | Optional NIM-compatible endpoint override |
| AI_TIMEOUT_MS | 25000 | Bounded to 1–60 seconds |
| AI_MAX_RETRIES | 1 | Bounded to 0–2; retries only network/5xx failures |
| AI_DEBUG | unset | Set true only in development to log provider status and response body |

429, 401, 403, 5xx, invalid responses, and timeouts have distinct user-safe
messages. In development, AI_DEBUG=true writes the actual NVIDIA status and
truncated error body to Worker logs. Provider response bodies and API keys are
never returned to the browser.

## Request protection

- Browser: 30-minute daily-coach cache, semantic cache keys, request
  coalescing, and a 35-second client timeout.
- Worker: 30-minute daily cache, 10-minute feedback-summary cache, in-flight
  coalescing, and per-user cooldowns (15 seconds for summaries, 2.5 seconds for
  chat).
- NVIDIA: no retry on 401, 403, or 429; at most one jittered retry for
  transient network/5xx failures.

The Worker cache and cooldown are isolate-local by design. For a multi-instance,
high-traffic deployment, move those controls to a Durable Object or KV while
keeping the same AIService interface.

## Deploy

    npm install
    npx wrangler d1 execute trinity-os-db --remote --file=./schema.sql --config wrangler.toml
    npx wrangler deploy --config wrangler.toml

## Personal API tokens and separate workspaces

Do not share a Cloudflare API token or a D1 token with an app user. Those are
infrastructure credentials. The Worker now issues its own personal tokens
(`trinity_pat_...`), and only stores a SHA-256 hash of each token in D1.
Every token belongs to one `users.id`; sync reads and writes are filtered by
that id, so one user's learning data cannot be returned for another user's
token.

For an existing deployment, migrate D1 before deploying the new Worker:

    npx wrangler d1 execute trinity-os-db --remote --file=./migrations/0004_multi_user_api_tokens.sql --config wrangler.toml

Then add the Arena tables and initial 2028 season:

    npx wrangler d1 execute trinity-os-db --remote --file=./migrations/0005_trinity_arena.sql --config wrangler.toml

For a brand-new database, use `schema.sql` as usual. `SYNC_TOKEN` remains a
Worker secret and is only used by the administrator to issue or revoke personal
tokens. Never give `SYNC_TOKEN` to a user.

Issue a personal token from PowerShell (the returned `token` is shown only in
this response, so deliver it over a secure channel):

    $setupToken = Read-Host 'SYNC_TOKEN'
    Invoke-RestMethod -Method Post -Uri 'https://YOUR-WORKER.workers.dev/api/admin/access-tokens' -Headers @{ 'X-Setup-Token' = $setupToken; 'Content-Type' = 'application/json' } -Body '{"username":"student-a","label":"student-a personal device"}'

On a new deployment, create the administrator's own token first by adding
`"admin":true` to that JSON body. Normal user tokens must omit it. Each user
enters only the Worker URL and their personal `trinity_pat_...` token on the
login screen.

To immediately invalidate every token issued for one user:

    Invoke-RestMethod -Method Delete -Uri 'https://YOUR-WORKER.workers.dev/api/admin/access-tokens/student-a' -Headers @{ 'X-Setup-Token' = $setupToken }
