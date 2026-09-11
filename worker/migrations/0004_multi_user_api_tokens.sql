-- Converts the original single-student schema into per-user storage.
-- Run this once against an existing D1 database before deploying the Worker.
-- Do not wrap this file in BEGIN/COMMIT. Wrangler's D1 import endpoint
-- manages file execution and rejects explicit SQL transaction statements.

CREATE TABLE users_next (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  salt TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
INSERT INTO users_next(id, username, password_hash, salt, is_admin, created_at)
  SELECT id, username, password_hash, salt, CASE WHEN id = 1 THEN 1 ELSE 0 END, created_at FROM users;
DROP TABLE users;
ALTER TABLE users_next RENAME TO users;

CREATE TABLE learning_state_next (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO learning_state_next(user_id, payload, updated_at)
  SELECT id, payload, updated_at FROM learning_state;
DROP TABLE learning_state;
ALTER TABLE learning_state_next RENAME TO learning_state;

CREATE TABLE learning_state_history_next (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  payload TEXT NOT NULL,
  saved_at TEXT NOT NULL
);
INSERT INTO learning_state_history_next(id, user_id, payload, saved_at)
  SELECT id, 1, payload, saved_at FROM learning_state_history;
DROP TABLE learning_state_history;
ALTER TABLE learning_state_history_next RENAME TO learning_state_history;

CREATE TABLE api_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS api_tokens_user_active ON api_tokens(user_id, revoked_at);
CREATE INDEX IF NOT EXISTS learning_state_history_user_saved ON learning_state_history(user_id, saved_at DESC);
