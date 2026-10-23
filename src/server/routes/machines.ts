// Routes for machines. The router loads every file in this folder; see src/server/router.ts.
import { machineHistory } from "../machines.ts";
import { json } from "../json.ts";
import type { Route } from "../router.ts";

const routes: Route[] = [
  { method: "GET", path: "/api/machines", handle: ({ url }) => json(machineHistory(Math.min(Math.max(Number(url.searchParams.get("hours") ?? 24), 1), 48))) },
];
export default routes;
