-- A question's checklist. n counts from 1 per question; pr is the board's key for a PR the text names.
-- done_by: hq (ticked by hand) or github (its PR merged).
CREATE TABLE IF NOT EXISTS ask_items (
  ask_id INTEGER NOT NULL,
  n INTEGER NOT NULL,
  text TEXT NOT NULL,
  pr TEXT,
  done_at INTEGER,
  done_by TEXT,
  PRIMARY KEY (ask_id, n)
);
