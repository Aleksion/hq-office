// Routes for recruiting an Orchestrator onto a floor of its own. The router loads every file in this folder; see src/server/router.ts.
// `asked_by` is who is asking: the owner (the page, the default) or HQ (hud recruit sends "hq").
import { recruit, stopRecruit } from "../recruit.ts";
import type { Route } from "../router.ts";

const askedBy = (body: any) => (body.asked_by === "hq" ? "hq" : "owner");

const routes: Route[] = [
  { method: "POST", path: "/api/recruit", handle: ({ body }) => recruit({ name: body.name, floor: body.floor, machine: body.machine, account: body.account, model: body.model, brief: body.brief, asked_by: askedBy(body) }) },
  { method: "POST", path: "/api/recruit/stop", handle: async ({ body }) => {
    await stopRecruit(String(body.name ?? ""), askedBy(body));
  } },
];
export default routes;
