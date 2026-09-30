-- CAM Study Room metadata only. Camera media is never stored in D1.
CREATE TABLE IF NOT EXISTS study_rooms (
  id TEXT PRIMARY KEY,
  invite_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  owner_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  max_participants INTEGER NOT NULL DEFAULT 10 CHECK(max_participants BETWEEN 2 AND 10)
);

CREATE TABLE IF NOT EXISTS study_room_members (
  room_id TEXT NOT NULL REFERENCES study_rooms(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  left_at TEXT,
  PRIMARY KEY (room_id, user_id, joined_at)
);

CREATE INDEX IF NOT EXISTS study_rooms_invite_active ON study_rooms(invite_code, is_active);
CREATE INDEX IF NOT EXISTS study_room_members_open ON study_room_members(room_id, left_at);
