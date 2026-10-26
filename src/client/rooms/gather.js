// Lanes gather at the conference table while their room is talking: for a few minutes after a room's last message,
// its lanes that are not busy elsewhere (nor away) walk to the table (through the room's collision map) and sit there; then
// they go back. Busy elsewhere: working at a desk, queued at the counter with a question, or gone. Only walking adds
// frames; a timer set for the moment a gathering ends sends them back, nothing polls.
import { on } from "../core/bus.js";
import { S } from "../core/state.js";
import { CONF_SEATS } from "../room/conference.js";
import { setPlaceHook, syncWorkers } from "../room/workers.js";
import { wake } from "../room/loop.js";

export const GATHER_MS = 5 * 60_000;
const FREE = new Set(["hq_turn", "stale", "waiting", "parked", "done"]);
let chairs = new Map(); // lane -> chair, kept between plans so nobody swaps chairs while others come and go
let timer = null;
let placed = false; // the first plan places them at once, as the page's first load places every worker

// Who sits where now: the most recently talking rooms first, owner before members, while chairs are free.
function plan(now = Date.now()) {
  const lanes = new Map((S?.lanes ?? []).map((l) => [l.name, l]));
  const want = [];
  const live = (S?.rooms ?? []).filter((r) => !r.archivedAt && r.threadAt && now - r.threadAt < GATHER_MS).sort((a, b) => b.threadAt - a.threadAt);
  const free = (l) => l && FREE.has(l.status) && l.herdr !== "gone"; // an agent herdr cannot find is not in the office
  for (const r of live) for (const name of [r.owner, ...r.members]) if (free(lanes.get(name)) && !want.includes(name)) want.push(name);
  const next = new Map();
  for (const name of want) if (chairs.has(name)) next.set(name, chairs.get(name));
  const used = new Set(next.values());
  for (const name of want) {
    if (next.has(name)) continue;
    const free = CONF_SEATS.find((s) => !used.has(s));
    if (!free) break;
    next.set(name, free);
    used.add(free);
  }
  return { seats: next, ends: live.length ? Math.min(...live.map((r) => r.threadAt + GATHER_MS)) : null };
}

const signature = (m) => [...m].map(([n, s]) => `${n}@${s.x},${s.y}`).sort().join("|");

// Plan again; when the table changed, the workers go where the new plan says.
function regather() {
  const { seats, ends } = plan();
  const changed = signature(seats) !== signature(chairs);
  chairs = seats;
  clearTimeout(timer);
  timer = ends ? setTimeout(regather, Math.max(0, ends - Date.now()) + 50) : null;
  if (changed && S) {
    syncWorkers(!placed);
    wake();
  }
  if (S) placed = true;
}

setPlaceHook((lane) => {
  const s = chairs.get(lane.name);
  return s ? { at: { x: s.x, y: s.y }, face: s.face } : null;
});
on("state", regather);
