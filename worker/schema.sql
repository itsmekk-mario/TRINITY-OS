CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  salt TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  password_changed_at TEXT,
  password_iterations INTEGER NOT NULL DEFAULT 100000,
  active INTEGER NOT NULL DEFAULT 1,
  arena_public_id TEXT UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ypt_connections (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  encrypted_jwt TEXT NOT NULL,
  subjects_json TEXT NOT NULL,
  mapping_json TEXT NOT NULL DEFAULT '{}',
  state TEXT NOT NULL DEFAULT 'idle' CHECK (state IN ('idle', 'starting', 'running', 'stopping', 'uncertain')),
  active_started_at INTEGER,
  active_subject TEXT,
  pending_id TEXT,
  connected_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS api_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  label TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT 'sync:read,sync:write',
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS api_tokens_user_active ON api_tokens(user_id, revoked_at);
CREATE TABLE IF NOT EXISTS learning_state (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS learning_state_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  payload TEXT NOT NULL,
  saved_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS learning_state_history_user_saved ON learning_state_history(user_id, saved_at DESC);

CREATE TABLE IF NOT EXISTS ai_cache (
  cache_key TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation TEXT NOT NULL,
  response TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_cache_expiry ON ai_cache(expires_at);
CREATE TABLE IF NOT EXISTS ai_usage (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  created_at TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 0,
  status_code INTEGER
);
CREATE INDEX IF NOT EXISTS ai_usage_user_created ON ai_usage(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_created ON ai_usage(created_at DESC);

CREATE TABLE IF NOT EXISTS student_login_attempts (key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS admin_rate_limits (key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS security_audit_logs (
  id TEXT PRIMARY KEY, actor_type TEXT NOT NULL, actor_id TEXT, action TEXT NOT NULL,
  target_type TEXT, target_id TEXT, created_at TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS security_audit_created ON security_audit_logs(created_at DESC);


CREATE TABLE IF NOT EXISTS support_accounts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK(role IN ('tutor','parent')),
  collaboration_role TEXT,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 100000,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS support_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES support_accounts(id),
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS support_comments (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES support_accounts(id),
  target TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS support_comments_created ON support_comments(created_at);
CREATE TABLE IF NOT EXISTS support_login_attempts (key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS exam_documents (
  id TEXT PRIMARY KEY,title TEXT NOT NULL,agency TEXT NOT NULL,year INTEGER NOT NULL,
  subject TEXT NOT NULL,object_key TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS student_teacher_assignments (
  id TEXT PRIMARY KEY,student_id TEXT NOT NULL,teacher_id TEXT NOT NULL REFERENCES support_accounts(id),
  role TEXT NOT NULL CHECK(role IN ('subject_teacher','academic_manager')),subject TEXT,
  permissions_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS assignments_teacher ON student_teacher_assignments(teacher_id,role);
CREATE TABLE IF NOT EXISTS teacher_feedback (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  student_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  teacher_id TEXT NOT NULL REFERENCES support_accounts(id),
  type TEXT NOT NULL CHECK(type IN ('subject','academic_management')),
  subject TEXT,title TEXT,categories_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK(status IN ('needs_improvement','normal','stable')),
  progress TEXT NOT NULL DEFAULT 'active' CHECK(progress IN ('active','achieved','replaced','archived')),
  bottleneck TEXT,observation TEXT,action TEXT,success_criterion TEXT,comment TEXT,
  linked_weekly_goal_id TEXT,linked_daily_drill_id TEXT,acknowledged_at TEXT,
  context_type TEXT NOT NULL DEFAULT 'general',context_target_id TEXT,
  created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS feedback_student ON teacher_feedback(student_id,progress,created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_student_user ON teacher_feedback(student_user_id,progress,created_at DESC);
CREATE TABLE IF NOT EXISTS teacher_feedback_audit (
  id TEXT PRIMARY KEY,feedback_id TEXT NOT NULL REFERENCES teacher_feedback(id),editor_id TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,edited_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS student_support_assignments (
  id TEXT PRIMARY KEY,
  student_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  support_account_id TEXT NOT NULL REFERENCES support_accounts(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('subject_teacher','academic_manager','parent','admin')),
  subject TEXT,permissions_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL,
  UNIQUE(student_user_id,support_account_id,role,subject)
);
CREATE INDEX IF NOT EXISTS support_assignments_account ON student_support_assignments(support_account_id,role);
CREATE INDEX IF NOT EXISTS support_assignments_student ON student_support_assignments(student_user_id,role);

CREATE TABLE IF NOT EXISTS arena_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL UNIQUE,
  grade TEXT NOT NULL DEFAULT '',
  target_university TEXT NOT NULL DEFAULT '',
  target_department TEXT NOT NULL DEFAULT '',
  target_admission_type TEXT NOT NULL DEFAULT '',
  study_goal TEXT NOT NULL DEFAULT '[]',
  achievement_level TEXT NOT NULL DEFAULT '',
  profile_image TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS arena_groups (
  id TEXT PRIMARY KEY,
  owner_user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('university','department','custom')),
  target_university TEXT NOT NULL DEFAULT '',
  target_department TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL CHECK(visibility IN ('public','private')),
  invite_code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS arena_group_members (
  group_id TEXT NOT NULL REFERENCES arena_groups(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TEXT NOT NULL,
  PRIMARY KEY(group_id, user_id)
);
CREATE TABLE IF NOT EXISTS arena_seasons (id TEXT PRIMARY KEY,name TEXT NOT NULL,starts_at TEXT NOT NULL,ends_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS arena_season_preferences (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season_id TEXT NOT NULL REFERENCES arena_seasons(id) ON DELETE CASCADE,
  custom_name TEXT NOT NULL CHECK(length(custom_name) BETWEEN 2 AND 32),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id, season_id)
);
CREATE INDEX IF NOT EXISTS arena_season_preferences_season ON arena_season_preferences(season_id);
CREATE TABLE IF NOT EXISTS arena_score_snapshots (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season_id TEXT NOT NULL REFERENCES arena_seasons(id),
  week_start TEXT NOT NULL,
  score INTEGER NOT NULL,
  execution INTEGER NOT NULL,
  problem_solving INTEGER NOT NULL,
  mastery INTEGER NOT NULL DEFAULT 0,
  performance INTEGER NOT NULL DEFAULT 0,
  consistency INTEGER NOT NULL,
  growth INTEGER NOT NULL,
  growth_rate REAL NOT NULL DEFAULT 0,
  score_version INTEGER NOT NULL DEFAULT 1,
  metrics TEXT NOT NULL DEFAULT '{}',
  calculated_at TEXT NOT NULL,
  UNIQUE(user_id, season_id, week_start)
);
CREATE INDEX IF NOT EXISTS arena_scores_season_score ON arena_score_snapshots(season_id, score DESC);
CREATE TABLE IF NOT EXISTS arena_rivals (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rival_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id, rival_user_id),
  CHECK(user_id <> rival_user_id)
);
CREATE TABLE IF NOT EXISTS study_rooms (
  id TEXT PRIMARY KEY,
  invite_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  owner_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  max_participants INTEGER NOT NULL DEFAULT 10 CHECK(max_participants BETWEEN 2 AND 10)
);
CREATE TABLE IF NOT EXISTS study_room_members (
  room_id TEXT NOT NULL REFERENCES study_rooms(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  left_at TEXT,
  PRIMARY KEY(room_id,user_id,joined_at)
);
CREATE INDEX IF NOT EXISTS study_rooms_invite_active ON study_rooms(invite_code,is_active);
CREATE INDEX IF NOT EXISTS study_room_members_open ON study_room_members(room_id,left_at);

CREATE TABLE IF NOT EXISTS arena_achievements (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  awarded_at TEXT NOT NULL,
  UNIQUE(user_id, code)
);
INSERT OR IGNORE INTO arena_seasons(id,name,starts_at,ends_at) VALUES('suneung-2028-fall','2028 수능 시즌','2026-09-01','2026-12-31');

CREATE TABLE IF NOT EXISTS archive_entries (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL CHECK(subject IN ('korean','math','english','social_studies','integrated_science')),
  year INTEGER NOT NULL CHECK(year BETWEEN 2000 AND 2100),
  month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
  institution TEXT NOT NULL CHECK(institution IN ('KICE','education_office','EBS','private','textbook','custom')),
  institution_custom_name TEXT,
  exam_name TEXT NOT NULL DEFAULT '',
  source_name TEXT NOT NULL DEFAULT '',
  question_number TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  subcategory TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  studied_at TEXT NOT NULL,
  mastery_status TEXT NOT NULL CHECK(mastery_status IN ('input','understanding','reproduction','automated')),
  memo TEXT NOT NULL DEFAULT '',
  condition_summary TEXT,
  first_thought TEXT,
  representation TEXT,
  solution_flow TEXT,
  bottleneck TEXT,
  transfer TEXT,
  main_idea TEXT,
  structure_summary TEXT,
  key_expression TEXT,
  review_enabled INTEGER NOT NULL DEFAULT 0 CHECK(review_enabled IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS archive_entries_user_subject ON archive_entries(user_id,subject);
CREATE INDEX IF NOT EXISTS archive_entries_user_year_month ON archive_entries(user_id,year,month);
CREATE INDEX IF NOT EXISTS archive_entries_user_institution ON archive_entries(user_id,institution);
CREATE INDEX IF NOT EXISTS archive_entries_user_category ON archive_entries(user_id,category,subcategory);
CREATE INDEX IF NOT EXISTS archive_entries_user_mastery ON archive_entries(user_id,mastery_status);
CREATE INDEX IF NOT EXISTS archive_entries_cursor ON archive_entries(user_id,studied_at DESC,updated_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS archive_entries_subject_cursor ON archive_entries(user_id,subject,studied_at DESC,updated_at DESC,id DESC);

CREATE TABLE IF NOT EXISTS archive_annotations (
  id TEXT PRIMARY KEY,
  archive_entry_id TEXT NOT NULL REFERENCES archive_entries(id) ON DELETE CASCADE,
  color TEXT NOT NULL,
  type TEXT NOT NULL,
  text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS archive_annotations_entry_color_order ON archive_annotations(archive_entry_id,color,sort_order);

CREATE TABLE IF NOT EXISTS core_rules (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL CHECK(subject IN ('korean','math','english','social_studies','integrated_science')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  mastery_status TEXT NOT NULL CHECK(mastery_status IN ('input','understanding','reproduction','automated')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS core_rules_user_subject_mastery ON core_rules(user_id,subject,mastery_status);

CREATE TABLE IF NOT EXISTS archive_entry_core_rules (
  archive_entry_id TEXT NOT NULL REFERENCES archive_entries(id) ON DELETE CASCADE,
  core_rule_id TEXT NOT NULL REFERENCES core_rules(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  relation_type TEXT NOT NULL DEFAULT 'derived'
    CHECK(relation_type IN ('derived','applied','failed','reinforced')),
  PRIMARY KEY(archive_entry_id,core_rule_id)
);
CREATE INDEX IF NOT EXISTS archive_rule_links_rule ON archive_entry_core_rules(core_rule_id,archive_entry_id);
CREATE INDEX IF NOT EXISTS archive_rule_links_rule_relation ON archive_entry_core_rules(core_rule_id,relation_type,archive_entry_id);

CREATE TABLE IF NOT EXISTS archive_review_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  intervals_json TEXT NOT NULL DEFAULT '[3,7,14,30]',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS archive_reviews (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  archive_entry_id TEXT NOT NULL REFERENCES archive_entries(id) ON DELETE CASCADE,
  reviewed_at TEXT NOT NULL,
  success INTEGER NOT NULL CHECK(success IN (0,1)),
  core_rule_revealed INTEGER NOT NULL DEFAULT 0,
  next_due_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS archive_reviews_user_due ON archive_reviews(user_id,next_due_at);
CREATE INDEX IF NOT EXISTS archive_reviews_user_reviewed ON archive_reviews(user_id,reviewed_at DESC,archive_entry_id);

CREATE TABLE IF NOT EXISTS wrong_answers (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  date TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  question TEXT NOT NULL DEFAULT '',
  wrong_judgment TEXT NOT NULL DEFAULT '',
  missed_cue TEXT NOT NULL DEFAULT '',
  correction TEXT NOT NULL DEFAULT '',
  transfer TEXT NOT NULL DEFAULT '',
  bottleneck TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  score_id TEXT,
  capability_goal_id TEXT,
  archive_entry_id TEXT,
  retries_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id,id)
);
CREATE INDEX IF NOT EXISTS wrong_answers_user_subject_date ON wrong_answers(user_id,subject,date DESC,id DESC);
CREATE INDEX IF NOT EXISTS wrong_answers_user_updated ON wrong_answers(user_id,updated_at DESC,id DESC);

CREATE TABLE IF NOT EXISTS learning_drills (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  date TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  success_criterion TEXT NOT NULL DEFAULT '',
  minutes INTEGER NOT NULL DEFAULT 0,
  capability_goal_id TEXT,
  feedback_id TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  reflection TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id,id)
);
CREATE INDEX IF NOT EXISTS learning_drills_user_subject_date ON learning_drills(user_id,subject,date DESC,id DESC);
CREATE INDEX IF NOT EXISTS learning_drills_user_updated ON learning_drills(user_id,updated_at DESC,id DESC);

CREATE TABLE IF NOT EXISTS archive_wrong_answer_links (
  archive_entry_id TEXT PRIMARY KEY REFERENCES archive_entries(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wrong_answer_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id,wrong_answer_id),
  FOREIGN KEY(user_id,wrong_answer_id) REFERENCES wrong_answers(user_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS archive_wrong_answers_user ON archive_wrong_answer_links(user_id,wrong_answer_id);

CREATE TABLE IF NOT EXISTS core_rule_drill_links (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  core_rule_id TEXT NOT NULL REFERENCES core_rules(id) ON DELETE CASCADE,
  drill_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(core_rule_id,drill_id),
  FOREIGN KEY(user_id,drill_id) REFERENCES learning_drills(user_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS core_rule_drills_user_drill ON core_rule_drill_links(user_id,drill_id);

CREATE TABLE IF NOT EXISTS core_rule_wrong_answer_links (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  core_rule_id TEXT NOT NULL REFERENCES core_rules(id) ON DELETE CASCADE,
  wrong_answer_id TEXT NOT NULL,
  relation_type TEXT NOT NULL DEFAULT 'failed'
    CHECK(relation_type IN ('derived','applied','failed','reinforced')),
  created_at TEXT NOT NULL,
  PRIMARY KEY(core_rule_id,wrong_answer_id),
  FOREIGN KEY(user_id,wrong_answer_id) REFERENCES wrong_answers(user_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS core_rule_wrong_answer_user_wrong ON core_rule_wrong_answer_links(user_id,wrong_answer_id);

CREATE TABLE IF NOT EXISTS learning_reviews (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK(target_type IN ('wrong_answer','core_rule','drill','learning_item')),
  target_id TEXT NOT NULL,
  review_type TEXT NOT NULL DEFAULT 'retry',
  scheduled_at TEXT,
  reviewed_at TEXT,
  result TEXT NOT NULL DEFAULT 'pending' CHECK(result IN ('pending','success','fail')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS learning_reviews_user_target ON learning_reviews(user_id,target_type,target_id);
CREATE INDEX IF NOT EXISTS learning_reviews_user_schedule ON learning_reviews(user_id,result,scheduled_at);
CREATE INDEX IF NOT EXISTS learning_reviews_user_reviewed ON learning_reviews(user_id,target_type,target_id,reviewed_at DESC);

CREATE TABLE IF NOT EXISTS quick_capture_requests (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('processing','completed','failed')),
  result_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id, request_id)
);

CREATE TABLE IF NOT EXISTS core_rule_evidence (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  core_rule_id TEXT NOT NULL REFERENCES core_rules(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK(source_type IN ('archive','wrong_answer','drill','review')),
  source_id TEXT NOT NULL,
  relation_type TEXT NOT NULL CHECK(relation_type IN ('derived','applied','failed','reinforced')),
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id,core_rule_id,source_type,source_id,relation_type)
);
CREATE INDEX IF NOT EXISTS core_rule_evidence_rule_time ON core_rule_evidence(user_id,core_rule_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS core_rule_evidence_relation_time ON core_rule_evidence(user_id,relation_type,occurred_at DESC);
CREATE INDEX IF NOT EXISTS core_rule_evidence_source ON core_rule_evidence(user_id,source_type,source_id);

CREATE TABLE IF NOT EXISTS learning_graph_user_state (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  source_updated_at TEXT NOT NULL DEFAULT '',
  projected_at TEXT NOT NULL,
  legacy_evidence_backfilled INTEGER NOT NULL DEFAULT 0
);
