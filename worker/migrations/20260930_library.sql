CREATE TABLE IF NOT EXISTS library_catalog (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS library_files (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, path TEXT NOT NULL, name TEXT NOT NULL, size INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS library_files_owner ON library_files(user_id);
