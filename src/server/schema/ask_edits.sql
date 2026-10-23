-- When HQ last edited an open question in place (hud update). The question's own row keeps its created_at.
CREATE TABLE IF NOT EXISTS ask_edits (
  ask_id INTEGER PRIMARY KEY,
  edited_at INTEGER NOT NULL
);
