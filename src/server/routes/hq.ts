// Routes for HQ's link: check it now, and give HQ's last pane its name back. The router loads every file in this folder.
import { syncHerdr } from "../herdr.ts";
import { flushed, hqLink, nameHq } from "../hq-link.ts";
import type { Route } from "../router.ts";

const routes: Route[] = [
  { method: "POST", path: "/api/hq/check", handle: async () => {
    await syncHerdr();
    await flushed();
    return hqLink();
  } },
  { method: "POST", path: "/api/hq/name", handle: async () => {
    await nameHq();
    await syncHerdr();
    await flushed();
    return hqLink();
  } },
];
export default routes;
