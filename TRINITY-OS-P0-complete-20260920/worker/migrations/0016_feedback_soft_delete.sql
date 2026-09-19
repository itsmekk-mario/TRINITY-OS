ALTER TABLE teacher_feedback ADD COLUMN deleted_at TEXT;
ALTER TABLE teacher_feedback ADD COLUMN deleted_by TEXT;
CREATE INDEX IF NOT EXISTS feedback_visible_student ON teacher_feedback(student_user_id,deleted_at,created_at DESC);
