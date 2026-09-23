CREATE TABLE IF NOT EXISTS ypt_connections (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  encrypted_jwt TEXT NOT NULL,
  subjects_json TEXT NOT NULL,
  mapping_json TEXT NOT NULL DEFAULT '{}',
  state TEXT NOT NULL DEFAULT 'idle' CHECK (state IN ('idle', 'starting', 'running', 'stopping', 'uncertain')),
  active_started_at INTEGER,
  active_subject TEXT,
  pending_id TEXT,
  connected_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
