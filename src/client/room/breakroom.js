// Idle workers' life in the break room: coffee, snacks, wandering, chats.
import { px } from "./canvas.js";
import { workers } from "./workers.js";
import { route } from "./collision.js";
import { changeAt, mode, onBeat, steadyClock } from "./beat.js";

// Idle workers (done or parked) live their own life here. They wander, sip coffee at the kitchen, grab a snack,
// or pair up and face each other, nodding. Nobody says anything; the movement and the gestures carry it.
// Between errands each one rests 8 to 20 s: walking is drawn at the walking rate, so it stays the exception.
const REST_MS = 8000, REST_SPREAD_MS = 12000;
const COFFEE_SPOT = { x: 22, y: 15 }; // beside the kitchen coffee machine, facing it
const SNACK_SPOT = { x: 20, y: 15 };  // below the snack table, facing it
const WANDER = [[16, 13], [16, 14], [17, 14], [18, 14], [19, 14], [16, 15], [17, 15], [18, 15], [19, 15], [14, 13], [14, 14], [14, 15], [15, 13], [15, 14], [15, 15]];
const CHAT_PAIRS = [[[16, 14], [17, 14]], [[18, 14], [19, 14]], [[16, 15], [17, 15]], [[18, 15], [19, 15]]]; // left, right
const SNACK_COLORS = ["#e0c040", "#3c6fd6", "#ff8fab", "#d63c3c"];
export const isIdle = (lane) => lane.status === "done" || lane.status === "parked";
const pickOne = (list) => list[Math.floor(Math.random() * list.length)];
const spotOf = ([x, y]) => ({ x, y });
// A tile is taken when another worker is headed for it or standing on it.
function taken([x, y], self) {
  for (const o of workers.values()) {
    if (o === self || !o.target) continue;
    if (Math.round(o.target.x) === x && Math.round(o.target.y) === y) return true;
  }
  return false;
}
function openSpot(list, self) {
  const free = list.filter((p) => !taken(p, self));
  return free.length ? pickOne(free) : null;
}
function sendTo(w, spot, act) {
  w.brain.act = act;
  w.brain.acting = false;
  w.target = spot;
  w.path = route(w, spot);
}
export function idleBrain(w, now, all) {
  const b = w.brain;
  if (w.path.length) return; // still walking
  if (b.act && !b.acting) { b.acting = true; b.until = now + b.act.dur; w.face = b.act.face; }
  if (b.acting) {
    if (now >= b.until) { b.act = null; b.acting = false; b.nextAt = now + REST_MS + Math.random() * REST_SPREAD_MS; }
    else { changeAt(onBeat(b.until)); return; }
  }
  if (now < b.nextAt) { changeAt(onBeat(b.nextAt)); return; }
  const partners = all.filter((o) => o !== w && o.brain && !o.brain.act && o.path.length === 0 && isIdle(o.lane) && Math.hypot(o.x - w.x, o.y - w.y) < 9);
  const roll = Math.random();
  const pairs = CHAT_PAIRS.filter(([l, r]) => !taken(l, w) && !taken(r, w));
  if (partners.length && pairs.length && roll < 0.35) {
    const [left, right] = pickOne(pairs);
    const dur = 4000 + Math.random() * 3000;
    sendTo(w, spotOf(left), { kind: "chat", dur, face: "right" });
    sendTo(pickOne(partners), spotOf(right), { kind: "chat", dur, face: "left" });
  } else if (roll < 0.6 && !taken([COFFEE_SPOT.x, COFFEE_SPOT.y], w)) sendTo(w, COFFEE_SPOT, { kind: "coffee", dur: 3500 + Math.random() * 1500, face: "right" });
  else if (roll < 0.8 && !taken([SNACK_SPOT.x, SNACK_SPOT.y], w)) sendTo(w, SNACK_SPOT, { kind: "snack", dur: 2500 + Math.random() * 1500, face: "up" });
  else {
    const spot = openSpot(WANDER, w);
    if (spot) sendTo(w, spotOf(spot), { kind: "stand", dur: 1500 + Math.random() * 2500, face: pickOne(["down", "left", "right"]) });
    else changeAt(onBeat(b.nextAt = now + 1500)); // nowhere free right now: try again shortly
  }
}
// Body movement while idle: a waddle when walking, a nod when chatting, a sip or a munch when eating.
export function idleLift(w, moving, now) {
  const b = w.brain;
  if (!b) return 0;
  if (moving) return Math.abs(Math.sin(now / 110 + w.bob)) > 0.5 ? -1 : 0;
  if (!b.acting) return 0;
  if (b.act.kind === "chat") return Math.floor(steadyClock(now) / 350 + w.bob) % 2 ? -1 : 0;
  if (b.act.kind === "coffee") return Math.floor(steadyClock(now) / 700) % 2 ? -1 : 0;
  if (b.act.kind === "snack") return Math.floor(steadyClock(now) / 1000) % 2 ? -1 : 0;
  return 0;
}
// A waiting worker checks his watch now and then: a faint glint on the wrist for a moment, then nothing.
// Each worker has his own timing, from his name.
export function drawWatchCheck(w, sx, sy, now) {
  const every = mode().steady;
  if (every === null) return; // frozen: no glint
  const t = Math.floor(now / every) * every, phase = (t + w.bob * 37) % 9000;
  if (phase > 1400) { changeAt(Math.ceil((t + 9000 - phase) / every) * every); return; }
  changeAt(t + every);
  if (Math.floor(t / 140) % 2) px(sx + 13, sy + 12, 2, 2, "#ffffff");
}
// What is in his hand while he eats or drinks.
export function drawProp(w, sx, sy) {
  const b = w.brain;
  if (!b || !b.acting) return;
  if (b.act.kind === "coffee") { px(sx + 12, sy + 8, 4, 1, "#3a2a20"); px(sx + 12, sy + 9, 4, 4, "#f8f8f0"); }
  if (b.act.kind === "snack") px(sx + 12, sy + 9, 4, 4, SNACK_COLORS[w.bob % SNACK_COLORS.length]);
}
