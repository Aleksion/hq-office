// Routes for sync. The router loads every file in this folder; see src/server/router.ts.
import { syncHerdr } from "../herdr.ts";
import type { Route } from "../router.ts";

const routes: Route[] = [
  { method: "POST", path: "/api/sync", handle: async () => {
    await syncHerdr();
  } },
];
export default routes;
