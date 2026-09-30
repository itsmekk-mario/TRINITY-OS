-- 0020_ai_wrong_answer_graph.sql
-- Server-side AI-generated Wrong Answer <-> Wrong Answer learning graph.

CREATE TABLE IF NOT EXISTS ai_wrong_answer_runs (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope_subject TEXT NOT NULL DEFAULT '',
  source_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_wrong_answer_runs_user_created
  ON ai_wrong_answer_runs(user_id,scope_subject,created_at DESC);
CREATE INDEX IF NOT EXISTS ai_wrong_answer_runs_source
  ON ai_wrong_answer_runs(user_id,scope_subject,source_hash);

CREATE TABLE IF NOT EXISTS ai_wrong_answer_links (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_wrong_answer_id TEXT NOT NULL,
  target_wrong_answer_id TEXT NOT NULL,
  relation_type TEXT NOT NULL
    CHECK(relation_type IN ('same_bottleneck','same_missed_cue','same_judgment','same_concept','same_correction','transfer')),
  score REAL NOT NULL DEFAULT 0 CHECK(score >= 0 AND score <= 1),
  rationale TEXT NOT NULL DEFAULT '',
  run_id TEXT NOT NULL REFERENCES ai_wrong_answer_runs(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id,source_wrong_answer_id,target_wrong_answer_id),
  FOREIGN KEY(user_id,source_wrong_answer_id) REFERENCES wrong_answers(user_id,id) ON DELETE CASCADE,
  FOREIGN KEY(user_id,target_wrong_answer_id) REFERENCES wrong_answers(user_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ai_wrong_answer_links_source
  ON ai_wrong_answer_links(user_id,source_wrong_answer_id,score DESC);
CREATE INDEX IF NOT EXISTS ai_wrong_answer_links_target
  ON ai_wrong_answer_links(user_id,target_wrong_answer_id,score DESC);
