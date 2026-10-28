// The event log (who did what), shown on the page. An event carries a floor: the one given, else its lane's.
import { db } from "./db.ts";

export function event(who: string, text: string, lane?: string | null, floor?: string | null) {
  db.query("INSERT INTO events (at, lane, who, text, floor) VALUES (?, ?, ?, ?, COALESCE(?, (SELECT floor FROM lanes WHERE name = ?)))").run(Date.now(), lane ?? null, who, text, floor ?? null, lane ?? null);
}
