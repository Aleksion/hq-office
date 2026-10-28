// Everyday gadgets: each worker's habit (a mug, a bottle, a donut, a tumbler), on its desk while it works and in its
// hand elsewhere, swapped now and then, with a sip or a bite about once a minute.
//
// Nothing here keeps state or asks for a frame of its own. The pick follows the wall clock in 2-hour blocks (the
// loop already wakes on the minute); a sip follows the steady clock (room/beat.js), whose beat the room draws anyway,
// so it only shows on frames the room presents regardless, and POWER SAVER (no steady beat) shows no sips.
import { hash } from "../core/format.js";
import { artId, blit, px, TS } from "./canvas.js";
import { mirrored } from "./sprites.js";
import { ACCESSORIES } from "./accessory-table.js";
import { mode, steadyClock } from "./beat.js";

export const GADGETS = ACCESSORIES.filter((a) => a.slot === "gadget");
export const BLOCK_MS = 2 * 60 * 60 * 1000;
export const SIP_EVERY_MS = 60_000, SIP_MS = 1500;

// The habit: one gadget per name, for good.
export const habitOf = (name) => GADGETS[hash(`${name}|gadget`) % GADGETS.length];
// What a name holds in the 2-hour block of the wall clock that `wall` falls in: mostly its habit (5 blocks in 8),
// now and then another gadget (2 in 8), and now and then nothing (1 in 8).
export function gadgetFor(name, wall = Date.now()) {
  const h = hash(`${name}|${Math.floor(wall / BLOCK_MS)}`), roll = (h >>> 8) % 8, habit = habitOf(name);
  if (roll < 5) return habit;
  if (roll === 7) return null;
  const others = GADGETS.filter((g) => g !== habit);
  return others[(h >>> 16) % others.length];
}
// Mid-sip at t (the steady clock): once a minute, at the name's own second, for SIP_MS.
export const sipping = (name, t) => (t + (hash(`${name}|sip`) % SIP_EVERY_MS)) % SIP_EVERY_MS < SIP_MS;

const side = (dir) => dir === "left" || dir === "right";
// What a worker shows this frame: null, or { g, pose, other }. pose: "desk" (standing on its desk while it sits
// there), "hand" (held), "sip" (raised to the face, in the hand even at the desk). other: a seasonal item has the
// right hand, so the gadget is in the left one, and side-on (where one hand shows) it is not drawn.
// busy: the break room's coffee or snack is in the hand. The hero and HQ never get here: workers only.
export function heldBy(w, items, now, moving, busy) {
  if (busy) return null;
  const g = gadgetFor(w.lane.name);
  if (!g) return null;
  const still = !moving && w.lane.status !== "gone";
  const sip = still && mode().steady !== null && sipping(w.lane.name, steadyClock(now));
  const pose = sip ? "sip" : !moving && w.seat && w.target === w.seat ? "desk" : "hand";
  const other = items.some((a) => a.slot === "hand");
  if (pose !== "desk" && other && side(w.dir)) return null;
  return { g, pose, other };
}

// Held or raised, over the sprite, with the accessories' mirror rule (flipped once more for the left hand). Side-on it
// is held out one column forward (the held pose one row lower too), so it stays clear of a side-on mask's mark; the art
// keeps clear of the mark and of a chest number from the front and back (room/accessory-table.js).
export function drawGadget(pal, held, x, y, dir, step, alpha = 1) {
  const { g, pose, other } = held;
  blit(`g${artId(pal)}|${g.id}|${pose}|${other}|${dir}|${step}`, x, y, alpha, () => {
    const pat = g[pose], mirror = mirrored(dir, step) !== (other && !side(dir));
    const dx = side(dir) ? 1 : 0, dy = side(dir) && pose === "hand" ? 1 : 0;
    pat.rows.forEach((row, r) => [...row].forEach((ch, c) => {
      if (ch === ".") return;
      const cc = c + dx;
      px(mirror ? 15 - cc : cc, pat.y + r + dy, 1, 1, g.pal[ch] ?? pal[ch]);
    }));
  });
}

// On the desk: the held art, flipped so a handle points away from the monitor, standing on the desk top left of the
// monitor with its foot on the row the worker's head starts. Clear of the monitor, the bubble (right of the head) and
// the name label (below the worker); the worker's head never reaches it.
export const DESK_RIGHT = 2, DESK_FOOT = 10; // the gadget's right column and foot row, from the desk's tile (seat x, seat y - 1)
export function drawDeskGadget(pal, g, seat, alpha = 1) {
  blit(`gd${artId(pal)}|${g.id}`, seat.x * TS, (seat.y - 1) * TS, alpha, () => {
    const rows = g.hand.rows;
    const cols = rows.flatMap((row) => [...row].map((ch, c) => (ch === "." ? -1 : c)).filter((c) => c >= 0));
    const c0 = Math.min(...cols), last = rows.length - 1;
    rows.forEach((row, r) => [...row].forEach((ch, c) => {
      if (ch !== ".") px(DESK_RIGHT - (c - c0), DESK_FOOT - (last - r), 1, 1, g.pal[ch] ?? pal[ch]);
    }));
  });
}
