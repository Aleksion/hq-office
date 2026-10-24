// Routes for requests (a lane asks HQ) and agents (who is quiet, since when). The router loads every file in this
// folder; see src/server/router.ts.
import { db } from "../db.ts";
import { json } from "../json.ts";
import { allRequests, answerRequest, closeRequest, fileRequest, nextRequest, openRequests } from "../requests.ts";
import type { Route } from "../router.ts";

const routes: Route[] = [
  { method: "GET", path: "/api/requests", handle: ({ url }) => json(url.searchParams.get("all") ? allRequests(url.searchParams.get("lead") || undefined) : openRequests(url.searchParams.get("lead") || undefined)) },
  { method: "GET", path: "/api/requests/next", handle: ({ url }) => json(nextRequest(url.searchParams.get("lead") || undefined)) },
  { method: "GET", path: "/api/agents", handle: () => json(db.query("SELECT name, machine, pane, agent, status, since FROM agents ORDER BY machine, pane").all()) },
  { method: "POST", path: "/api/requests", handle: ({ body }) => fileRequest(body) },
  { method: "POST", pattern: /^\/api\/requests\/(\d+)\/answer$/, handle: ({ body, m }) => answerRequest(Number(m[1]), String(body.text ?? "")) },
  { method: "POST", pattern: /^\/api\/requests\/(\d+)\/close$/, handle: ({ body, m }) => closeRequest(Number(m[1]), String(body.reason ?? "")) },
];
export default routes;
