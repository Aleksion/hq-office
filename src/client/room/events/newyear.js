// newyear: the room for this event. Its still() is painted once into a layer and copied every frame; live(now)
// draws the moving bits.
import { shade } from "../palette.js";
import { WIN, dc, disc, dp, drift, inGlass, mullions, partyYear, plank, rnd, stamp, swagLine, swagY, text3, twinkle } from "../art.js";

function balloon(x, y, c, tx, ty) {
  for (let k = 0, n = Math.max(1, ty - y - 4); k <= n; k++) dp(Math.round(x + (tx - x) * (k / n)), y + 4 + k, 1, 1, "#8a8a96");
  dp(x - 2, y - 3, 5, 7, c); dp(x - 3, y - 2, 7, 5, c);
  dp(x - 1, y - 2, 1, 2, "#ffffff"); dp(x, y + 4, 1, 1, shade(c, 0.7));
}
// Fireworks: a rocket climbs, then a ring of sparks opens and fades. Its place and colour change every burst.
function firework(gx, i, now) {
  const period = 1300 + i * 230, n = Math.floor((now + i * 650) / period), p = ((now + i * 650) % period) / period;
  const cx = gx + 4 + Math.floor(rnd(n * 3 + i) * 20), cy = 8 + Math.floor(rnd(n * 5 + i + 7) * 4);
  const c = ["#ff4fa8", "#4fd8ff", "#ffd84a", "#7fff6a", "#ff7a3a", "#ffffff"][n % 6];
  if (p < 0.2) { dp(cx, 19 - Math.round((19 - cy) * (p / 0.2)), 1, 2, "#fff6c0"); return; }
  const q = (p - 0.2) / 0.8, r = 1.5 + q * 6;
  dc.globalAlpha = 1 - q * 0.8;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    dp(cx + Math.round(Math.cos(a) * r), cy + Math.round(Math.sin(a) * r * 0.85), 1, 1, c);
    if (k % 2) dp(cx + Math.round(Math.cos(a) * r * 0.55), cy + Math.round(Math.sin(a) * r * 0.5), 1, 1, "#ffffff");
  }
  if (q < 0.2) dp(cx - 1, cy - 1, 3, 3, "#ffffff");
  dc.globalAlpha = 1;
}export default {
  still() {
    WIN.forEach((gx, i) => inGlass(gx, () => {
      dp(gx, 6, 28, 14, "#141a3a"); dp(gx, 14, 28, 6, "#1f2850");
      for (let s = 0; s < 6; s++) dp(gx + Math.floor(rnd(i * 11 + s + 70) * 28), 6 + Math.floor(rnd(i * 13 + s + 90) * 6), 1, 1, "#ffffff");
      for (let x = 0, k = 0; x < 28; k++) {
        const w = 3 + Math.floor(rnd(i * 17 + k) * 4), h = 3 + Math.floor(rnd(i * 19 + k + 5) * 6);
        dp(gx + x, 20 - h, w, h, "#0c0f22");
        for (let yy = 21 - h; yy < 19; yy += 2) for (let xx = 1; xx < w - 1; xx += 2) if (rnd(gx + x * 3 + xx + yy * 7) > 0.55) dp(gx + x + xx, yy, 1, 1, "#ffd84a");
        x += w + 1;
      }
    }));
    mullions();
    // the party banner, one word between each pair of windows
    const flags = (word, x0) => {
      const x1 = x0 + word.length * 9 - 1;
      swagLine(x0 - 1, x1 + 1, x1 - x0 + 2, 2, 2, "#d8dce8");
      [...word].forEach((ch, k) => {
        const x = x0 + k * 9, t = swagY(x + 4, x0 - 1, x1 - x0 + 2, 2, 2) + 1, c = ["#ffd84a", "#d8dce8", "#ff4fa8"][k % 3];
        dp(x, t, 8, 7, c); dp(x + 1, t + 7, 6, 1, c); dp(x + 2, t + 8, 4, 1, c); dp(x + 3, t + 9, 2, 1, c); dp(x + 7, t, 1, 7, shade(c, 0.78));
        text3(ch, x + 2, t + 1, c === "#ff4fa8" ? "#ffffff" : "#22202a");
      });
    };
    flags("HAPPY", 66); flags("NEW", 155); flags("YEAR", 231);
    for (const x of [148, 186]) { dp(x + 2, 0, 1, 12, "#d8dce8"); stamp(["..x..", ".xxx.", "xxxxx", ".xxx.", ".x.x."], { x: "#ffd84a" }, x, 12); }
    plank(5, 9, 23, 11, "#22202a", "#ffd84a"); text3(partyYear(), 9, 12, "#ffd84a");
    // a disco ball right of the sign
    dp(376, 0, 1, 5, "#8a8a96"); disc(376, 10, 4, "#c8ccd8");
    for (let y = 6; y <= 14; y++) for (let x = 372; x <= 380; x++) if (Math.hypot(x - 376, y - 10) <= 4.2 && (x % 2 === 0 || y % 2 === 0)) dp(x, y, 1, 1, (x + y) % 4 ? "#9aa0b8" : "#e8ecf8");
    dp(374, 8, 1, 1, "#ffffff");
    // tinsel along the band
    for (let x = 4; x <= 266; x++) { const y = swagY(x, 4, 44, 26, 2); dp(x, y, 1, 2, x % 2 ? "#ffd84a" : "#d8dce8"); if (x % 3 === 0) dp(x, y + 2, 1, 1, x % 2 ? "#c8961a" : "#9aa0b8"); }
    dp(374, 72, 7, 6, "#ffd84a"); dp(377, 72, 1, 6, "#ff4fa8"); // the weight for the balloons
    // confetti and party poppers along the wall
    for (let k = 0; k < 40; k++) dp(18 + Math.floor(rnd(k + 1000) * 204), 39 + Math.floor(rnd(k + 1100) * 8), 1, 1, ["#ff4fa8", "#4fd8ff", "#ffd84a", "#7fff6a", "#ffffff"][k % 5]);
    for (const x of [60, 180]) { dp(x, 42, 3, 5, "#ff4fa8"); dp(x + 1, 40, 2, 2, "#ffd84a"); dp(x + 3, 38, 1, 1, "#4fd8ff"); dp(x + 5, 37, 1, 1, "#ffd84a"); dp(x + 4, 40, 1, 1, "#7fff6a"); dp(x, 44, 3, 1, "#ffffff"); }
    // gold number balloons along the bottom wall, with confetti
    text3(partyYear(), 99, 239, "#c8961a", 3); text3(partyYear(), 98, 238, "#ffd84a", 3);
    for (let k = 0; k < 4; k++) dp(99 + k * 12, 239, 1, 2, "#fff6c0");
    for (let k = 0; k < 40; k++) dp(6 + Math.floor(rnd(k + 1200) * 228), 240 + Math.floor(rnd(k + 1300) * 14), rnd(k + 1400) > 0.5 ? 2 : 1, 1, ["#ff4fa8", "#4fd8ff", "#ffd84a", "#7fff6a", "#ffffff"][k % 5]);
    // a cooler with a bottle under the kitchen machine
    dp(370, 248, 12, 7, "#c8ccd8"); dp(370, 248, 12, 1, "#e8ecf4"); dp(380, 249, 2, 6, "#9aa0b8"); dp(371, 246, 2, 2, "#e8f8ff"); dp(378, 246, 2, 2, "#e8f8ff");
    dp(375, 243, 2, 5, "#2a5a3a"); dp(375, 242, 2, 2, "#ffd84a");
    // a cake with a sparkler candle on the snack table
    dp(345, 223, 18, 5, "#f8f0f8"); dp(345, 223, 18, 1, "#ffd84a"); dp(349, 219, 10, 4, "#fff6fa"); dp(349, 219, 10, 1, "#ffd84a");
    for (const x of [347, 352, 357, 361]) dp(x, 224, 1, 1, "#ff4fa8"); dp(353, 216, 1, 3, "#c8ccd8");
  },
  live(now) {
    WIN.forEach((gx, i) => inGlass(gx, () => firework(gx, i, now)));
    const t = now / 1000;
    [[372, 40, "#ffd84a"], [379, 37, "#d8dce8"], [375, 48, "#ff4fa8"], [381, 49, "#4fd8ff"]].forEach(([x, y, c], k) => balloon(x, y + Math.round(Math.sin(t * 1.3 + k * 1.7) * 1.5), c, 377, 72));
    const f = Math.floor(now / 250);
    dp(372 + (f % 4) * 2, 9 + (f % 2) * 2, 1, 1, "#ffffff");
    if (f % 6 === 0) { twinkle(368, 15, "#fff6c0"); twinkle(384, 6, "#fff6c0"); }
    for (let k = 0; k < 6; k++) if ((f + k * 3) % 8 === 0) twinkle(20 + k * 44, swagY(20 + k * 44, 4, 44, 26, 2) + 1, "#ffffff");
    twinkle(353, 215, f % 2 ? "#ffffff" : "#ffd84a");
    drift(now, 32, 1, (x, y, i, t2) => { const s = Math.floor(t2 * 4 + i) % 3; dp(x, y, s === 0 ? 2 : 1, s === 1 ? 2 : 1, ["#ff4fa8", "#4fd8ff", "#ffd84a", "#7fff6a", "#ffffff"][i % 5]); });
  },
  counter() {
    for (const x of [356, 361]) { dp(x, 37, 3, 5, "#ffe9a0"); dp(x, 37, 3, 1, "#fff6d8"); dp(x + 1, 42, 1, 3, "#d8e8f0"); dp(x, 45, 3, 1, "#d8e8f0"); dp(x + 1, 39, 1, 1, "#ffffff"); }
    dp(276, 41, 9, 2, "#ff4fa8"); dp(285, 40, 3, 4, "#ffd84a"); dp(276, 41, 2, 1, "#ffffff");
  },
};
