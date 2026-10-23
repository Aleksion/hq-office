// Lanes: their status as the page shows it, and HQ's writes to them.
import { STALE_MS } from "./config.ts";
import { db } from "./db.ts";
import type { Lane } from "./types.ts";
import { event } from "./events.ts";

export function laneStatus(lane: Lane, openByLane: Map<string, number>, now: number): string {
  if (openByLane.get(lane.name)) return "needs_you";
  if (lane.phase === "done" || lane.phase === "parked") return lane.phase;
  if (lane.phase === "waiting") return "waiting";
  if (lane.herdr === "working" || lane.bg) return "moving"; // an idle agent with shells or a monitor still running is working
  if (lane.herdr === "gone") return "gone";
  if (lane.herdr_since && now - lane.herdr_since > STALE_MS) return "stale";
  return "hq_turn";
}


const LANE_FIELDS = ["title", "machine", "pane", "issue", "pr", "phase", "note"] as const;

export function upsertLane(body: any) {
  if (!body.name) throw new Error("name is required");
  const now = Date.now();
  db.query("INSERT INTO lanes (name, updated_at) VALUES (?, ?) ON CONFLICT(name) DO NOTHING").run(body.name, now);
  for (const f of LANE_FIELDS) {
    if (body[f] !== undefined) db.query(`UPDATE lanes SET ${f} = ?, updated_at = ? WHERE name = ?`).run(body[f] === "" ? null : body[f], now, body.name);
  }
  if (body.note || body.phase) event("hq", [body.phase && `phase ${body.phase}`, body.note].filter(Boolean).join(": "), body.name);
}
