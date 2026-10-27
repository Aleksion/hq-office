-- What the server types into HQ (the owner's notes and answers, notices), kept until HQ has it. A row with sent_at
-- NULL is held: HQ could not take it, and it goes in order once HQ can. Applied at every start; IF NOT EXISTS keeps
-- existing data.
CREATE TABLE IF NOT EXISTS hq_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  text TEXT NOT NULL,
  ref TEXT,
  sent_at INTEGER,
  error TEXT,
  tries INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS hq_outbox_held ON hq_outbox (sent_at) WHERE sent_at IS NULL;
