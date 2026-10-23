// Routes for the page's own files under src/client (modules and stylesheets), served as they are.
import { json } from "../json.ts";
import { clientFile } from "../page.ts";
import type { Route } from "../router.ts";

const routes: Route[] = [
  { method: "GET", prefix: "/src/client/", handle: async ({ req, path }) => (await clientFile(path, req)) ?? json({ error: "not found" }, 404) },
];
export default routes;
