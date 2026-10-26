-- The work a room is about: issue keys and PRs (the board's keys), shown with their state on the work board.
CREATE TABLE IF NOT EXISTS room_links (
  slug TEXT NOT NULL,
  kind TEXT NOT NULL,
  ref TEXT NOT NULL,
  PRIMARY KEY (slug, kind, ref)
);
