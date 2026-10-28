// Routes for HQ's link: check it now, and give HQ's last pane its name back. A floor in the body picks the floor's
// HQ; without one, the first floor's. The router loads every file in this folder.
import { syncHerdr } from "../herdr.ts";
import { flushed, hqLink, nameHq } from "../hq-link.ts";
import { firstFloor } from "../floors.ts";
import type { Route } from "../router.ts";

const routes: Route[] = [
  { method: "POST", path: "/api/hq/check", handle: async ({ caller }) => {
    const floor = caller().explicit ?? firstFloor();
    await syncHerdr();
    await flushed();
    return hqLink(floor);
  } },
  { method: "POST", path: "/api/hq/name", handle: async ({ caller }) => {
    const floor = caller().explicit ?? firstFloor();
    await nameHq(floor);
    await syncHerdr();
    await flushed();
    return hqLink(floor);
  } },
];
export default routes;
