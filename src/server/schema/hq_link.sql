-- The pane HQ was last seen in (one row), so that when herdr drops HQ's name the page can offer to give it back.
-- Applied at every start; IF NOT EXISTS keeps existing data.
CREATE TABLE IF NOT EXISTS hq_link (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  pane TEXT NOT NULL,
  seen_at INTEGER NOT NULL
);
