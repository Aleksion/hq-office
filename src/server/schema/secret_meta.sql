-- What the secret ledger (secret-ledger.ts) knows of each secret the server holds: its name, who set it, when, and
-- its deadline. Never a value: values live in the server's memory only. A row the starting server has no value for
-- is a secret lost in a restart. Applied at every start; IF NOT EXISTS keeps existing data.
CREATE TABLE IF NOT EXISTS secret_meta (
  name TEXT PRIMARY KEY,
  by TEXT NOT NULL,
  set_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
