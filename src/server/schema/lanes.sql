-- The lanes table. Applied at every start; IF NOT EXISTS keeps existing data.
CREATE TABLE IF NOT EXISTS lanes (
  name TEXT PRIMARY KEY,
  title TEXT,
  machine TEXT,
  pane TEXT,
  agent TEXT,
  herdr TEXT,
  herdr_since INTEGER,
  herdr_seen INTEGER,
  issue TEXT,
  pr TEXT,
  phase TEXT NOT NULL DEFAULT 'running',
  note TEXT,
  bg TEXT,
  prompt TEXT,
  updated_at INTEGER
);
