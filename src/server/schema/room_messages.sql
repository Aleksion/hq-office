-- A room's thread. author is the lane that wrote it, or NULL for the owner. An owner's message goes to to_lane;
-- delivery is how that went: sending, sent, away (kept until herdr sees the lane again) or failed (error says why).
-- read_at: when the owner saw a lane's message.
CREATE TABLE IF NOT EXISTS room_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  at INTEGER NOT NULL,
  author TEXT,
  to_lane TEXT,
  text TEXT NOT NULL,
  reply_to INTEGER,
  delivery TEXT,
  delivered_at INTEGER,
  error TEXT,
  read_at INTEGER
);
CREATE INDEX IF NOT EXISTS room_messages_slug ON room_messages (slug, id);
CREATE INDEX IF NOT EXISTS room_messages_delivery ON room_messages (delivery);
