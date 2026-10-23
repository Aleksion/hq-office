// Updates from HQ: information, no reply asked.
import { db } from "./db.ts";
import { event } from "./events.ts";

// Updates are information from HQ: no reply is asked for, and reading one sends nothing back to HQ.
export function postUpdate(body: any) {
  const title = String(body.title ?? "").trim();
  if (!title) throw new Error("title is required");
  const res = db.query("INSERT INTO updates (at, lane, title, body) VALUES (?, ?, ?, ?)").run(Date.now(), body.lane || null, title, body.body ?? null);
  event("hq", `update: ${title}`, body.lane || null);
  return Number(res.lastInsertRowid);
}
