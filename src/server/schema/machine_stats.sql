-- The machine_stats table. Applied at every start; IF NOT EXISTS keeps existing data.
CREATE TABLE IF NOT EXISTS machine_stats (
  at INTEGER NOT NULL,
  machine TEXT NOT NULL,
  ok INTEGER NOT NULL,
  cores INTEGER,
  load1 REAL,
  cpu_busy REAL,
  mem_used REAL,
  error TEXT
);
CREATE INDEX IF NOT EXISTS machine_stats_at ON machine_stats (machine, at);
