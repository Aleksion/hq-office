-- Comments HQ adds under an open question: information only, never in HQ's inbox, never on the score.
CREATE TABLE IF NOT EXISTS ask_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ask_id INTEGER NOT NULL,
  at INTEGER NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ask_comments_ask ON ask_comments (ask_id);
