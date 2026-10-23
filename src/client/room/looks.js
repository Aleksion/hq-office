// Which look each worker wears: its lane's depth in the tree and the theme chosen in SETTINGS (room/themes.js).
// A dressed palette is made once per name, look and number and kept, so the sprite cache paints each look once.
import { hash } from "../core/format.js";
import { palette } from "./palette.js";
import { THEMES } from "./themes.js";

export const themeOf = (id) => THEMES[id] ?? THEMES.office;

// A room has a tree once any lane reports to another lane; until then every lane is "flat" under HQ.
export const hasTree = (lanes) => lanes.some((l) => l.parent);

// The label mark for a depth: none in a room with no tree.
export function markFor(theme, depth, flat) {
  if (flat) return null;
  return theme.marks[Math.min(Math.max(1, depth || 1), theme.marks.length) - 1];
}

export function lookFor(theme, depth, flat) {
  if (flat) return theme.flat;
  const d = Math.max(1, depth || 1);
  return theme.depths[Math.min(d, theme.depths.length) - 1];
}

const dressedCache = new Map();
// The worker's own palette with the look's clothes over it. No look: exactly the everyday palette.
export function dressed(name, look, number) {
  const key = look ? `${name}|${look.id}|${look.number ? number : ""}` : name;
  let pal = dressedCache.get(key);
  if (!pal && !look) dressedCache.set(key, (pal = palette(name)));
  if (!pal) {
    const base = dressed(name, null);
    pal = { ...base, ...look.pal(base, hash(name)), look, number: look.number ? number : null };
    dressedCache.set(key, pal);
  }
  return pal;
}

// Dresses every worker for its lane's place in the tree and the theme. Run on every state and settings change: a
// lookup per worker, and a worker keeps its palette object while its look stays the same.
export function dressWorkers(workers, lanes, themeId, seatIndex) {
  const theme = themeOf(themeId), flat = !hasTree(lanes);
  for (const lane of lanes) {
    const w = workers.get(lane.name);
    if (!w) continue;
    w.pal = dressed(lane.name, lookFor(theme, lane.depth, flat), (seatIndex.get(lane.name) ?? 0) + 1);
    w.mark = markFor(theme, lane.depth, flat);
  }
}
