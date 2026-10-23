// Routes for state. The router loads every file in this folder; see src/server/router.ts.
import { state } from "../state.ts";
import { json } from "../json.ts";
import type { Route } from "../router.ts";

const routes: Route[] = [
  { method: "GET", path: "/api/state", handle: () => json(state()) },
];
export default routes;
