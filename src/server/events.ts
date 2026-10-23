// The event log (who did what), shown on the page.
import { db } from "./db.ts";

export function event(who: string, text: string, lane?: string | null) {
  db.query("INSERT INTO events (at, lane, who, text) VALUES (?, ?, ?, ?)").run(Date.now(), lane ?? null, who, text);
}
