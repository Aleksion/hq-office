// easter: the room for this event. Its still() is painted once into a layer and copied every frame; live(now)
// draws the moving bits.
import { WIN, bunting, disc, dp, drift, inGlass, mullions, stamp, swagLine, swagY, windowTree } from "../art.js";

// An egg rx by ry around cx, cy, a little wider at the bottom; fill(dx, dy, edge) colours it.
function eggArt(cx, cy, rx, ry, fill) {
  const ins = (x, y) => { const Y = (y - cy) / ry; return Math.abs(Y) <= 1 && Math.abs(x - cx) <= rx * Math.sqrt(1 - Y * Y) * (1 + 0.15 * Y); };
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
    if (!ins(x, y)) continue;
    const c = fill(x - cx, y - cy, !ins(x - 1, y) || !ins(x + 1, y) || !ins(x, y - 1) || !ins(x, y + 1));
    if (c) dp(x, y, 1, 1, c);
  }
}
function smallEgg(x, y, c) { dp(x + 1, y, 1, 1, c); dp(x, y + 1, 3, 2, c); dp(x + 1, y + 3, 1, 1, c); dp(x, y + 2, 3, 1, "#ffffff"); }export default {
  still() {
    const PASTEL = ["#ffb8d0", "#fff0a0", "#a8d0ff", "#b0f0c8", "#d0b8ff"];
    const BUN = ["..x.x..", "..x.x..", ".xxxx..", "xkxxxx.", ".xxxxxx", "..xxxxx"];
    WIN.forEach((gx, i) => inGlass(gx, () => {
      dp(gx, 6, 28, 14, "#cfeaff"); dp(gx, 6, 28, 3, "#e4f4ff");
      dp(gx + 3 + i * 4, 8, 6, 2, "#ffffff"); dp(gx + 4 + i * 4, 7, 4, 1, "#ffffff");
      if (i !== 1) windowTree(gx + 16, ["#f7a8c8", "#ffffff", "#a6dc78", "#ffd0e0"]);
      dp(gx, 16, 28, 4, "#9edc7a"); dp(gx, 18, 28, 2, "#7cc85a");
      for (let k = 0; k < 5; k++) { const x = gx + 2 + k * 5 + (i % 2); dp(x, 17, 1, 2, "#3f9e4f"); dp(x, 15, 2, 2, ["#ff6f8f", "#ffd84a", "#ffb0c8", "#b090f0"][(k + i) % 4]); }
      if (i === 0) stamp(BUN, { x: "#ffffff", k: "#22202a" }, gx + 4, 11);
      if (i === 2) stamp(BUN, { x: "#b08860", k: "#22202a" }, gx + 3, 11);
      if (i === 1) { smallEgg(gx + 10, 15, "#ffb0c8"); windowTree(gx + 1, ["#f7a8c8", "#ffffff", "#a6dc78"]); }
    }));
    mullions();
    bunting(2, 268, PASTEL);
    bunting(370, 383, PASTEL);
    // a string of painted eggs on the band
    swagLine(4, 266, 38, 25, 2, "#c8a0d8");
    for (let k = 0, x = 7; x <= 262; x += 8, k++) smallEgg(x, swagY(x + 1, 4, 38, 25, 2) + 1, PASTEL[k % 5]);
    // a hanging egg, a big painted egg, a bunny plaque, a flower wreath
    dp(16, 4, 1, 4, "#c8a0d8");
    eggArt(16, 14, 4, 6, (dx, dy, e) => (e ? "#7ab0e0" : dy === -2 || dy === 2 ? "#ffffff" : dy === 0 ? "#ffb8d0" : "#a8d0ff"));
    eggArt(88, 15, 5.5, 7.5, (dx, dy, e) => { if (e) return "#9a80d0"; if (Math.abs(dy - (Math.abs(dx) % 3 === 1 ? -1 : 0)) < 1) return "#ffd84a"; if (dy === -4 && (dx + 9) % 3 === 0) return "#ff8fb8"; if (dy === 4) return "#b0f0c8"; return "#d0b8ff"; });
    disc(168, 15, 7, "#f0d070"); disc(168, 15, 6, "#fff0a0"); disc(168, 15, 5, "#b0f0c8");
    dp(164, 7, 3, 7, "#ffffff"); dp(170, 7, 3, 7, "#ffffff"); dp(165, 8, 1, 5, "#ffb0c8"); dp(171, 8, 1, 5, "#ffb0c8");
    disc(168, 17, 3.2, "#ffffff"); dp(166, 16, 1, 1, "#22202a"); dp(170, 16, 1, 1, "#22202a"); dp(168, 18, 1, 1, "#ff8fb8");
    for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) { const d = Math.hypot(dx, dy); if (d <= 7 && d >= 4.4) dp(248 + dx, 15 + dy, 1, 1, (dx + dy) % 2 ? "#7cc85a" : "#5fae4a"); }
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, x = 248 + Math.round(Math.cos(a) * 5.7), y = 15 + Math.round(Math.sin(a) * 5.7); dp(x - 1, y, 3, 1, PASTEL[k % 5]); dp(x, y - 1, 1, 3, PASTEL[k % 5]); dp(x, y, 1, 1, "#ffd84a"); }
    dp(244, 21, 3, 3, "#ff8fb8"); dp(250, 21, 3, 3, "#ff8fb8"); dp(247, 22, 3, 2, "#e06a98");
    dp(375, 9, 3, 3, "#ffb8d0"); dp(376, 8, 1, 5, "#ffb8d0"); dp(374, 10, 5, 1, "#ffb8d0"); dp(376, 10, 1, 1, "#ffd84a"); dp(376, 13, 1, 4, "#3f9e4f");
    // a big plush bunny in the corner, outlined so it stands off the floor
    const fur = "#f8f8f8", line = "#8a8aa0";
    dp(371, 39, 5, 15, line); dp(377, 40, 5, 14, line); disc(376, 57, 5.5, line); disc(376, 70, 7, line); dp(369, 75, 6, 4, line); dp(378, 75, 6, 4, line);
    dp(372, 40, 3, 13, fur); dp(378, 41, 3, 12, fur); dp(373, 42, 1, 9, "#ffb0c8"); dp(379, 43, 1, 8, "#ffb0c8");
    disc(376, 70, 6, fur); dp(380, 66, 2, 8, "#dcdcea"); disc(376, 57, 4.5, fur);
    dp(374, 56, 1, 1, "#22202a"); dp(378, 56, 1, 1, "#22202a"); dp(376, 58, 1, 1, "#ff8fb8"); dp(373, 58, 1, 1, "#ffd0e0"); dp(379, 58, 1, 1, "#ffd0e0");
    dp(373, 62, 7, 2, "#a8d0ff"); dp(375, 61, 3, 1, "#a8d0ff"); dp(370, 76, 4, 2, fur); dp(379, 76, 4, 2, fur);
    // eggs hidden in grass along the wall
    [30, 62, 98, 140, 172, 210].forEach((x, k) => { smallEgg(x, 41, PASTEL[k % 5]); dp(x - 2, 45, 7, 2, "#7cc85a"); dp(x - 2, 43, 1, 2, "#7cc85a"); dp(x + 3, 42, 1, 3, "#5fae4a"); });
    // tulip planters along the bottom wall
    for (const x of [26, 108, 190]) {
      dp(x, 248, 20, 6, "#b8864a"); dp(x, 250, 20, 1, "#9a6a3a"); dp(x + 1, 247, 18, 1, "#6a4a2a");
      for (let k = 0; k < 5; k++) { dp(x + 2 + k * 4, 241, 1, 6, "#3f9e4f"); dp(x + 1 + k * 4, 238, 3, 3, ["#ff6f8f", "#ffd84a", "#ffb0c8", "#b090f0", "#ff9a5a"][k]); dp(x + 2 + k * 4, 238, 1, 1, "#ffffff"); }
      dp(x + 4, 243, 1, 2, "#5fae4a"); dp(x + 13, 243, 1, 2, "#5fae4a");
    }
    // a nest with a chick under the kitchen machine
    dp(369, 250, 14, 4, "#a8743a"); dp(370, 251, 12, 1, "#7a5232"); smallEgg(370, 246, "#a8d0ff"); smallEgg(379, 246, "#ffb0c8");
    dp(373, 246, 5, 4, "#ffe060"); disc(375, 245, 1.6, "#ffe060"); dp(377, 245, 1, 1, "#f08a2a"); dp(376, 244, 1, 1, "#22202a");
    // a basket of eggs on the snack table
    for (let k = 0; k <= 16; k++) { const x = 345 + k, y = 222 - Math.round(Math.sin((k / 16) * Math.PI) * 7); dp(x, y, 1, 1, "#9a6a3a"); }
    dp(344, 222, 19, 1, "#9a6a3a"); dp(345, 223, 17, 5, "#c8904e"); for (let x = 346; x < 362; x += 2) { dp(x, 224, 1, 1, "#8a5a2a"); dp(x + 1, 226, 1, 1, "#8a5a2a"); }
    [347, 351, 355, 359].forEach((x, k) => smallEgg(x, 219, PASTEL[(k + 1) % 5]));
    dp(346, 222, 15, 1, "#7fd06a");
  },
  live(now) {
    const t = now / 1000, hop = Math.abs(Math.sin(t * 3)) * 3;
    inGlass(WIN[1], () => stamp(["..x.x..", "..x.x..", ".xxxx..", "xkxxxx.", ".xxxxxx", "..xxxxx"], { x: "#ffffff", k: "#22202a" }, WIN[1] + 17 + Math.round(Math.sin(t * 0.7) * 3), 11 - Math.round(hop)));
    for (let k = 0; k < 2; k++) {
      const x = ((t * 16 + k * 210) % 420) - 20, y = 70 + k * 60 + Math.round(Math.sin(t * 2 + k) * 6), up = Math.floor(t * 8 + k) % 2;
      const c = k ? "#ffd84a" : "#d0b8ff";
      dp(x + 2, y, 1, 3, "#5a4a4a"); dp(x, y - (up ? 1 : 0), 2, 2, c); dp(x + 3, y - (up ? 1 : 0), 2, 2, c);
    }
    drift(now, 24, 0.9, (x, y, i, t2) => dp(x, y, Math.floor(t2 * 2 + i) % 2 ? 2 : 1, 1, ["#ffb8d0", "#ffffff", "#fff0a0", "#f7a8c8"][i % 4]), { wind: 0.3 });
  },
  counter() { dp(277, 42, 7, 4, "#fff8f0"); for (let k = 0; k < 7; k += 2) dp(277 + k, 41, 1, 1, "#fff8f0"); disc(280, 39, 2, "#ffe060"); dp(281, 38, 1, 1, "#22202a"); dp(282, 39, 1, 1, "#f08a2a"); },
};
