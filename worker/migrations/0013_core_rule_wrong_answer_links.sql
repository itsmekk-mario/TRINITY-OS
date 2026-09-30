-- 0013_core_rule_wrong_answer_links.sql
-- Direct Core Rule <-> Wrong Answer graph edges.
CREATE TABLE IF NOT EXISTS core_rule_wrong_answer_links (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  core_rule_id TEXT NOT NULL REFERENCES core_rules(id) ON DELETE CASCADE,
  wrong_answer_id TEXT NOT NULL,
  relation_type TEXT NOT NULL DEFAULT 'failed'
    CHECK(relation_type IN ('derived','applied','failed','reinforced')),
  created_at TEXT NOT NULL,
  PRIMARY KEY(core_rule_id, wrong_answer_id)
);

CREATE INDEX IF NOT EXISTS core_rule_wrong_answer_user_wrong
  ON core_rule_wrong_answer_links(user_id, wrong_answer_id);

-- Promote existing indirect Archive -> Rule + Archive -> Wrong Answer relationships
-- into direct graph edges without deleting or rewriting legacy links.
INSERT OR IGNORE INTO core_rule_wrong_answer_links
(user_id, core_rule_id, wrong_answer_id, relation_type, created_at)
SELECT
  w.user_id,
  l.core_rule_id,
  w.wrong_answer_id,
  COALESCE(l.relation_type, 'failed'),
  datetime('now')
FROM archive_wrong_answer_links w
JOIN archive_entry_core_rules l
  ON l.archive_entry_id = w.archive_entry_id
JOIN core_rules r
  ON r.id = l.core_rule_id
WHERE r.user_id = w.user_id;
