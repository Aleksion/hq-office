-- Conference rooms: one per piece of work, where the owner talks straight to the lane that owns it. The brief is
-- replaced as a whole; rev counts every change, so a page knows when to fetch an open room again.
CREATE TABLE IF NOT EXISTS rooms (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  owner TEXT NOT NULL,
  brief TEXT,
  brief_at INTEGER,
  brief_by TEXT,
  created_at INTEGER NOT NULL,
  rev INTEGER NOT NULL DEFAULT 0,
  archived_at INTEGER
);
