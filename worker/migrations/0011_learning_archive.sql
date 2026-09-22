-- Learning Archive is additive. Existing learning_state and Wrong Answer data remain untouched.
CREATE TABLE IF NOT EXISTS archive_entries (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL CHECK(subject IN ('korean','math','english','social_studies','integrated_science')),
  year INTEGER NOT NULL CHECK(year BETWEEN 2000 AND 2100),
  month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
  institution TEXT NOT NULL CHECK(institution IN ('KICE','education_office','EBS','private','textbook','custom')),
  institution_custom_name TEXT,
  exam_name TEXT NOT NULL DEFAULT '', source_name TEXT NOT NULL DEFAULT '', question_number TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '', subcategory TEXT NOT NULL DEFAULT '', title TEXT NOT NULL,
  studied_at TEXT NOT NULL,
  mastery_status TEXT NOT NULL CHECK(mastery_status IN ('input','understanding','reproduction','automated')),
  memo TEXT NOT NULL DEFAULT '',
  condition_summary TEXT, first_thought TEXT, representation TEXT, solution_flow TEXT, bottleneck TEXT, transfer TEXT,
  main_idea TEXT, structure_summary TEXT, key_expression TEXT,
  review_enabled INTEGER NOT NULL DEFAULT 0 CHECK(review_enabled IN (0,1)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS archive_annotations (
  id TEXT PRIMARY KEY, archive_entry_id TEXT NOT NULL REFERENCES archive_entries(id) ON DELETE CASCADE,
  color TEXT NOT NULL, type TEXT NOT NULL, text TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS core_rules (
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL CHECK(subject IN ('korean','math','english','social_studies','integrated_science')), title TEXT NOT NULL, content TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]', mastery_status TEXT NOT NULL CHECK(mastery_status IN ('input','understanding','reproduction','automated')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS archive_entry_core_rules (
  archive_entry_id TEXT NOT NULL REFERENCES archive_entries(id) ON DELETE CASCADE,
  core_rule_id TEXT NOT NULL REFERENCES core_rules(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL, PRIMARY KEY(archive_entry_id, core_rule_id)
);
CREATE TABLE IF NOT EXISTS archive_review_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  intervals_json TEXT NOT NULL DEFAULT '[3,7,14,30]', updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS archive_reviews (
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  archive_entry_id TEXT NOT NULL REFERENCES archive_entries(id) ON DELETE CASCADE,
  reviewed_at TEXT NOT NULL, success INTEGER NOT NULL CHECK(success IN (0,1)), core_rule_revealed INTEGER NOT NULL DEFAULT 0,
  next_due_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS archive_wrong_answer_links (
  archive_entry_id TEXT PRIMARY KEY REFERENCES archive_entries(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wrong_answer_id TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(user_id, wrong_answer_id)
);
CREATE INDEX IF NOT EXISTS archive_entries_user_subject ON archive_entries(user_id, subject);
CREATE INDEX IF NOT EXISTS archive_entries_user_year_month ON archive_entries(user_id, year, month);
CREATE INDEX IF NOT EXISTS archive_entries_user_institution ON archive_entries(user_id, institution);
CREATE INDEX IF NOT EXISTS archive_entries_user_category ON archive_entries(user_id, category, subcategory);
CREATE INDEX IF NOT EXISTS archive_entries_user_mastery ON archive_entries(user_id, mastery_status);
CREATE INDEX IF NOT EXISTS archive_annotations_entry_color_order ON archive_annotations(archive_entry_id, color, sort_order);
CREATE INDEX IF NOT EXISTS core_rules_user_subject_mastery ON core_rules(user_id, subject, mastery_status);
CREATE INDEX IF NOT EXISTS archive_rule_links_rule ON archive_entry_core_rules(core_rule_id, archive_entry_id);
CREATE INDEX IF NOT EXISTS archive_reviews_user_due ON archive_reviews(user_id, next_due_at);
CREATE INDEX IF NOT EXISTS archive_wrong_answers_user ON archive_wrong_answer_links(user_id, wrong_answer_id);
