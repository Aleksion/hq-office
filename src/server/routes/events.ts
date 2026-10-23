// Routes for events. The router loads every file in this folder; see src/server/router.ts.
import { event } from "../events.ts";
import type { Route } from "../router.ts";

const routes: Route[] = [
  { method: "POST", path: "/api/events", handle: ({ body }) => {
    event(body.who ?? "hq", String(body.text ?? ""), body.lane);
  } },
];
export default routes;
