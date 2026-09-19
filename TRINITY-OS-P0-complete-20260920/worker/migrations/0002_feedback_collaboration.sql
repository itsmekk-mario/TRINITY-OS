-- Additive migration: existing tutor/parent accounts and student learning_state remain intact.
ALTER TABLE support_accounts ADD COLUMN collaboration_role TEXT;
UPDATE support_accounts SET collaboration_role = CASE role WHEN 'tutor' THEN 'subject_teacher' WHEN 'parent' THEN 'parent' ELSE role END WHERE collaboration_role IS NULL;

CREATE TABLE IF NOT EXISTS student_teacher_assignments (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  teacher_id TEXT NOT NULL REFERENCES support_accounts(id),
  role TEXT NOT NULL CHECK(role IN ('subject_teacher','academic_manager')),
  subject TEXT,
  permissions_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  CHECK ((role = 'academic_manager' AND subject IS NULL) OR (role = 'subject_teacher' AND subject IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS assignments_teacher ON student_teacher_assignments(teacher_id, role);

CREATE TABLE IF NOT EXISTS teacher_feedback (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  teacher_id TEXT NOT NULL REFERENCES support_accounts(id),
  type TEXT NOT NULL CHECK(type IN ('subject','academic_management')),
  subject TEXT,
  title TEXT,
  categories_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK(status IN ('needs_improvement','normal','stable')),
  progress TEXT NOT NULL DEFAULT 'active' CHECK(progress IN ('active','achieved','replaced','archived')),
  bottleneck TEXT,
  observation TEXT,
  action TEXT,
  success_criterion TEXT,
  comment TEXT,
  linked_weekly_goal_id TEXT,
  linked_daily_drill_id TEXT,
  acknowledged_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS feedback_student ON teacher_feedback(student_id, progress, created_at DESC);
CREATE TABLE IF NOT EXISTS teacher_feedback_audit (
  id TEXT PRIMARY KEY,
  feedback_id TEXT NOT NULL REFERENCES teacher_feedback(id),
  editor_id TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  edited_at TEXT NOT NULL
);
