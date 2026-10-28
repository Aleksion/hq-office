// Routes for inbox: the caller's floor's, or every floor's (x-hud-floor: all). See src/server/router.ts.
import { inbox, waitForInbox } from "../inbox.ts";
import { json } from "../json.ts";
import type { Ctx, Route } from "../router.ts";

const scope = ({ caller }: Ctx) => (caller().all ? null : caller().floor);
const routes: Route[] = [
  { method: "GET", path: "/api/inbox", handle: (ctx) => json(inbox(scope(ctx))) },
  { method: "GET", path: "/api/wait", handle: async (ctx) => json(await waitForInbox(Math.min(Number(ctx.url.searchParams.get("s") ?? 240), 240) * 1000, scope(ctx))) },
];
export default routes;
