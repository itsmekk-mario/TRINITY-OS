-- Preserve the old Archive review schedule while learning_reviews becomes the single queue source.
INSERT OR IGNORE INTO learning_reviews(
  id,user_id,target_type,target_id,review_type,scheduled_at,reviewed_at,result,notes,created_at,updated_at
)
SELECT
  'archive-pending-' || e.user_id || '-' || e.id,
  e.user_id,
  'learning_item',
  e.id,
  'archive_schedule',
  COALESCE(
    (SELECT ar.next_due_at FROM archive_reviews ar WHERE ar.user_id=e.user_id AND ar.archive_entry_id=e.id ORDER BY ar.reviewed_at DESC LIMIT 1),
    date(e.studied_at,'+3 day')
  ),
  NULL,
  'pending',
  '',
  datetime('now'),
  datetime('now')
FROM archive_entries e
WHERE (e.review_enabled=1 OR EXISTS(SELECT 1 FROM archive_entry_core_rules l WHERE l.archive_entry_id=e.id))
  AND NOT EXISTS(
    SELECT 1 FROM learning_reviews r
    WHERE r.user_id=e.user_id AND r.target_type='learning_item' AND r.target_id=e.id AND r.result='pending'
  );
