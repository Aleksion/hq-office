// Updates from HQ: information, no reply asked.
import { db } from "./db.ts";
import { event } from "./events.ts";
import { floorOr, laneFloor } from "./floors.ts";

// Updates are information from HQ: no reply is asked for, and reading one sends nothing back to HQ.
// On its lane's floor, else the caller's.
export function postUpdate(body: any, callerFloor?: string) {
  const title = String(body.title ?? "").trim();
  if (!title) throw new Error("title is required");
  const floor = laneFloor(body.lane) ?? floorOr(callerFloor);
  const res = db.query("INSERT INTO updates (at, lane, title, body, floor) VALUES (?, ?, ?, ?, ?)").run(Date.now(), body.lane || null, title, body.body ?? null, floor);
  event("hq", `update: ${title}`, body.lane || null, floor);
  return Number(res.lastInsertRowid);
}
