// Drawing tools for event art: the event layer's px (dp), stamps, glows, pixel letters, bunting, shared shapes.
import { H, SC, TS, W, ctx } from "./canvas.js";
import { shade } from "./palette.js";
import { CANOPY } from "./weather.js";

// Each event's still art is drawn once into a layer and copied every frame; only the moving bits (particles,
// fireworks, blinking lights, balloons) are drawn live. Wall art keeps clear of the sign (x 270 to 370, y 0 to 24);
// floor props sit against the walls, in the corners and on furniture, under the walkers and their labels.
export let dc = ctx; // where event pixels go: the room itself, or an event's cached layer
export function dp(x, y, w, h, c) { dc.fillStyle = c; dc.fillRect(Math.round(x * SC), Math.round(y * SC), Math.round(w * SC), Math.round(h * SC)); }
// A small picture from rows of letters, each letter a colour in pal. "." and letters not in pal are see-through.
export function stamp(rows, pal, x, y) {
  for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) {
    const col = pal[rows[r][c]];
    if (col) dp(x + c, y + r, 1, 1, col);
  }
}
export const rnd = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
export function disc(cx, cy, r, c) {
  for (let y = -Math.floor(r); y <= Math.floor(r); y++) { const w = Math.floor(Math.sqrt(r * r - y * y) + 0.5); dp(cx - w, cy + y, 2 * w + 1, 1, c); }
}
// A soft glow in two steps, one row at a time.
export function glow(cx, cy, r, c, a) {
  dc.globalAlpha = a;
  for (const rr of [r, Math.round(r * 0.6)]) for (let y = -rr; y <= rr; y++) { const w = Math.round(Math.sqrt(rr * rr - y * y)); dp(cx - w, cy + y, 2 * w, 1, c); }
  dc.globalAlpha = 1;
}
// 3 by 5 pixel letters, for the signs and banners.
const FONT3 = { A: "010101111101101", J: "001001001101010", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111", G: "011100101101011", H: "101101111101101", I: "111010010010111", K: "101101110101101", L: "100100100100111", N: "110101101101101", O: "010101101101010", P: "110101110100100", R: "110101110101101", S: "011100010001110", T: "111010010010010", U: "101101101101111", V: "101101101101010", W: "101101101111101", X: "101101010101101", Y: "101101010010010", "0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001011001111", "4": "101101111001001", "5": "111100111001111", "6": "111100111101111", "7": "111001010010010", "8": "111101111101111", "9": "111101111001111", "!": "010010010000010" };
export function text3(s, x, y, c, k = 1) {
  for (const ch of String(s)) {
    const f = FONT3[ch];
    if (f) for (let i = 0; i < 15; i++) if (f[i] === "1") dp(x + (i % 3) * k, y + Math.floor(i / 3) * k, k, k, c);
    x += 4 * k;
  }
}
export function plank(x, y, w, h, c, edge) { dp(x, y, w, h, edge); dp(x + 1, y + 1, w - 2, h - 2, c); }
// A line that dips between nails every `span` pixels.
export const swagY = (x, x0, span, y, depth) => y + Math.round(Math.abs(Math.sin(((x - x0) / span) * Math.PI)) * depth);
export function swagLine(x0, x1, span, y, depth, c) { for (let x = x0; x <= x1; x++) dp(x, swagY(x, x0, span, y, depth), 1, 1, c); }
// Pennants on a string along the top of the wall, stopping short of the sign.
export function bunting(x0, x1, colors, step = 7) {
  swagLine(x0, x1, 44, 1, 3, "#5a4a4a");
  for (let k = 0, x = x0 + 1; x + 5 <= x1; x += step, k++) {
    const t = swagY(x + 2, x0, 44, 1, 3) + 1, c = colors[k % colors.length];
    dp(x, t, 5, 2, c); dp(x + 1, t + 2, 3, 2, c); dp(x + 2, t + 4, 1, 1, c);
    dp(x + 4, t, 1, 2, shade(c, 0.78)); dp(x + 3, t + 2, 1, 2, shade(c, 0.78));
  }
}
// Window glass: 28 by 14 pixels from y 6, the mullion at +13.
export const WIN = [34, 114, 194];
export function inGlass(gx, fn) { dc.save(); dc.beginPath(); dc.rect(gx * SC, 6 * SC, 28 * SC, 14 * SC); dc.clip(); fn(); dc.restore(); }
export function mullions() { for (const gx of WIN) dp(gx + 13, 6, 2, 14, "#3c4a68"); }
export function windowTree(tx, colors, trunk = "#7a5232") {
  dp(tx + 4, 12, 2, 6, trunk);
  for (let r = 0; r < CANOPY.length; r++) for (let c = 0; c < 10; c++) if (CANOPY[r][c] === "x") dp(tx + c, 7 + r, 1, 1, colors[(c * 5 + r * 7 + c * r + tx) % colors.length]);
}
export const HEART5 = [".x.x.", "xxxxx", ".xxx.", "..x.."];
export function pumpkin(x, y, w, h, face) {
  const o = "#f08a2a", O = "#c0661e";
  dp(x + 1, y, w - 2, h, o); dp(x, y + 1, w, h - 2, o);
  for (let i = 2; i < w - 2; i += 3) dp(x + i, y + 1, 1, h - 2, O);
  dp(x + 1, y + h - 1, w - 2, 1, "#8a4214");
  dp(x + 1, y + 1, 1, 2, "#ffb868");
  dp(x + (w >> 1) - 1, y - 2, 2, 2, "#5a7a2a");
  if (!face) return;
  const f = face === "lit" ? "#ffe060" : "#3a2418";
  if (w >= 11) {
    for (const ex of [x + 2, x + w - 5]) { dp(ex + 1, y + 2, 1, 1, f); dp(ex, y + 3, 3, 1, f); }
    dp(x + (w >> 1), y + 4, 1, 1, f);
    dp(x + 2, y + h - 4, w - 4, 1, f); dp(x + 3, y + h - 3, w - 6, 1, f);
    dp(x + 4, y + h - 4, 1, 1, o); dp(x + w - 5, y + h - 4, 1, 1, o); dp(x + (w >> 1), y + h - 3, 1, 1, o);
  } else {
    dp(x + 2, y + 2, 1, 1, f); dp(x + w - 3, y + 2, 1, 1, f);
    dp(x + 2, y + h - 3, w - 4, 1, f);
  }
}
// Falling (or rising) bits for the seasonal weather, each one's place from the frame time alone.
const BITS = Array.from({ length: 32 }, (_, i) => ({ x: rnd(i + 1) * W * TS, p: rnd(i + 51) * H * TS, v: 7 + rnd(i + 91) * 8, f: 0.5 + rnd(i + 131) * 1.2, a: 2 + rnd(i + 171) * 4 }));
export function drift(now, n, speed, draw, { rise = false, wind = 0 } = {}) {
  const t = now / 1000, span = H * TS + 10;
  for (let i = 0; i < n; i++) {
    const b = BITS[i];
    let y = ((b.p + t * b.v * speed) % span) - 5;
    if (rise) y = H * TS - y;
    const x = ((((b.x + t * wind * b.v + Math.sin(t * b.f + i) * b.a * 2) % (W * TS)) + W * TS) % (W * TS));
    if (x > 17 * TS - 6 && x < 23 * TS + 2 && y < 25) continue; // never over the sign
    draw(x, y, i, t);
  }
}
export function twinkle(x, y, c) { dp(x, y - 1, 1, 3, c); dp(x - 1, y, 3, 1, c); }
export const partyYear = (d = new Date()) => (d.getMonth() >= 6 ? d.getFullYear() + 1 : d.getFullYear());
export function setDc(v) { return (dc = v); }
