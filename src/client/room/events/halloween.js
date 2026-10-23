// halloween: the room for this event. Its still() is painted once into a layer and copied every frame; live(now)
// draws the moving bits.
import { H, TS, W } from "../canvas.js";
import { WIN, dc, disc, dp, drift, glow, inGlass, mullions, plank, pumpkin, rnd, stamp, swagLine, swagY, text3 } from "../art.js";

const BAT = [["x.......x", "xx.x.x.xx", ".xxxxxxx.", "...x.x..."], ["...x.x...", ".xxxxxxx.", "xx.....xx", "x.......x"]];
const MINIBAT = [["x.x.x", ".xxx."], [".....", "xxxxx"]];
function web(x, y, r, dir, c) {
  dc.globalAlpha = 0.6;
  for (let k = 0; k <= 4; k++) { const a = (k / 4) * (Math.PI / 2); for (let d = 0; d <= r; d++) dp(x + dir * Math.round(Math.cos(a) * d), y + Math.round(Math.sin(a) * d), 1, 1, c); }
  for (let rr = 3; rr <= r; rr += Math.max(3, Math.round(r / 3))) for (let a = 0; a <= Math.PI / 2; a += 0.6 / rr) dp(x + dir * Math.round(Math.cos(a) * rr * 0.9), y + Math.round(Math.sin(a) * rr * 0.9), 1, 1, c);
  dc.globalAlpha = 1;
}export default {
  still() {
    dc.globalAlpha = 0.12; dp(0, 32, W * TS, H * TS - 32, "#3a1a60"); dc.globalAlpha = 1; // a dusky floor
    const HTREE = ["k.......k...", ".k..k..k..k.", "..k.k.k..k..", "k..kkk..k...", ".k..kk.k....", "..kkkkk.....", "....kk..kk..", "....kkkk....", "....kok.....", "....kkk.....", "...kkkkk....", "..kk...kk..."];
    WIN.forEach((gx, i) => inGlass(gx, () => {
      dp(gx, 6, 28, 14, "#2a1f4a"); dp(gx, 14, 28, 4, "#3a2a5e");
      for (let s = 0; s < 7; s++) dp(gx + Math.floor(rnd(i * 9 + s) * 28), 6 + Math.floor(rnd(i * 7 + s + 40) * 7), 1, 1, "#fff6c0");
      if (i === 1) { glow(gx + 20, 10, 6, "#fff2b0", 0.18); disc(gx + 20, 10, 3.6, "#fff2b0"); dp(gx + 21, 11, 1, 1, "#e0d08a"); dp(gx + 19, 9, 1, 1, "#e0d08a"); }
      dp(gx, 18, 28, 2, "#1a1428");
      stamp(HTREE, { k: "#120c1c", o: "#ffb040" }, gx + (i === 1 ? 1 : 15), 7);
      if (i === 0) for (const tx of [gx + 3, gx + 8]) { dp(tx, 16, 3, 2, "#8a8a9a"); dp(tx + 1, 15, 1, 1, "#8a8a9a"); }
      if (i === 2) { dp(gx + 2, 13, 8, 5, "#120c1c"); dp(gx + 3, 12, 6, 1, "#120c1c"); dp(gx + 4, 11, 4, 1, "#120c1c"); dp(gx + 8, 9, 2, 4, "#120c1c"); dp(gx + 4, 14, 1, 1, "#ffd84a"); dp(gx + 7, 15, 1, 1, "#ffd84a"); }
      web(gx, 6, 5, 1, "#d8d8e8"); web(gx + 27, 6, 4, -1, "#d8d8e8");
    }));
    mullions();
    web(0, 0, 17, 1, "#e0e0ee"); // a big cobweb in the corner
    // a jack-o'-lantern hung between the first two windows, with paper bats
    dp(88, 0, 1, 5, "#3a2a4a"); glow(88, 11, 11, "#ffb040", 0.12); pumpkin(82, 6, 13, 10, "lit");
    stamp(BAT[0], { x: "#3a2a4a" }, 68, 6); stamp(BAT[1], { x: "#3a2a4a" }, 100, 17);
    // a BOO! board with a bat on top
    plank(156, 8, 25, 11, "#4a2a80", "#2a1840"); dp(157, 9, 23, 1, "#7448b8"); text3("BOO!", 161, 11, "#f08a2a");
    stamp(BAT[0], { x: "#22202a" }, 164, 3);
    // a paper ghost and two bats by the sign
    dp(248, 0, 1, 6, "#8a8a96");
    stamp(["..xxxxx..", ".xxxxxxx.", "xxxxxxxxx", "xxkxxxkxx", "xxkxxxkxx", "xxxxxxxxx", "xxxxkxxxx", "xxxxxxxxx", "xxxxxxxxx", "xx.xxx.xx", "x...x...x"], { x: "#f4f4fa", k: "#3a2a4a" }, 244, 6);
    stamp(BAT[1], { x: "#3a2a4a" }, 229, 12); stamp(BAT[0], { x: "#3a2a4a" }, 258, 6);
    dp(376, 0, 1, 3, "#8a8a96"); stamp([...BAT[0]].reverse(), { x: "#3a2a4a" }, 372, 3); // a bat hanging upside down
    swagLine(4, 266, 38, 26, 2, "#22202a"); // the wire for the lights
    // carved pumpkins along the wall, glowing
    for (const [x, w, h] of [[40, 9, 8], [118, 13, 10], [200, 9, 8]]) { glow(x + (w >> 1), 47 - (h >> 1), 12, "#ffb040", 0.12); pumpkin(x, 47 - h, w, h, "lit"); }
    pumpkin(51, 41, 6, 5, null); pumpkin(133, 41, 7, 6, null); pumpkin(211, 42, 6, 5, null);
    // a broom and a bubbling cauldron in the corner
    for (let k = 0; k < 22; k++) dp(382 - Math.round(k * 0.4), 33 + k, 1, 1, "#8a5a32");
    dp(371, 54, 7, 8, "#d8b050"); dp(372, 55, 1, 7, "#a88030"); dp(375, 55, 1, 7, "#a88030"); dp(371, 54, 7, 1, "#7448b8");
    glow(376, 63, 11, "#6ad04a", 0.12);
    dp(370, 66, 13, 9, "#2a2a34"); dp(369, 67, 15, 7, "#2a2a34"); dp(369, 64, 15, 2, "#4a4a58"); dp(370, 64, 13, 1, "#6ad04a"); dp(371, 67, 1, 4, "#4a4a58");
    dp(371, 75, 2, 3, "#1e1e26"); dp(380, 75, 2, 3, "#1e1e26");
    // a graveyard along the bottom wall
    for (const x of [22, 102, 182]) {
      dp(x + 2, 240, 9, 1, "#9a9aaa"); dp(x + 1, 241, 11, 1, "#9a9aaa"); dp(x, 242, 13, 12, "#9a9aaa"); dp(x + 11, 242, 2, 12, "#6a6a7a");
      text3("RIP", x + 1, 245, "#55556a"); dp(x - 2, 253, 17, 2, "#3a5a3a"); dp(x - 1, 252, 1, 1, "#3a5a3a"); dp(x + 14, 251, 1, 2, "#3a5a3a");
    }
    for (const x of [64, 146]) dp(x, 249, 2, 5, "#f4ecd8");
    pumpkin(216, 248, 7, 6, "dark");
    // a black cat under the kitchen machine (its eyes are drawn live)
    stamp(["x.....x....", "xx...xx....", "xxxxxxx....", "xxxxxxx....", "xxxxxxx....", ".xxxxx.....", ".xxxxxx....", "xxxxxxxx...", "xxxxxxxx.x.", "xxxxxxxx..x", "xxxxxxxx..x", ".xxxxxxxxx."], { x: "#1e1a26" }, 371, 243);
    // a bowl of candy on the snack table
    dp(344, 222, 20, 1, "#9a6ad8"); dp(345, 223, 18, 5, "#7448b8"); dp(346, 227, 16, 1, "#4a2a80");
    ["#ffd84a", "#e05a6a", "#4fbf6b", "#f08a2a", "#ffffff", "#4f8fe0"].forEach((c, k) => dp(346 + k * 3, 220 + (k % 2), 2, 2, c));
  },
  live(now) {
    for (let k = 0, x = 8; x <= 262; x += 8, k++) { const on = (Math.floor(now / 800) + k) % 3 !== 0; dp(x, swagY(x, 4, 38, 26, 2) + 1, 2, 2, on ? ["#ff8a20", "#b060ff", "#6ad04a"][k % 3] : "#3a2a4a"); }
    const sy = 11 + Math.round(Math.sin(now / 900) * 3); // a spider on its thread
    dp(22, 0, 1, sy, "#c8c8d8"); dp(21, sy, 3, 3, "#22202a"); dp(20, sy + 1, 5, 1, "#22202a"); dp(19, sy, 1, 1, "#22202a"); dp(25, sy, 1, 1, "#22202a"); dp(19, sy + 2, 1, 1, "#22202a"); dp(25, sy + 2, 1, 1, "#22202a");
    for (let k = 0; k < 3; k++) { const p = ((now + k * 700) % 2100) / 2100; dc.globalAlpha = 1 - p; dp(372 + k * 4, 63 - p * 9, 2, 2, "#8af06a"); }
    dc.globalAlpha = 1;
    dp(373, 76, 7, 2, Math.floor(now / 160) % 2 ? "#f08a2a" : "#ffd84a");
    const blink = now % 4200 < 180;
    if (!blink) { dp(372, 246, 1, 1, "#d8e840"); dp(376, 246, 1, 1, "#d8e840"); }
    for (const x of [64, 146]) { const f = Math.floor(now / 120 + x) % 3; dp(x + (f === 2 ? 1 : 0), 246 - (f === 1 ? 1 : 0), 1, 2, "#ffd84a"); dp(x, 247, 2, 1, "#ff8a20"); }
    WIN.forEach((gx, i) => inGlass(gx, () => {
      const t = now / 1000, bx = gx - 5 + ((t * 7 + i * 13) % 38), by = 8 + Math.round(Math.sin(t * 2 + i) * 2);
      stamp(MINIBAT[Math.floor(t * 6 + i) % 2], { x: "#0e0a16" }, bx, by);
    }));
    const t = now / 1000;
    for (let k = 0; k < 2; k++) { const x = ((t * 20 + k * 230) % 440) - 30, y = 58 + k * 34 + Math.round(Math.sin(t * 3 + k) * 4); stamp(BAT[Math.floor(t * 6 + k) % 2], { x: "#2a2034" }, x, y); }
    drift(now, 24, 1.5, (x, y, i, t2) => { const flip = Math.floor(t2 * 3 + i) % 2; dp(x, y, flip ? 2 : 1, flip ? 1 : 2, ["#e8802a", "#22202a", "#b8561a", "#f0a040"][i % 4]); });
  },
  counter(now) { glow(280, 41, 7, "#ffb040", 0.14 + (Math.floor(now / 200) % 2) * 0.04); pumpkin(276, 38, 9, 8, "lit"); },
};
