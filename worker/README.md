# TRINITY OS Worker

The browser never calls NVIDIA NIM and never contains an NVIDIA API key. Its AI
entry points are authenticated Worker routes:

- POST /api/ai/daily-coach (deprecated; returns 410 without calling AI)
- POST /api/ai/study-analysis
- POST /api/ai/chat
- POST /api/ai/teacher-feedback-summary
- POST /api/ai/arena-coach

TRINITY Arena uses authenticated routes under `/api/arena` for nickname-only
profiles, goal groups, score snapshots, rankings, rivals, seasons, and badges.
These tables are separate from `learning_state`; public ranking responses never
include the student's private learning payload.

Architecture:

AppData → local Analytics/Rule Engine → Dashboard

Explicit user request → compressed context → Worker → D1 cache/budget → AI provider → NVIDIA NIM

src/lib/ai/providers/nvidia-kimi.ts owns the NVIDIA HTTP contract, timeout,
single-attempt request, error parsing, and response validation. Routes only validate
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
| AI_MAX_RETRIES | 0 | Compatibility setting; provider requests are never retried |
| AI_USER_DAILY_LIMIT | 12 | Maximum provider cache misses per user per UTC day |
| AI_GLOBAL_DAILY_LIMIT | 100 | Maximum provider cache misses across users per UTC day |
| AI_CHAT_COOLDOWN_SECONDS | 8 | Minimum interval between uncached chat requests |
| AI_DEBUG | unset | Set true only in development to log provider status without prompts or keys |

429, 401, 403, 5xx, invalid responses, and timeouts have distinct user-safe
messages. In development, AI_DEBUG=true writes structured provider status logs.
Prompts, provider error bodies, and API keys are not logged or returned to the browser.

## Request protection

- Browser: 30-minute explicit-analysis cache, semantic cache keys, request
  coalescing, and a 35-second client timeout.
- Worker: persistent D1 cache (30-minute study/Arena, 10-minute feedback, 5-minute
  chat), per-user/global daily limits, and a configurable chat cooldown.
- NVIDIA: exactly one HTTP attempt. 401, 403, 429, 5xx, network failures, and
  timeouts are never retried automatically.

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

Add the persistent AI cache and usage ledger before deploying the local-first Coach:

    npx wrangler d1 execute trinity-os-db --remote --file=./migrations/0006_ai_cache_usage.sql --config wrangler.toml

`/api/ai/daily-coach` is retained only as a non-AI `410 Gone` compatibility response.
The app calls `/api/ai/study-analysis` only after an explicit button click. Responses
are cached in D1 by user, operation, and a context hash. Prompt bodies and API keys
are never written to D1.

AI budget variables are intentionally independent of NVIDIA's current product limits:

- `AI_USER_DAILY_LIMIT` (default config: `12`)
- `AI_GLOBAL_DAILY_LIMIT` (default config: `100`)
- `AI_CHAT_COOLDOWN_SECONDS` (default config: `8`)

Every cache miss that reaches the provider is recorded in `ai_usage`. Inspect daily
volume without storing prompts:

    SELECT operation, success, status_code, COUNT(*) AS calls
    FROM ai_usage
    WHERE date(created_at) >= date('now', '-6 day')
    GROUP BY operation, success, status_code;

For a brand-new database, use `schema.sql` as usual. `SYNC_TOKEN` remains a
Worker secret and is only used by the administrator to issue or revoke personal
tokens. Never give `SYNC_TOKEN` to a user. The student UI continues to use the
existing username/password login; personal tokens are optional for managed access.

Create a username/password student account from PowerShell. This is the account
used by the Korean student login screen; no infrastructure or personal API token
is sent to the student:

    $workerUrl = 'https://YOUR-WORKER.workers.dev'
    $setupSecret = Read-Host 'SYNC_TOKEN' -AsSecureString
    $setupToken = [Net.NetworkCredential]::new('', $setupSecret).Password
    $student = Get-Credential -Message 'New student username and password'
    $body = @{ username = $student.UserName; password = $student.GetNetworkCredential().Password } | ConvertTo-Json
    Invoke-RestMethod -Method Post -Uri "$workerUrl/api/admin/students" -Headers @{ 'X-Setup-Token' = $setupToken } -ContentType 'application/json' -Body $body

`POST /api/admin/students` accepts usernames containing ASCII letters, numbers,
periods, underscores, and hyphens (3-40 characters), and passwords of 8-128
characters. Duplicate usernames return HTTP `409`. Public self-registration is
intentionally disabled.

Issue a personal token from PowerShell (the returned `token` is shown only in
this response, so deliver it over a secure channel):

    $setupToken = Read-Host 'SYNC_TOKEN'
    Invoke-RestMethod -Method Post -Uri 'https://YOUR-WORKER.workers.dev/api/admin/access-tokens' -Headers @{ 'X-Setup-Token' = $setupToken; 'Content-Type' = 'application/json' } -Body '{"username":"student-a","label":"student-a personal device"}'

On a new deployment, create the administrator's own token first by adding
`"admin":true` to that JSON body. Normal user tokens must omit it.

To immediately invalidate every token issued for one user:

    Invoke-RestMethod -Method Delete -Uri 'https://YOUR-WORKER.workers.dev/api/admin/access-tokens/student-a' -Headers @{ 'X-Setup-Token' = $setupToken }
