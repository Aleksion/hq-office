-- A room's shelf: Claude artifact links, links, images and files. url is what the page opens (an upload is served
-- from /room-files/); path is the upload on this machine's disk.
CREATE TABLE IF NOT EXISTS room_artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  at INTEGER NOT NULL,
  by TEXT,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  path TEXT
);
CREATE INDEX IF NOT EXISTS room_artifacts_slug ON room_artifacts (slug);
