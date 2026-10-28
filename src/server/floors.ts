// The floors table: which floors exist and which colour slot each one keeps. A recruited floor is a row from the moment
// it is made; a floor the lane tree makes (src/lane-tree.ts) gets its row the first time it appears. Written where lanes
// are written (lanes.ts), never from a state getter. The page gets the rows as S.floors (routes/floors.ts adds the part:
// state.ts imports lanes.ts, which imports this file, so the part cannot be added from here).
import { db } from "./db.ts";
import { floorsOf } from "../lane-tree.ts";

export type FloorRow = {
  id: string;
  name: string;
  head: string;
  origin: "recruited" | "tree";
  color: number;
  machine: string | null;
  dir: string | null;
  created_at: number;
  stopped_at: number | null;
};

// HQ's floor holds slot 0 (the page's first colour), so a floor's slots start at 1.
const FIRST_SLOT = 1;

export const liveFloors = (): FloorRow[] => db.query("SELECT * FROM floors WHERE stopped_at IS NULL ORDER BY color, id").all() as FloorRow[];

function freeSlot(preferred?: number) {
  const taken = new Set((db.query("SELECT color FROM floors WHERE stopped_at IS NULL").all() as { color: number }[]).map((r) => r.color));
  if (preferred !== undefined && !taken.has(preferred)) return preferred;
  let slot = FIRST_SLOT;
  while (taken.has(slot)) slot++;
  return slot;
}

export function addFloor(f: { id: string; name: string; head: string; origin: "recruited" | "tree"; machine?: string | null; dir?: string | null }): FloorRow {
  return db.transaction(() => {
    const clash = db.query("SELECT id FROM floors WHERE stopped_at IS NULL AND (id = ? OR head = ?)").get(f.id, f.head);
    if (clash) throw new Error(`a floor already has the id or head ${f.id === (clash as { id: string }).id ? f.id : f.head}`);
    // A stopped floor of the same id is replaced: the id is the key, and the new floor takes a slot of its own.
    db.query("DELETE FROM floors WHERE id = ?").run(f.id);
    db.query("INSERT INTO floors (id, name, head, origin, color, machine, dir, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(f.id, f.name, f.head, f.origin, freeSlot(), f.machine ?? null, f.dir ?? null, Date.now());
    return db.query("SELECT * FROM floors WHERE id = ?").get(f.id) as FloorRow;
  })();
}

export function stopFloor(id: string) {
  db.query("UPDATE floors SET stopped_at = ? WHERE id = ? AND stopped_at IS NULL").run(Date.now(), id);
}

// Brings the tree rows in line with the depth rule: a floor it makes has a live row (a stopped one comes back, in its old
// slot if that is free), and a live tree row whose lane is no longer a floor head is stopped. Recruited rows are not its.
export function syncTreeFloors(lanes: { name: string; parent?: string | null }[]) {
  const heads = new Set([...floorsOf(lanes)].filter(([, f]) => f.heads).map(([name]) => name));
  db.transaction(() => {
    const rows = db.query("SELECT * FROM floors WHERE origin = 'tree'").all() as FloorRow[];
    const now = Date.now();
    for (const r of rows) if (!r.stopped_at && !heads.has(r.head)) db.query("UPDATE floors SET stopped_at = ? WHERE id = ?").run(now, r.id);
    for (const head of heads) {
      if (db.query("SELECT 1 FROM floors WHERE stopped_at IS NULL AND (head = ? OR id = ?)").get(head, head)) continue;
      const old = rows.find((r) => r.head === head);
      if (old) db.query("UPDATE floors SET stopped_at = NULL, color = ? WHERE id = ?").run(freeSlot(old.color), old.id);
      else addFloor({ id: head, name: head, head, origin: "tree" });
    }
  })();
}
