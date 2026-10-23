-- The events table. Applied at every start; IF NOT EXISTS keeps existing data.
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  lane TEXT,
  who TEXT NOT NULL,
  text TEXT NOT NULL
);
