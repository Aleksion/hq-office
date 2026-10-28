-- FLOORS (floors.ts): one HQ agent and everything it runs. hq is the herdr agent that is the floor's HQ; NULL (the
-- first floor only, as the upgrade makes it) means HUD_HQ_AGENT, so the setting keeps working as it always has.
-- hq_pane is the pane that HQ was last seen in (what hq_link held before floors), for the NAME button and the heal.
-- Applied at every start; IF NOT EXISTS keeps existing data.
CREATE TABLE IF NOT EXISTS floors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  hq TEXT,
  position INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  hq_pane TEXT,
  hq_seen_at INTEGER
);
