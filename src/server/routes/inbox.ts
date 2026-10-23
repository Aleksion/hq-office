// Routes for inbox. The router loads every file in this folder; see src/server/router.ts.
import { inbox, waitForInbox } from "../inbox.ts";
import { json } from "../json.ts";
import type { Route } from "../router.ts";

const routes: Route[] = [
  { method: "GET", path: "/api/inbox", handle: () => json(inbox()) },
  { method: "GET", path: "/api/wait", handle: async ({ url }) => json(await waitForInbox(Math.min(Number(url.searchParams.get("s") ?? 240), 240) * 1000)) },
];
export default routes;
