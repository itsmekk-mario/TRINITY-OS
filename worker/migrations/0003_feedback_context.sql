-- Keep feedback attached to the learning record that prompted it.
-- This is metadata only: teachers still cannot mutate student learning records.
ALTER TABLE teacher_feedback ADD COLUMN context_type TEXT NOT NULL DEFAULT 'general';
ALTER TABLE teacher_feedback ADD COLUMN context_target_id TEXT;
