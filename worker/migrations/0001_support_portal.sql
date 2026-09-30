CREATE TABLE IF NOT EXISTS support_accounts (
 id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, role TEXT NOT NULL CHECK(role IN ('tutor','parent')),
 password_hash TEXT NOT NULL, salt TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS support_sessions (
 token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES support_accounts(id), expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS support_comments (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES support_accounts(id),
 target TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS support_comments_created ON support_comments(created_at);
CREATE TABLE IF NOT EXISTS support_login_attempts (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS exam_documents (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, agency TEXT NOT NULL, year INTEGER NOT NULL,
 subject TEXT NOT NULL, object_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
);
