-- Additive security hardening. Apply after 0007.
ALTER TABLE users ADD COLUMN password_iterations INTEGER NOT NULL DEFAULT 100000;
ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN arena_public_id TEXT;
UPDATE users SET arena_public_id = 'arena_' || lower(hex(randomblob(16))) WHERE arena_public_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_arena_public_id ON users(arena_public_id);

ALTER TABLE support_accounts ADD COLUMN password_iterations INTEGER NOT NULL DEFAULT 100000;
ALTER TABLE api_tokens ADD COLUMN scopes TEXT NOT NULL DEFAULT 'sync:read,sync:write';

CREATE TABLE IF NOT EXISTS student_support_assignments (
  id TEXT PRIMARY KEY,
  student_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  support_account_id TEXT NOT NULL REFERENCES support_accounts(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('subject_teacher','academic_manager','parent','admin')),
  subject TEXT,
  permissions_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  UNIQUE(student_user_id, support_account_id, role, subject)
);
CREATE INDEX IF NOT EXISTS support_assignments_account ON student_support_assignments(support_account_id, role);
CREATE INDEX IF NOT EXISTS support_assignments_student ON student_support_assignments(student_user_id, role);

-- Preserve existing single-student relationships while moving them to real user ids.
INSERT OR IGNORE INTO student_support_assignments(id,student_user_id,support_account_id,role,subject,permissions_json,created_at)
SELECT 'migrated_' || x.id,
       CAST(substr(x.student_id, 9) AS INTEGER),
       x.teacher_id,
       x.role,
       x.subject,
       x.permissions_json,
       x.created_at
FROM student_teacher_assignments x
JOIN users u ON u.id = CAST(substr(x.student_id, 9) AS INTEGER)
WHERE x.student_id GLOB 'student-[0-9]*';

-- Legacy parent/tutor accounts previously saw user 1. Materialize that old relationship once.
INSERT OR IGNORE INTO student_support_assignments(id,student_user_id,support_account_id,role,subject,permissions_json,created_at)
SELECT 'legacy_' || a.id,
       (SELECT MIN(id) FROM users),
       a.id,
       CASE WHEN COALESCE(a.collaboration_role,a.role)='parent' THEN 'parent'
            WHEN COALESCE(a.collaboration_role,a.role)='academic_manager' THEN 'academic_manager'
            ELSE 'subject_teacher' END,
       CASE WHEN COALESCE(a.collaboration_role,a.role) IN ('parent','academic_manager') THEN NULL ELSE '수학' END,
       CASE WHEN COALESCE(a.collaboration_role,a.role)='parent' THEN '{"viewSessions":true,"viewScores":true,"viewCalendar":true,"viewWeeklyGoals":true,"viewDrills":true}'
            ELSE '{"viewSessions":true,"viewScores":true,"viewWrongAnswers":true,"viewMockExams":true,"viewCalendar":true,"viewWeeklyGoals":true,"viewDrills":true,"viewAcademicInsights":true,"createFeedback":true}' END,
       a.created_at
FROM support_accounts a
WHERE a.active=1 AND EXISTS (SELECT 1 FROM users);

ALTER TABLE teacher_feedback ADD COLUMN student_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
UPDATE teacher_feedback SET student_user_id=CAST(substr(student_id,9) AS INTEGER)
WHERE student_user_id IS NULL AND student_id GLOB 'student-[0-9]*';
CREATE INDEX IF NOT EXISTS feedback_student_user ON teacher_feedback(student_user_id,progress,created_at DESC);

CREATE TABLE IF NOT EXISTS student_login_attempts (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_rate_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS security_audit_logs (
  id TEXT PRIMARY KEY,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  created_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS security_audit_created ON security_audit_logs(created_at DESC);
