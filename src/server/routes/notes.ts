// Routes for notes. The router loads every file in this folder; see src/server/router.ts.
import { OWNER } from "../config.ts";
import { db } from "../db.ts";
import { event } from "../events.ts";
import { notifyHq } from "../hq-link.ts";
import { checkScope } from "../asks.ts";
import { firstFloor } from "../floors.ts";
import type { Route } from "../router.ts";

const routes: Route[] = [
  // A note from the page goes to the floor it sends (floor in the body), else the first floor.
  { method: "POST", path: "/api/notes", handle: ({ body, caller }) => {
    if (!String(body.text ?? "").trim()) throw new Error("text is required");
    if (caller().all) throw new Error("a note goes to one floor");
    const floor = caller().explicit ?? firstFloor();
    const { lastInsertRowid } = db.query("INSERT INTO notes (at, text, floor) VALUES (?, ?, ?)").run(Date.now(), String(body.text).trim(), floor);
    event(OWNER, `told HQ: ${String(body.text).trim()}`, null, floor);
    notifyHq(`HUD note from ${OWNER}: ${String(body.text).trim()}`, `note:${lastInsertRowid}`, floor);
  } },
  { method: "POST", pattern: /^\/api\/notes\/(\d+)\/ack$/, handle: ({ m, caller }) => {
    checkScope("note", Number(m[1]), caller());
    db.query("UPDATE notes SET acked_at = ? WHERE id = ?").run(Date.now(), Number(m[1]));
  } },
];
export default routes;
