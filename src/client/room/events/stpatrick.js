// stpatrick: the room for this event. Its still() is painted once into a layer and copied every frame; live(now)
// draws the moving bits.
import { WIN, bunting, dc, disc, dp, drift, inGlass, mullions, plank, rnd, swagLine, swagY, text3, twinkle, windowTree } from "../art.js";

function shamrock(cx, cy, r, c, vein) {
  const d = r + 0.6;
  for (const a of [-Math.PI / 2, (Math.PI * 5) / 6, Math.PI / 6]) disc(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d), r, c);
  for (let k = 0; k <= r + 2; k++) dp(cx + (k > r + 1 ? 1 : 0), cy + k, 1, 1, vein ?? c);
}export default {
  still() {
    WIN.forEach((gx, i) => inGlass(gx, () => {
      dp(gx, 6, 28, 14, "#cfeecf"); dp(gx, 6, 28, 3, "#e2f6e2");
      if (i === 1) for (let y = 6; y < 20; y++) for (let x = 0; x < 28; x++) { const d = Math.hypot(x - 14, (y - 21) * 1.1); const b = Math.floor(13 - d); if (b >= 0 && b < 6) dp(gx + x, y, 1, 1, ["#e05a4f", "#f0a040", "#ffd84a", "#4fbf6b", "#4f8fe0", "#9a6ad8"][b]); }
      for (let x = 0; x < 28; x++) { const top = 15 + Math.round(Math.sin((x + i * 28) / 5) * 1.5); dp(gx + x, top, 1, 20 - top, "#7ac86a"); }
      for (let x = 0; x < 28; x++) { const top = 17 + Math.round(Math.sin((x + i * 28) / 4 + 2)); dp(gx + x, top, 1, 20 - top, "#3fae4f"); if ((x + i) % 5 === 0) dp(gx + x, top + 1, 1, 1, "#8fe08a"); }
      if (i === 0) { for (let k = 0; k < 4; k++) dp(gx + 1 + k * 3, 16, 2, 1, "#a8b0a8"); windowTree(gx + 16, ["#4fbf5b", "#2f9a3e", "#8fe08a"]); }
      if (i === 1) { dp(gx + 24, 17, 3, 2, "#22202a"); dp(gx + 24, 16, 3, 1, "#ffd84a"); }
      if (i === 2) { dp(gx + 3, 13, 7, 5, "#f4f0e0"); dp(gx + 2, 11, 9, 2, "#c8a050"); dp(gx + 6, 15, 1, 3, "#3fae4f"); dp(gx + 4, 14, 1, 1, "#4f8fe0"); windowTree(gx + 16, ["#4fbf5b", "#2f9a3e", "#8fe08a"]); }
      dc.globalAlpha = 0.12; dp(gx, 6, 28, 14, "#3fae4f"); dc.globalAlpha = 1;
    }));
    mullions();
    bunting(2, 268, ["#3fae4f", "#8fe08a", "#ffd84a", "#227a36"]);
    bunting(370, 383, ["#3fae4f", "#ffd84a"]);
    // a string of gold coins on the wall band
    swagLine(4, 266, 38, 26, 2, "#c8961a");
    for (let x = 7; x <= 262; x += 8) { const y = swagY(x + 1, 4, 38, 26, 2) + 1; dp(x, y, 3, 3, "#ffd84a"); dp(x, y, 1, 1, "#fff0a0"); dp(x + 2, y + 2, 1, 1, "#c8961a"); }
    // a lucky horseshoe, open end up
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) { const d = Math.hypot(dx, dy); if ((dy >= 0 && d >= 3.4 && d <= 5.6) || (dy < 0 && dy >= -5 && Math.abs(dx) >= 4 && Math.abs(dx) <= 5)) dp(16 + dx, 14 + dy, 1, 1, dx > 2 ? "#c8961a" : "#ffd84a"); }
    for (const [x, y] of [[11, 12], [21, 12], [12, 17], [20, 17], [16, 19]]) dp(x, y, 1, 1, "#8a6a1a");
    // a big shamrock
    shamrock(88, 15, 3, "#3fae4f", "#227a36"); dp(86, 9, 1, 2, "#8fe08a"); dp(82, 15, 1, 2, "#8fe08a"); dp(89, 16, 1, 2, "#8fe08a");
    // LUCKY
    plank(155, 10, 27, 11, "#227a36", "#14502a"); text3("LUCKY", 159, 13, "#ffd84a");
    // a cardboard rainbow with clouds
    for (let dy = -9; dy <= 0; dy++) for (let dx = -10; dx <= 10; dx++) { const d = Math.hypot(dx, dy); const b = Math.floor(9.5 - d); if (b >= 0 && b < 5) dp(248 + dx, 21 + dy, 1, 1, ["#e05a4f", "#f0a040", "#ffd84a", "#4fbf6b", "#4f8fe0"][b]); }
    for (const cx of [239, 257]) { disc(cx, 20, 2, "#ffffff"); disc(cx + 2, 21, 1.6, "#ffffff"); dp(cx - 2, 22, 6, 1, "#d4dce8"); }
    shamrock(376, 12, 1.5, "#3fae4f", "#227a36");
    // potted shamrocks along the wall
    for (const x of [44, 124, 204]) { dp(x - 3, 41, 7, 6, "#c0603a"); dp(x - 4, 40, 9, 1, "#d8784a"); shamrock(x - 2, 35, 1, "#3fae4f"); shamrock(x + 2, 34, 1, "#4fbf5b"); shamrock(x, 32, 1, "#2f9a3e"); }
    // a barrel with a shamrock bush on top, in the corner
    dp(370, 62, 12, 15, "#9a6a3a"); dp(369, 64, 14, 11, "#9a6a3a"); for (const x of [373, 376, 379]) dp(x, 62, 1, 15, "#7a4a2a");
    dp(369, 65, 14, 1, "#4a4a58"); dp(369, 73, 14, 1, "#4a4a58"); dp(371, 61, 10, 1, "#b8864a"); shamrock(375, 67, 1, "#3fae4f");
    dp(373, 55, 7, 6, "#c0603a"); dp(372, 54, 9, 1, "#d8784a");
    for (const [x, y, c] of [[373, 47, "#3fae4f"], [379, 45, "#4fbf5b"], [376, 41, "#2f9a3e"], [374, 51, "#4fbf5b"], [379, 50, "#3fae4f"]]) shamrock(x, y, 1, c);
    // clover and gold coins along the bottom wall
    for (let k = 0; k < 14; k++) shamrock(12 + Math.floor(rnd(k + 600) * 216), 244 + Math.floor(rnd(k + 700) * 7), 1, ["#3fae4f", "#4fbf5b", "#2f9a3e"][k % 3]);
    for (let k = 0; k < 10; k++) { const x = 10 + Math.floor(rnd(k + 800) * 220), y = 248 + Math.floor(rnd(k + 900) * 6); dp(x, y, 2, 2, "#ffd84a"); dp(x, y, 1, 1, "#fff0a0"); }
    // the pot of gold by the snack table
    dp(370, 247, 12, 7, "#2a2a34"); dp(369, 248, 14, 5, "#2a2a34"); dp(369, 245, 14, 2, "#4a4a58"); dp(371, 254, 2, 1, "#1e1e26"); dp(379, 254, 2, 1, "#1e1e26");
    dp(370, 243, 12, 2, "#ffd84a"); dp(372, 241, 8, 2, "#ffd84a"); dp(374, 240, 4, 1, "#ffd84a");
    for (const [x, y] of [[371, 243], [375, 241], [379, 243], [376, 240]]) dp(x, y, 1, 1, "#fff0a0");
    for (const [x, y] of [[365, 253], [367, 251], [384 - 2, 252]]) { dp(x, y, 2, 1, "#ffd84a"); }
    // a green-iced cake on the snack table, coins on the counter
    dp(345, 222, 18, 6, "#f8e8c0"); dp(345, 221, 18, 2, "#5fd06a"); for (const x of [347, 351, 356, 360]) dp(x, 223, 1, 1, "#5fd06a");
    shamrock(354, 218, 1, "#227a36");
  },
  live(now) {
    for (const [x, y, k] of [[372, 242, 0], [379, 241, 1], [375, 240, 2]]) if ((Math.floor(now / 300) + k * 2) % 5 === 0) twinkle(x, y, "#ffffff");
    drift(now, 18, 0.9, (x, y, i) => { const c = i % 2 ? "#3fae4f" : "#8fe08a"; dp(x + 1, y, 1, 1, c); dp(x, y + 1, 3, 1, c); dp(x + 1, y + 2, 1, 1, i % 2 ? "#227a36" : "#3fae4f"); dp(x, y, 1, 1, c); dp(x + 2, y, 1, 1, c); });
    for (let k = 0; k < 6; k++) if ((Math.floor(now / 350) + k * 5) % 9 === 0) twinkle(20 + ((k * 61) % 220), 60 + ((k * 37) % 150), "#ffd84a");
  },
  counter() { [[276, 6], [281, 4], [286, 3]].forEach(([x, n]) => { for (let k = 0; k < n; k++) dp(x, 45 - k, 4, 1, k % 2 ? "#c8961a" : "#ffd84a"); }); },
};
