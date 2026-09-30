-- Extend structured feedback; learning_state remains student-owned.
ALTER TABLE teacher_feedback ADD COLUMN signal_json TEXT;
