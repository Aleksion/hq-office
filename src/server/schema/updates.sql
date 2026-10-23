-- The updates table. Applied at every start; IF NOT EXISTS keeps existing data.
CREATE TABLE IF NOT EXISTS updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  lane TEXT,
  title TEXT NOT NULL,
  body TEXT,
  read_at INTEGER
);
