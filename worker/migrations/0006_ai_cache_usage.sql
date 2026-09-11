-- Persistent AI response cache and quota observability.
-- Stores only context-derived cache keys and model responses, never prompts or API keys.
CREATE TABLE IF NOT EXISTS ai_cache (
  cache_key TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation TEXT NOT NULL,
  response TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_cache_expiry ON ai_cache(expires_at);

CREATE TABLE IF NOT EXISTS ai_usage (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  created_at TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 0,
  status_code INTEGER
);
CREATE INDEX IF NOT EXISTS ai_usage_user_created ON ai_usage(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_created ON ai_usage(created_at DESC);
