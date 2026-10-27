// Which look each figure wears: a worker by its lane's rank (its level: set by hand, else its depth in the tree), the hero and HQ by their place above the
// lanes, all in the theme chosen in SETTINGS (room/themes.js). A dressed palette is made once per figure, look and
// number and kept, so the sprite cache paints each costume once.
import { hash } from "../core/format.js";
import { HQBOT, palette } from "./palette.js";
import { THEMES } from "./themes.js";
import { hero, settings } from "../settings/prefs.js";

export const themeOf = (id) => THEMES[id] ?? THEMES.office;

// A room has a tree once any lane reports to another lane; until then every lane is "flat" under HQ.
export const hasTree = (lanes) => lanes.some((l) => l.parent);
// Whether the room shows ranks: once there is a tree or a level set by hand, and always in a theme with no flat look
// (Arena: a lane straight under HQ is a PM and wears the top mask from the start).
export const ranked = (lanes, theme) => !("flat" in theme) || hasTree(lanes) || lanes.some((l) => l.levelSet);

// The label mark for a rank (1 = the top level): none in a room that shows no ranks.
export function markFor(theme, rank, flat) {
  if (flat) return null;
  return theme.marks[Math.min(Math.max(1, rank || 1), theme.marks.length) - 1];
}

export function lookFor(theme, rank, flat) {
  if (flat) return theme.flat;
  const r = Math.max(1, rank || 1);
  return theme.depths[Math.min(r, theme.depths.length) - 1];
}

const dressedCache = new Map();
// The worker's own palette with the look's clothes over it. No look: exactly the everyday palette.
export function dressed(name, look, number) {
  const key = look ? `${name}|${look.id}|${look.number ? number : ""}` : name;
  let pal = dressedCache.get(key);
  if (!pal && !look) dressedCache.set(key, (pal = palette(name)));
  if (!pal) {
    pal = over(dressed(name, null), look, hash(name), number);
    dressedCache.set(key, pal);
  }
  return pal;
}
const over = (base, look, h, number) => ({ ...base, ...look.pal(base, h), look, number: look.number ? number : null });

// The hero and HQ in the chosen theme. No look: their own palette object, exactly as before.
const figureCache = new Map();
function dressedFigure(key, base, look) {
  if (!look) return base;
  const k = `${key}|${look.id}`;
  let pal = figureCache.get(k);
  if (!pal) figureCache.set(k, (pal = over(base, look, hash(key), null)));
  return pal;
}
export const heroPal = (themeId = settings.theme) => dressedFigure(`hero:${hero().name}`, hero().pal, themeOf(themeId).hero);
export const hqPal = (themeId = settings.theme) => dressedFigure("hq", HQBOT, themeOf(themeId).hq);

// Dresses every worker for its lane's rank and the theme. Run on every state and settings change: a
// lookup per worker, and a worker keeps its palette object while its look stays the same.
export function dressWorkers(workers, lanes, themeId, seatIndex) {
  const theme = themeOf(themeId), flat = !ranked(lanes, theme);
  for (const lane of lanes) {
    const w = workers.get(lane.name);
    if (!w) continue;
    const rank = lane.rank ?? lane.depth;
    w.pal = dressed(lane.name, lookFor(theme, rank, flat), (seatIndex.get(lane.name) ?? 0) + 1);
    w.mark = markFor(theme, rank, flat);
  }
}
