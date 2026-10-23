// Routes for page. The router loads every file in this folder; see src/server/router.ts.
import { shell } from "../page.ts";
import type { Route } from "../router.ts";

const routes: Route[] = [
  { method: "GET", path: "/", handle: async () => new Response(await shell(), { headers: { "content-type": "text/html; charset=utf-8" } }) },
];
export default routes;
