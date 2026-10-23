// Routes for board. The router loads every file in this folder; see src/server/router.ts.
import { boardGet, boardPost } from "../work-board.ts";
import type { Route } from "../router.ts";

const routes: Route[] = [
  { method: "GET", path: "/api/board", handle: ({ url }) => boardGet(url) },
  { method: "POST", prefix: "/api/board/", handle: ({ path, body }) => boardPost(path, body) },
];
export default routes;
