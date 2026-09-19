-- P0-3: additive feedback graph links. Existing context_type/context_target_id remain compatible.
CREATE TABLE IF NOT EXISTS teacher_feedback_links (
  feedback_id TEXT NOT NULL REFERENCES teacher_feedback(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK(target_type IN ('wrong_answer','core_rule','learning_item','drill','subject_progress','mock_exam')),
  target_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(feedback_id,target_type,target_id)
);
CREATE INDEX IF NOT EXISTS teacher_feedback_links_target
  ON teacher_feedback_links(user_id,target_type,target_id,created_at DESC);

-- Archive reviews remain readable for legacy clients; unified reads use learning_reviews.
INSERT OR IGNORE INTO learning_reviews(id,user_id,target_type,target_id,review_type,scheduled_at,reviewed_at,result,notes,created_at,updated_at)
SELECT 'archive-' || id,user_id,'learning_item',archive_entry_id,'archive_legacy',next_due_at,reviewed_at,
  CASE WHEN success=1 THEN 'success' ELSE 'fail' END,'Migrated from archive_reviews',created_at,created_at
FROM archive_reviews;
