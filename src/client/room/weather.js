// Season decorations drawn with the room: the window views, snow and falling leaves.
import { H, TS, W, px } from "./canvas.js";
import { season, snowy } from "./seasons.js";
import { EVENT_ART } from "./events.js";
import { travelClock } from "./beat.js";

export const CANOPY = ["..xxxxxx..", ".xxxxxxxx.", "xxxxxxxxxx", "xxxxxxxxxx", "xxxxxxxxxx", ".xxxxxxxx.", "..xxxxxx.."];
const FALL_LEAVES = ["#e8802a", "#f0c030", "#d0402a"];
// The view out of one window: a tree in this season's colours, on the glass at gx (28 by 14 pixels from y 6).
export function drawWindowView(gx, i) {
  if (EVENT_ART[season]) return; // an event paints its own views, in its layer
  const snow = snowy();
  px(gx, 18, 28, 2, { spring: "#8fd07a", summer: "#5fb050", fall: "#c8a050" }[season] ?? "#f4f8fc");
  if (season === "summer" && i === 0) { px(gx + 3, 8, 6, 4, "#ffd84a"); px(gx + 4, 7, 4, 6, "#ffd84a"); px(gx + 4, 8, 2, 2, "#fff2a0"); }
  const tx = gx + (i === 1 ? 1 : 16);
  px(tx + 4, 12, 2, 6, "#7a5232");
  if (snow) { px(tx + 3, 14, 1, 1, "#7a5232"); px(tx + 6, 15, 1, 1, "#7a5232"); } // bare twigs under the snow
  for (let r = 0; r < CANOPY.length; r++) for (let c = 0; c < 10; c++) {
    if (CANOPY[r][c] !== "x") continue;
    const low = r >= 5 || c >= 8;
    let col;
    if (snow) col = low ? "#cfdcea" : "#f6f9fc";
    else if (season === "spring") col = (c * 7 + r * 11 + c * r * 3 + i * 4) % 6 === 0 ? "#f7a8c8" : low ? "#86c45c" : "#a6dc78";
    else if (season === "summer") col = r <= 1 && c <= 4 ? "#5ab84e" : low ? "#2c7a30" : "#3f9a3f";
    else col = FALL_LEAVES[(c * 5 + r * 7 + c * r + i) % 3];
    px(tx + c, 7 + r, 1, 1, col);
  }
}
// A small fixed set of particles; each one's place comes from the frame time alone.
const FLAKES = Array.from({ length: 26 }, (_, i) => ({ x: (i * 97 + 13) % (W * TS), p: (i * 53) % (H * TS), v: 8 + ((i * 7) % 7), f: 0.6 + (i % 5) * 0.25, a: 2 + (i % 3) }));
export function drawParticles(now) {
  const leaves = season === "fall";
  if (!leaves && season !== "winter") return; // Christmas has its own snow and hearts
  const t = travelClock(now) / 1000;
  for (let i = 0; i < FLAKES.length; i++) {
    const f = FLAKES[i];
    const y = ((f.p + t * f.v * (leaves ? 1.6 : 1)) % (H * TS + 8)) - 4;
    const x = (f.x + Math.sin(t * f.f + i) * f.a * (leaves ? 3 : 1) + W * TS) % (W * TS);
    if (x > 17 * TS - 3 && x < 23 * TS + 1 && y < 24) continue; // never over the sign
    if (leaves) {
      const flip = Math.floor(t * 3 + i) % 2;
      px(x, y, flip ? 2 : 1, flip ? 1 : 2, i % 2 ? "#e8802a" : "#f0c030");
    } else {
      px(x, y, 2, 2, "#ffffff");
      px(x + 1, y + 1, 1, 1, "#b8cad8");
    }
  }
}
