CREATE TABLE IF NOT EXISTS quick_capture_requests (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('processing','completed','failed')),
  result_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id,request_id)
);
CREATE INDEX IF NOT EXISTS quick_capture_requests_user_updated ON quick_capture_requests(user_id,updated_at DESC);
