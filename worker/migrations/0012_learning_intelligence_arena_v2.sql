-- Learning Intelligence + Arena Score v2 ledger reconciliation.
-- Production already has relation_type/mastery/performance/score_version. Do not repeat
-- ALTER TABLE here: D1 SQLite has no portable ADD COLUMN IF NOT EXISTS and duplicate
-- ALTERs prevent Wrangler from recording this migration. Runtime schema guards add the
-- same columns for legacy/local databases, while schema.sql covers fresh databases.

CREATE TABLE IF NOT EXISTS core_rule_drill_links (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  core_rule_id TEXT NOT NULL REFERENCES core_rules(id) ON DELETE CASCADE,
  drill_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(core_rule_id, drill_id)
);
CREATE INDEX IF NOT EXISTS core_rule_drills_user_drill ON core_rule_drill_links(user_id, drill_id);

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

CREATE INDEX IF NOT EXISTS arena_scores_v2_ranking
  ON arena_score_snapshots(season_id,score_version,score DESC,mastery DESC,performance DESC,growth DESC,calculated_at ASC);
