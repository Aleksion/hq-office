// Lanes: their status as the page shows it, and HQ's writes to them.
import { STALE_MS } from "./config.ts";
import { db } from "./db.ts";
import type { Lane } from "./types.ts";
import { event } from "./events.ts";
import { laneTree, levelName, levelNames, underHq } from "../lane-tree.ts";

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
  const parent = body.parent === undefined ? undefined : underHq(body.parent) ? null : String(body.parent).trim();
  if (parent) checkParent(body.name, parent); // before any write: a refused parent changes nothing
  const now = Date.now();
  db.query("INSERT INTO lanes (name, updated_at) VALUES (?, ?) ON CONFLICT(name) DO NOTHING").run(body.name, now);
  for (const f of LANE_FIELDS) {
    if (body[f] !== undefined) db.query(`UPDATE lanes SET ${f} = ?, updated_at = ? WHERE name = ?`).run(body[f] === "" ? null : body[f], now, body.name);
  }
  if (parent !== undefined) {
    const before = (db.query("SELECT parent FROM lanes WHERE name = ?").get(body.name) as { parent: string | null }).parent ?? null;
    if (before !== parent) {
      db.query("UPDATE lanes SET parent = ?, updated_at = ? WHERE name = ?").run(parent, now, body.name);
      event("hq", `reports to ${parent ?? "HQ"}`, body.name);
    }
  }
  if (body.note || body.phase) event("hq", [body.phase && `phase ${body.phase}`, body.note].filter(Boolean).join(": "), body.name);
}

// A lane reports to a lane that exists, never to itself, and never to one of its own reports (a loop).
function checkParent(name: string, parent: string) {
  if (parent === name) throw new Error(`${name} cannot report to itself`);
  const parentOf = (n: string) => (db.query("SELECT parent FROM lanes WHERE name = ?").get(n) as { parent: string | null } | null);
  if (!parentOf(parent)) throw new Error(`no lane named ${parent}: register it first, or use --parent hq`);
  const chain = [parent];
  for (let p = parentOf(parent)?.parent; p; p = parentOf(p)?.parent ?? null) {
    chain.unshift(p);
    if (p === name) throw new Error(`refused: ${parent} already reports to ${name} (${chain.join(" > ")}), so ${name} reporting to ${parent} would make a loop`);
    if (chain.length > 1000) break;
  }
}

// Removing a lane moves its reports up to the lane it reported to (or HQ); nothing else changes.
export function removeLane(name: string) {
  db.transaction(() => {
    const gone = db.query("SELECT parent FROM lanes WHERE name = ?").get(name) as { parent: string | null } | null;
    const up = gone?.parent ?? null;
    const kids = (db.query("SELECT name FROM lanes WHERE parent = ?").all(name) as { name: string }[]).map((r) => r.name);
    db.query("UPDATE lanes SET parent = ? WHERE parent = ?").run(up, name);
    db.query("DELETE FROM lanes WHERE name = ?").run(name);
    for (const k of kids) event("hq", `reports to ${up ?? "HQ"} (${name} was removed)`, k);
  })();
}

// Each lane with its place in the tree: depth (HQ is 0), path (its ancestors from the top) and level name.
export function withTree<T extends Lane>(lanes: T[]) {
  const row = db.query("SELECT value FROM settings WHERE key = 'levels'").get() as { value: string } | null;
  const names = levelNames(row ? JSON.parse(row.value) : null);
  const tree = laneTree(lanes);
  return lanes.map((l) => {
    const t = tree.get(l.name)!;
    return { ...l, parent: t.path.at(-1) ?? null, depth: t.depth, path: t.path, level: levelName(t.depth, names) };
  });
}
