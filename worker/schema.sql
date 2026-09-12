CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  salt TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  password_changed_at TEXT,
  password_iterations INTEGER NOT NULL DEFAULT 100000,
  active INTEGER NOT NULL DEFAULT 1,
  arena_public_id TEXT UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS api_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  label TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT 'sync:read,sync:write',
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS api_tokens_user_active ON api_tokens(user_id, revoked_at);
CREATE TABLE IF NOT EXISTS learning_state (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS learning_state_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  payload TEXT NOT NULL,
  saved_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS learning_state_history_user_saved ON learning_state_history(user_id, saved_at DESC);

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

CREATE TABLE IF NOT EXISTS student_login_attempts (key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS admin_rate_limits (key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS security_audit_logs (
  id TEXT PRIMARY KEY, actor_type TEXT NOT NULL, actor_id TEXT, action TEXT NOT NULL,
  target_type TEXT, target_id TEXT, created_at TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS security_audit_created ON security_audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS arena_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL UNIQUE,
  grade TEXT NOT NULL DEFAULT '',
  target_university TEXT NOT NULL DEFAULT '',
  target_department TEXT NOT NULL DEFAULT '',
  target_admission_type TEXT NOT NULL DEFAULT '',
  study_goal TEXT NOT NULL DEFAULT '[]',
  achievement_level TEXT NOT NULL DEFAULT '',
  profile_image TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS arena_groups (
  id TEXT PRIMARY KEY,
  owner_user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('university','department','custom')),
  target_university TEXT NOT NULL DEFAULT '',
  target_department TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL CHECK(visibility IN ('public','private')),
  invite_code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS arena_group_members (
  group_id TEXT NOT NULL REFERENCES arena_groups(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TEXT NOT NULL,
  PRIMARY KEY(group_id, user_id)
);
CREATE TABLE IF NOT EXISTS arena_seasons (id TEXT PRIMARY KEY,name TEXT NOT NULL,starts_at TEXT NOT NULL,ends_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS arena_season_preferences (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season_id TEXT NOT NULL REFERENCES arena_seasons(id) ON DELETE CASCADE,
  custom_name TEXT NOT NULL CHECK(length(custom_name) BETWEEN 2 AND 32),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id, season_id)
);
CREATE INDEX IF NOT EXISTS arena_season_preferences_season ON arena_season_preferences(season_id);
CREATE TABLE IF NOT EXISTS arena_score_snapshots (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season_id TEXT NOT NULL REFERENCES arena_seasons(id),
  week_start TEXT NOT NULL,
  score INTEGER NOT NULL,
  execution INTEGER NOT NULL,
  problem_solving INTEGER NOT NULL,
  consistency INTEGER NOT NULL,
  growth INTEGER NOT NULL,
  growth_rate REAL NOT NULL DEFAULT 0,
  metrics TEXT NOT NULL DEFAULT '{}',
  calculated_at TEXT NOT NULL,
  UNIQUE(user_id, season_id, week_start)
);
CREATE INDEX IF NOT EXISTS arena_scores_season_score ON arena_score_snapshots(season_id, score DESC);
CREATE TABLE IF NOT EXISTS arena_rivals (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rival_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id, rival_user_id),
  CHECK(user_id <> rival_user_id)
);
CREATE TABLE IF NOT EXISTS arena_achievements (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  awarded_at TEXT NOT NULL,
  UNIQUE(user_id, code)
);
INSERT OR IGNORE INTO arena_seasons(id,name,starts_at,ends_at) VALUES('suneung-2028-fall','2028 수능 시즌','2026-09-01','2026-12-31');
