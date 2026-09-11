# TRINITY OS Worker

The browser never calls NVIDIA NIM and never contains an NVIDIA API key. Its AI
entry points are authenticated Worker routes:

- POST /api/ai/daily-coach
- POST /api/ai/chat
- POST /api/ai/teacher-feedback-summary

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
