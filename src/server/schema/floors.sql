-- The floors: one row per floor that has been made, from the moment it is made. HQ's own floor has no row.
-- `color` is a slot number the row keeps while it is live; a stopped row has `stopped_at` and frees its slot.
CREATE TABLE IF NOT EXISTS floors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  head TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('recruited', 'tree')),
  color INTEGER NOT NULL,
  machine TEXT,
  dir TEXT,
  created_at INTEGER NOT NULL,
  stopped_at INTEGER
);
