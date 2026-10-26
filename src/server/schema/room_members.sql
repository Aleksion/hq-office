-- The lanes in a room besides its owner, at any level of the lane tree.
CREATE TABLE IF NOT EXISTS room_members (
  slug TEXT NOT NULL,
  lane TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (slug, lane)
);
