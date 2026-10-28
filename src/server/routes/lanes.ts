// Routes for lanes. The router loads every file in this folder; see src/server/router.ts.
import { event } from "../events.ts";
import { removeLane, upsertLane } from "../lanes.ts";
import { board } from "../work-board.ts";
import type { Route } from "../router.ts";

const routes: Route[] = [
  { method: "POST", path: "/api/lanes", handle: ({ body, caller }) => {
    upsertLane(body, caller());
    board.linkLane(body);
  } },
  { method: "POST", path: "/api/lanes/delete", handle: ({ body }) => {
    removeLane(body.name);
    event("hq", "removed from the board", body.name);
  } },
];
export default routes;
