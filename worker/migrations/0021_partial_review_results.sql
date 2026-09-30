-- Preserve existing reviews while allowing a distinct partial retry result.
CREATE TABLE learning_reviews_next (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK(target_type IN ('wrong_answer','core_rule','drill','learning_item')),
  target_id TEXT NOT NULL,
  review_type TEXT NOT NULL DEFAULT 'retry',
  scheduled_at TEXT,
  reviewed_at TEXT,
  result TEXT NOT NULL DEFAULT 'pending' CHECK(result IN ('pending','success','partial','fail')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO learning_reviews_next SELECT id,user_id,target_type,target_id,review_type,scheduled_at,reviewed_at,result,notes,created_at,updated_at FROM learning_reviews;
DROP TABLE learning_reviews;
ALTER TABLE learning_reviews_next RENAME TO learning_reviews;
CREATE INDEX learning_reviews_user_target ON learning_reviews(user_id,target_type,target_id);
CREATE INDEX learning_reviews_user_schedule ON learning_reviews(user_id,result,scheduled_at);
CREATE INDEX learning_reviews_user_reviewed ON learning_reviews(user_id,target_type,target_id,reviewed_at DESC);
CREATE UNIQUE INDEX learning_reviews_pending_target ON learning_reviews(user_id,target_type,target_id) WHERE result='pending' AND review_type='followup';
