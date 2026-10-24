-- What a lane needs from HQ. A row closes only when HQ's answer has reached the lane's pane.
-- lead: who must answer (an orchestrator name, or a PM lane key); NULL on rows filed before it existed, which read as HQ.
-- status: open | defaulted (the lane's stated default came due and it went ahead) | closed (answered and delivered).
-- Applied at every start; IF NOT EXISTS keeps existing data.
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  lane TEXT NOT NULL,
  pr TEXT,
  text TEXT NOT NULL,
  default_action TEXT,
  default_by INTEGER,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  defaulted_at INTEGER,
  answer TEXT,
  answered_at INTEGER,
  last_error TEXT,
  lead TEXT
);
