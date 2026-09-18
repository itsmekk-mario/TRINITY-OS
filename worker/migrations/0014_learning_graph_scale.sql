-- 0014_learning_graph_scale.sql
-- Additive Learning Graph scale refactor. Existing learning_state/Archive/Core Rule data is preserved.

CREATE TABLE IF NOT EXISTS core_rule_drill_links (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  core_rule_id TEXT NOT NULL REFERENCES core_rules(id) ON DELETE CASCADE,
  drill_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(core_rule_id, drill_id)
);
CREATE INDEX IF NOT EXISTS core_rule_drills_user_drill
  ON core_rule_drill_links(user_id, drill_id);

CREATE TABLE IF NOT EXISTS learning_reviews (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL
    CHECK(target_type IN ('wrong_answer','core_rule','drill','learning_item')),
  target_id TEXT NOT NULL,
  review_type TEXT NOT NULL DEFAULT 'retry',
  scheduled_at TEXT,
  reviewed_at TEXT,
  result TEXT NOT NULL DEFAULT 'pending'
    CHECK(result IN ('pending','success','fail')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS learning_reviews_user_target
  ON learning_reviews(user_id,target_type,target_id);
CREATE INDEX IF NOT EXISTS learning_reviews_user_schedule
  ON learning_reviews(user_id,result,scheduled_at);

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

CREATE TABLE IF NOT EXISTS core_rule_wrong_answer_links (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  core_rule_id TEXT NOT NULL REFERENCES core_rules(id) ON DELETE CASCADE,
  wrong_answer_id TEXT NOT NULL,
  relation_type TEXT NOT NULL DEFAULT 'failed'
    CHECK(relation_type IN ('derived','applied','failed','reinforced')),
  created_at TEXT NOT NULL,
  PRIMARY KEY(core_rule_id,wrong_answer_id)
);
CREATE INDEX IF NOT EXISTS core_rule_wrong_answer_user_wrong ON core_rule_wrong_answer_links(user_id,wrong_answer_id);

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

CREATE INDEX IF NOT EXISTS archive_entries_cursor
  ON archive_entries(user_id,studied_at DESC,updated_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS archive_entries_subject_cursor
  ON archive_entries(user_id,subject,studied_at DESC,updated_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS archive_reviews_user_reviewed
  ON archive_reviews(user_id,reviewed_at DESC,archive_entry_id);
CREATE INDEX IF NOT EXISTS learning_reviews_user_reviewed
  ON learning_reviews(user_id,target_type,target_id,reviewed_at DESC);
