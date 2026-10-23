// Who wears which accessory this season, and drawing them over the sprite.
import { hash } from "../core/format.js";
import { artId, blit, px } from "./canvas.js";
import { HEADS, mirrored } from "./sprites.js";
import { shade } from "./palette.js";
import { settings } from "../settings/prefs.js";
import { season } from "./seasons.js";
import { ACCESSORIES } from "./accessory-table.js";

const COATS = ["#7a5232", "#b08850", "#6a6a78", "#2e3a5a", "#5a6a3a"]; // muted, so the coat stands apart from the bright shirts
const fits = (a, s) => a.seasons === "any" || a.seasons.includes(s);
// What each name wears this season, from its name: about half the workers wear something, one item per slot at
// most. The hero always wears the season's head item and hand item. Kept per name and season.
export const wornCache = new Map();
export function wornBy(name, isHero = false) {
  const key = `${isHero ? "hero:" : ""}${name}|${season}|${isHero ? settings.hat : ""}`;
  let out = wornCache.get(key);
  if (out) return out;
  out = [];
  const h = hash(`${name}|${season}`);
  const options = (slot) => ACCESSORIES.filter((a) => a.slot === slot && fits(a, season));
  if (isHero) {
    for (const slot of ["head", "hand"]) {
      const opts = options(slot);
      const own = opts.find((a) => a.seasons !== "any") ?? opts[0];
      if (own) out.push(own);
    }
    if (settings.hat !== "auto") { // the hero's hat setting: a chosen hat, or none
      const hand = out.filter((a) => a.slot !== "head");
      const chosen = settings.hat === "none" ? null : ACCESSORIES.find((a) => a.id === settings.hat);
      out = [...(chosen ? [chosen] : []), ...hand];
    }
  } else if ((h >>> 9) % 2 === 0) { // the hash's higher bits are the well-mixed ones
    ["head", "body", "hand"].forEach((slot, k) => {
      const opts = options(slot);
      if (opts.length && (h >>> (k * 3 + 12)) % 2 === 0) out.push(opts[(h >>> (k * 4 + 18)) % opts.length]);
    });
    if (!out.length) { const first = ["head", "body", "hand"].map(options).find((o) => o.length); if (first) out.push(first[(h >>> 21) % first.length]); }
    out = out.map((a) => a.id === "jacket" ? { ...a, pal: { J: COATS[(h >>> 27) % COATS.length], j: shade(COATS[(h >>> 27) % COATS.length], 0.7) } } : a);
  }
  wornCache.set(key, out);
  return out;
}
// Drawn on top of the sprite with its mirror rule. Body items stay under hair that falls over the shoulders.
// busyHand: the hand is holding a coffee or a snack, so the hand item waits.
export function drawAccessories(pal, items, x, y, dir, step, alpha = 1, busyHand = false) {
  if (!items.length) return;
  blit(`a${artId(pal)}|${artId(items)}|${dir}|${step}|${busyHand}`, x, y, alpha, () => paintAccessories(pal, items, 0, 0, dir, step, busyHand));
}
function paintAccessories(pal, items, x, y, dir, step, busyHand) {
  const mirror = mirrored(dir, step), side = dir === "left" || dir === "right";
  const set = HEADS[pal.t] || HEADS[0];
  const headLen = (dir === "up" ? set.up : dir === "down" ? set.down : set.side).length;
  for (const it of items) {
    if (it.slot === "hand" && busyHand) continue;
    const pat = it.slot === "hand" ? it.hand : side ? it.side : it.front;
    const held = it.slot === "hand" && side, dx = (pat.x ?? 0) + (held ? -1 : 0), dy = held ? 1 : 0;
    for (let r = 0; r < pat.rows.length; r++) {
      const row = pat.y + r + dy;
      if (it.slot === "body" && row < headLen) continue;
      for (let c = 0; c < pat.rows[r].length; c++) {
        const ch = pat.rows[r][c];
        if (ch === "." || !ch) continue;
        const cc = c + dx;
        px(x + (mirror ? 15 - cc : cc), y + row, 1, 1, it.pal[ch] ?? pal[ch]);
      }
    }
  }
}
