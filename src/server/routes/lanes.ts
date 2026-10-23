// Routes for lanes. The router loads every file in this folder; see src/server/router.ts.
import { db } from "../db.ts";
import { event } from "../events.ts";
import { upsertLane } from "../lanes.ts";
import { board } from "../work-board.ts";
import type { Route } from "../router.ts";

const routes: Route[] = [
  { method: "POST", path: "/api/lanes", handle: ({ body }) => {
    upsertLane(body);
    board.linkLane(body);
  } },
  { method: "POST", path: "/api/lanes/delete", handle: ({ body }) => {
    db.query("DELETE FROM lanes WHERE name = ?").run(body.name);
    event("hq", "removed from the board", body.name);
  } },
];
export default routes;
