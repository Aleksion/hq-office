// Moved here from server.ts.
import { GH_CACHE_MS, boardText, createBoard } from "./board.ts";
import { CONFIG } from "./config.ts";
import { db } from "./db.ts";
import { bump } from "./push.ts";
import { event } from "./events.ts";
import { json } from "./json.ts";
import { firstFloor, laneFloor, type Caller } from "./floors.ts";

// The only GitHub poll: board.ts runs it while there are open items. HUD_GH_BIN swaps the gh binary.
export const board = createBoard({ db, repo: CONFIG.githubRepo, onChange: bump, event, firstFloor });
// Items from before floors are on the first floor.
db.query("UPDATE work_items SET floor = ? WHERE floor IS NULL").run(firstFloor());

// hud board: the caller's floor, or every floor with x-hud-floor: all.
export async function boardGet(url: URL, caller: Caller) {
  if (url.searchParams.get("refresh")) await board.refresh(GH_CACHE_MS);
  const v = board.view({ floor: caller.all ? null : caller.floor });
  if (url.searchParams.get("format") === "text") return new Response(boardText(v, CONFIG.owner) + "\n", { headers: { "content-type": "text/plain; charset=utf-8" } });
  return json(v);
}

// A tracked item is filed on its lane's floor, else the caller's.
export function boardPost(path: string, body: any, caller: Caller) {
  if (path === "/api/board/track") return board.track({ ...body, floor: laneFloor(body.lane) ?? caller.floor });
  if (path === "/api/board/done") return board.done(body), { ok: true };
  if (path === "/api/board/pause") return board.pause(body), { ok: true };
  if (path === "/api/board/resume") return board.resume(body), { ok: true };
  throw new Error("not found");
}
