// valentine: the room for this event. Its still() is painted once into a layer and copied every frame; live(now)
// draws the moving bits.
import { HEART5, WIN, disc, dp, drift, inGlass, mullions, plank, rnd, stamp, swagLine, swagY, text3, twinkle } from "../art.js";

const inHeart = (x, y) => { const a = x * x + y * y - 1; return a * a * a - x * x * y * y * y <= 0; };
// A heart s pixels to the unit, centred at cx, cy; fill(dx, dy, edge) gives each pixel's colour, or null.
function heartArt(cx, cy, s, fill) {
  const ins = (x, y) => inHeart((x + 0.5 - cx) / s, (cy - y - 0.5) / s + 0.15);
  for (let y = Math.floor(cy - 1.4 * s); y <= Math.ceil(cy + 1.1 * s); y++) for (let x = Math.floor(cx - 1.3 * s); x <= Math.ceil(cx + 1.3 * s); x++) {
    if (!ins(x, y)) continue;
    const c = fill(x - cx, y - cy, !ins(x - 1, y) || !ins(x + 1, y) || !ins(x, y - 1) || !ins(x, y + 1));
    if (c) dp(x, y, 1, 1, c);
  }
}
const HEART7 = [".xx.xx.", "xxxxxxx", "xxxxxxx", ".xxxxx.", "..xxx..", "...x..."];export default {
  still() {
    WIN.forEach((gx, i) => inGlass(gx, () => {
      dp(gx, 6, 28, 14, "#ffd0e0"); dp(gx, 6, 28, 4, "#ffe4ee");
      stamp(HEART5, { x: "#ffffff" }, gx + 2 + ((i * 7) % 9), 7); stamp(HEART5, { x: "#fff4f8" }, gx + 18, 9 + (i % 2));
      dp(gx, 18, 28, 2, "#6ab85a");
      if (i === 1) { dp(gx + 6, 14, 1, 4, "#7a5232"); heartArt(gx + 6.5, 11, 3.2, (dx, dy, e) => (e ? "#e0306a" : dx < -1 && dy < -1 ? "#ffb0c8" : "#ff6f9f")); }
      dp(gx, 16, 28, 3, "#2f7a3a"); for (let k = 0; k < 7; k++) dp(gx + k * 4 + 1, 15, 3, 1, "#3f8a3f");
      for (let k = 0; k < 7; k++) { const x = gx + 1 + k * 4 + (k % 2), y = 15 + (k % 2); dp(x, y, 2, 2, "#e0304a"); dp(x, y, 1, 1, "#ff8fa8"); }
    }));
    mullions();
    // a garland of hearts along the wall band
    swagLine(4, 266, 38, 25, 2, "#c84b6a");
    for (let k = 0, x = 6; x <= 262; x += 9, k++) stamp(HEART5, { x: ["#e0304a", "#ff6f9f", "#ffb0c8"][k % 3] }, x, swagY(x + 2, 4, 38, 25, 2) + 1);
    // a heart wreath with little flowers
    heartArt(16, 13, 6.6, (dx, dy, e) => { const inner = inHeart((dx + 0.5) / 3.8, (-dy - 0.5) / 3.8 + 0.15); if (inner) return null; const h = (dx * 7 + dy * 3 + 99) % 6; return h === 0 ? "#ffffff" : h === 1 ? "#ffb0c8" : e ? "#9a1a30" : "#e0304a"; });
    // a big heart shot through with an arrow
    const big = (x, y) => inHeart((x + 0.5 - 88) / 6.2, (13 - y - 0.5) / 6.2 + 0.15);
    for (let k = 0; k <= 30; k++) { const x = 73 + k, y = 21 - Math.round(k * 0.47); if (!big(x, y)) dp(x, y, 1, 1, "#8a5a32"); }
    dp(71, 20, 2, 1, "#ffc0d8"); dp(72, 21, 2, 1, "#ffc0d8"); dp(70, 22, 2, 1, "#ffc0d8"); dp(73, 23, 1, 1, "#ffc0d8");
    dp(103, 6, 2, 1, "#c8c8d0"); dp(103, 7, 1, 1, "#c8c8d0"); dp(104, 5, 1, 1, "#c8c8d0");
    heartArt(88, 13, 6.2, (dx, dy, e) => (e && (dx > 0 || dy > 2) ? "#9a1a30" : dx < -2 && dy < -2 ? "#ff8fa8" : "#e0304a"));
    // LOVE
    plank(157, 8, 23, 11, "#fff0f6", "#ff7fb0"); text3("LOVE", 161, 11, "#e0304a");
    stamp(HEART5, { x: "#ff6f9f" }, 150, 11); stamp(HEART5, { x: "#ff6f9f" }, 182, 11);
    // paper hearts on strings by the sign
    [[234, [4, 11, 18]], [248, [7, 15]], [262, [3, 10, 17]]].forEach(([x, ys], s) => {
      dp(x, 0, 1, ys[ys.length - 1] + 2, "#c84b6a");
      ys.forEach((y, k) => stamp(HEART7, { x: ["#e0304a", "#ff6f9f", "#ffb0c8"][(s + k) % 3] }, x - 3, y));
    });
    dp(376, 0, 1, 6, "#c84b6a"); stamp(HEART7, { x: "#e0304a" }, 373, 6);
    // a gift box that holds the balloons down (the balloons are live)
    dp(372, 72, 8, 6, "#ff8fb8"); dp(375, 72, 2, 6, "#e0304a"); dp(372, 74, 8, 1, "#e0304a");
    // roses in vases and a teddy with a heart along the wall
    for (const x of [42, 202]) {
      dp(x + 1, 37, 1, 4, "#3f9e4f"); dp(x + 3, 36, 1, 5, "#3f9e4f"); dp(x + 5, 37, 1, 4, "#3f9e4f");
      for (const [rx, ry] of [[x, 35], [x + 2, 34], [x + 4, 35]]) { dp(rx, ry, 3, 2, "#e0304a"); dp(rx, ry, 1, 1, "#ff8fa8"); }
      dp(x + 1, 41, 5, 6, "#bfe4f4"); dp(x + 2, 42, 1, 4, "#ffffff");
    }
    disc(124, 37, 3, "#b07a44"); dp(120, 34, 2, 2, "#b07a44"); dp(127, 34, 2, 2, "#b07a44"); dp(120, 40, 9, 7, "#b07a44");
    dp(123, 38, 3, 2, "#e8c898"); dp(122, 36, 1, 1, "#22202a"); dp(126, 36, 1, 1, "#22202a"); dp(124, 38, 1, 1, "#22202a");
    stamp(HEART5, { x: "#e0304a" }, 122, 42);
    // rose petals along the bottom wall and a heart rug in the break room
    for (let k = 0; k < 36; k++) dp(6 + Math.floor(rnd(k + 300) * 228), 239 + Math.floor(rnd(k + 400) * 15), rnd(k + 500) > 0.5 ? 2 : 1, 1, ["#e0304a", "#ff6f9f", "#ffb0c8"][k % 3]);
    heartArt(276, 243, 10.5, (dx, dy, e) => (e ? "#ff6f9f" : (dx * 5 + dy * 3 + 99) % 11 === 0 ? "#ffffff" : "#ffc0d4"));
    // a heart box of chocolates on the snack table, pillows on the couch
    dp(345, 226, 18, 2, "#ffd84a"); dp(345, 223, 3, 3, "#5a3020");
    heartArt(355, 223.5, 4.2, (dx, dy, e) => (e ? "#9a1a30" : dy === 0 ? "#ffd84a" : "#e0304a"));
    for (const x of [274, 359]) heartArt(x + 3.5, 207, 3, (dx, dy, e) => (e ? "#c0306a" : dx < 0 && dy < 0 ? "#ffd0e0" : "#ff8fb8"));
  },
  live(now) {
    const t = now / 1000;
    [[372, 37, "#ff4f8f"], [379, 34, "#e0304a"], [375, 45, "#ff8fb8"]].forEach(([x, y, c], k) => {
      const by = y + Math.round(Math.sin(t * 1.4 + k * 2) * 1.5);
      for (let j = 0; j <= 72 - by - 4; j++) dp(Math.round(x + 0.5 + ((376 - x) * j) / (72 - by - 4)), by + 4 + j, 1, 1, "#8a8a96");
      stamp(HEART7, { x: c }, x - 3, by - 2); dp(x - 2, by - 1, 1, 1, "#ffffff");
    });
    drift(now, 20, 0.7, (x, y, i) => { const c = ["#ff4f8f", "#e0304a", "#ffb0c8", "#ff8fb8"][i % 4]; if (i % 3 === 0) stamp(HEART5, { x: c }, x, y); else { dp(x, y, 1, 1, c); dp(x + 2, y, 1, 1, c); dp(x, y + 1, 3, 1, c); dp(x + 1, y + 2, 1, 1, c); } }, { rise: true });
    for (let k = 0; k < 5; k++) if ((Math.floor(now / 400) + k * 3) % 7 === 0) twinkle(30 + k * 70, 60 + ((k * 53) % 140), "#ffffff");
  },
  counter() {
    dp(357, 37, 1, 4, "#3f9e4f"); dp(360, 36, 1, 5, "#3f9e4f"); dp(363, 37, 1, 4, "#3f9e4f");
    for (const [rx, ry] of [[356, 35], [359, 34], [362, 35]]) { dp(rx, ry, 3, 2, "#e0304a"); dp(rx, ry, 1, 1, "#ff8fa8"); }
    dp(357, 41, 7, 5, "#bfe4f4"); dp(358, 42, 1, 3, "#ffffff");
  },
};
