-- The recruits: one row per request to start an agent as the head of a floor of its own, kept after it ends.
-- `state` is held (waiting for room on its machine), starting, up, failed, stopped or withdrawn. `steps` is a JSON array of
-- { step, ok, at, note? }: the log the page draws. `parent` is the lane it reports to (NULL: straight under HQ).
CREATE TABLE IF NOT EXISTS recruits (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  floor TEXT NOT NULL,
  parent TEXT,
  head INTEGER NOT NULL DEFAULT 1,
  asked_by TEXT NOT NULL,
  model TEXT NOT NULL,
  machine TEXT NOT NULL,
  account TEXT,
  cwd TEXT,
  brief TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('held', 'starting', 'up', 'failed', 'stopped', 'withdrawn')),
  steps TEXT NOT NULL DEFAULT '[]',
  pane TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  up_at INTEGER,
  stopped_at INTEGER
);
