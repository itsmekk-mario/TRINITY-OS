-- Shared 14-day Arena cycles with a per-student display name.
-- The cycle ID remains global so ranking comparisons stay consistent.
CREATE TABLE IF NOT EXISTS arena_season_preferences (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season_id TEXT NOT NULL REFERENCES arena_seasons(id) ON DELETE CASCADE,
  custom_name TEXT NOT NULL CHECK(length(custom_name) BETWEEN 2 AND 32),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id, season_id)
);

CREATE INDEX IF NOT EXISTS arena_season_preferences_season
  ON arena_season_preferences(season_id);
