// Moved here from server.ts.
import { GH_CACHE_MS, boardText, createBoard } from "./board.ts";
import { CONFIG } from "./config.ts";
import { db } from "./db.ts";
import { bump } from "./push.ts";
import { event } from "./events.ts";
import { json } from "./json.ts";

// The only GitHub poll: board.ts runs it while there are open items. HUD_GH_BIN swaps the gh binary.
export const board = createBoard({ db, repo: CONFIG.githubRepo, onChange: bump, event });

export async function boardGet(url: URL) {
  if (url.searchParams.get("refresh")) await board.refresh(GH_CACHE_MS);
  const v = board.view();
  if (url.searchParams.get("format") === "text") return new Response(boardText(v, CONFIG.owner) + "\n", { headers: { "content-type": "text/plain; charset=utf-8" } });
  return json(v);
}

export function boardPost(path: string, body: any) {
  if (path === "/api/board/track") return board.track(body);
  if (path === "/api/board/done") return board.done(body), { ok: true };
  if (path === "/api/board/pause") return board.pause(body), { ok: true };
  if (path === "/api/board/resume") return board.resume(body), { ok: true };
  throw new Error("not found");
}
