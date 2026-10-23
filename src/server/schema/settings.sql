-- The owner's settings (hero, season, hat, sound, ...): one row per key, the value as JSON. Applied at every start;
-- IF NOT EXISTS keeps existing data.
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
