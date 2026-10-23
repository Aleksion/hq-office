// thanksgiving: the room for this event. Its still() is painted once into a layer and copied every frame;
// live(now) draws the moving bits.
import { WIN, dc, disc, dp, drift, inGlass, mullions, plank, pumpkin, rnd, swagLine, swagY, text3, windowTree } from "../art.js";

export default {
  still() {
    const GOLD = ["#f0c030", "#e0901e", "#c0501e", "#f8d860"];
    WIN.forEach((gx, i) => inGlass(gx, () => {
      dp(gx, 6, 28, 14, "#f8d088"); dp(gx, 6, 28, 3, "#f4b870");
      if (i === 1) disc(gx + 22, 15, 3, "#ffe8a8");
      for (let x = 0; x < 28; x++) { const top = 14 + Math.round(Math.sin((x + i * 28) / 6) * 1.5); dp(gx + x, top, 1, 20 - top, "#c8904a"); }
      dp(gx, 17, 28, 3, "#d8b050"); dp(gx, 18, 28, 1, "#b89038");
      if (i === 0) { dp(gx + 4, 13, 5, 1, "#e8c060"); dp(gx + 3, 14, 7, 1, "#e8c060"); dp(gx + 2, 15, 9, 3, "#e8c060"); dp(gx + 3, 16, 7, 1, "#c8a040"); }
      if (i === 1) for (const [bx, by] of [[gx + 17, 9], [gx + 23, 8]]) { dp(bx, by, 1, 1, "#6a4a2a"); dp(bx + 1, by + 1, 1, 1, "#6a4a2a"); dp(bx + 2, by, 1, 1, "#6a4a2a"); }
      if (i === 2) { dp(gx + 2, 12, 9, 6, "#c0402a"); dp(gx + 3, 11, 7, 1, "#8a2a1e"); dp(gx + 4, 10, 5, 1, "#8a2a1e"); dp(gx + 5, 9, 3, 1, "#8a2a1e"); dp(gx + 5, 14, 3, 4, "#f8e8c0"); dp(gx + 6, 15, 1, 2, "#c0402a"); }
      windowTree(gx + (i === 1 ? 1 : 16), GOLD, "#6a4a2a");
    }));
    mullions();
    // a garland of autumn leaves along the wall band
    swagLine(4, 266, 44, 26, 3, "#6a5a2a");
    for (let k = 0, x = 6; x <= 264; x += 6, k++) { const y = swagY(x, 4, 44, 26, 3); const c = GOLD[k % 4]; dp(x, y, 2, 2, c); dp(x + 2, y + 1, 1, 1, c); if (k % 5 === 2) { dp(x + 3, y + 2, 2, 2, "#8a5a2a"); dp(x + 3, y + 1, 2, 1, "#5a3a1e"); } }
    // a framed turkey
    dp(5, 5, 22, 18, "#7a5232"); dp(7, 7, 18, 14, "#f8e8c0");
    for (let y = 9; y <= 16; y++) for (let x = 9; x <= 23; x++) { const d = Math.hypot(x - 16, (y - 16) * 1.1); if (d <= 7) dp(x, y, 1, 1, d > 5.5 ? "#f0c030" : Math.floor(Math.atan2(16 - y, x - 16) * 3) % 2 ? "#e0901e" : "#c0501e"); }
    disc(16, 16, 3, "#8a5a32"); disc(16, 12, 1.5, "#b07a4a"); dp(17, 12, 1, 1, "#ffd84a"); dp(17, 13, 1, 1, "#c0402a"); dp(15, 11, 1, 1, "#22202a");
    dp(15, 19, 1, 2, "#e8a040"); dp(17, 19, 1, 2, "#e8a040");
    // a harvest wreath with an orange bow
    for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > 7.5 || d < 3.8) continue;
      const h = (dx * 3 + dy * 5 + 60) % 9;
      dp(88 + dx, 13 + dy, 1, 1, h === 0 ? "#c0402a" : h < 3 ? "#e8c870" : h < 5 ? "#f0c030" : h < 7 ? "#e0901e" : h < 8 ? "#c0501e" : "#7a5232");
    }
    dp(84, 19, 3, 3, "#e8802a"); dp(89, 19, 3, 3, "#e8802a"); dp(87, 20, 2, 2, "#b8561a"); dp(86, 22, 1, 3, "#e8802a"); dp(89, 22, 1, 3, "#e8802a");
    // GIVE THANKS
    plank(155, 4, 27, 17, "#9a6a3a", "#5a3a1e"); dp(156, 5, 25, 1, "#b8864a");
    text3("GIVE", 161, 7, "#f8e8c0"); text3("THANKS", 157, 14, "#f8e8c0");
    // dried corn on a nail
    dp(248, 2, 1, 1, "#4a4a58");
    for (const [cx, dirx] of [[243, -1], [248, 0], [253, 1]]) {
      for (let k = 0; k < 6; k++) dp(248 + Math.round(((cx - 248) * k) / 6) + (k > 3 ? dirx : 0), 3 + k, 1, 1, "#e8d8a8");
      for (let y = 9; y < 20; y++) for (let x = cx - 1; x <= cx + 1; x++) if (!(y === 19 && x !== cx)) dp(x, y, 1, 1, ["#f0c030", "#c0402a", "#7a4a8a", "#e8802a", "#f8d860"][Math.floor(rnd(x * 31 + y) * 5)]);
    }
    dp(246, 4, 5, 1, "#8a5a2a");
    // a sheaf of wheat right of the sign
    for (let k = 0; k < 5; k++) { dp(374 + k, 6, 1, 12, "#d8b050"); dp(374 + k, 3 + (k % 2), 1, 3, "#e8c870"); }
    dp(373, 11, 7, 1, "#8a5a2a");
    // the corner: corn stalks, a hay bale, two pumpkins
    for (let k = 0; k < 6; k++) { const x = 371 + k * 2; dp(x, 34 + (k % 2) * 2, 1, 30, k % 2 ? "#a89040" : "#c8b060"); dp(x + (k % 2 ? -1 : 1), 42 + k * 3, 1, 2, "#8a9a3a"); }
    dp(370, 52, 13, 2, "#8a5a2a");
    dp(369, 66, 15, 12, "#e8c060"); dp(369, 66, 15, 1, "#f8d880"); dp(369, 70, 15, 1, "#c8a040"); dp(369, 74, 15, 1, "#c8a040"); dp(372, 66, 1, 12, "#8a5a2a"); dp(380, 66, 1, 12, "#8a5a2a");
    pumpkin(370, 60, 7, 6, null); pumpkin(377, 61, 6, 5, null);
    // along the wall: apples in a basket, pumpkins, gourds
    dp(42, 41, 11, 6, "#a8743a"); dp(42, 43, 11, 1, "#7a5232"); dp(42, 45, 11, 1, "#7a5232");
    for (const [x, y] of [[43, 38], [47, 37], [50, 38]]) { dp(x, y, 3, 3, "#d63c3c"); dp(x, y, 1, 1, "#ff8a8a"); }
    pumpkin(118, 39, 9, 8, null); pumpkin(128, 41, 7, 6, null); pumpkin(246, 40, 8, 7, null);
    dp(200, 42, 5, 4, "#f0d040"); dp(203, 39, 2, 3, "#f0d040"); dp(204, 38, 1, 1, "#8a9a3a");
    dp(207, 42, 6, 4, "#6a8a3a"); dp(208, 42, 1, 4, "#b8c870"); dp(211, 42, 1, 4, "#b8c870");
    // leaf piles and acorns along the bottom wall
    for (const x0 of [26, 108, 190]) [8, 12, 16, 18, 20].forEach((w, r) => { for (let x = 0; x < w; x++) dp(x0 + 10 - (w >> 1) + x, 246 + r, 1, 1, GOLD[Math.floor(rnd(x0 + x * 7 + r * 13) * 4)]); });
    for (const [x, y] of [[62, 252], [152, 251], [232, 252]]) { dp(x, y, 2, 2, "#8a5a2a"); dp(x, y - 1, 2, 1, "#5a3a1e"); }
    pumpkin(370, 247, 8, 7, null); pumpkin(378, 249, 5, 5, null);
    // pumpkin pie on the snack table
    dp(345, 226, 18, 2, "#a8a8b4"); dp(346, 222, 16, 4, "#e0a860"); dp(345, 222, 18, 1, "#f0c080");
    for (const x of [349, 353, 357]) dp(x, 223, 1, 3, "#b87838");
    dp(346, 224, 16, 1, "#b87838");
  },
  live(now) {
    for (let k = 0; k < 3; k++) { const p = ((now + k * 600) % 1800) / 1800; dc.globalAlpha = 0.7 * (1 - p); dp(349 + k * 4 + Math.round(Math.sin(p * 6 + k)), 219 - p * 8, 1, 2, "#ffffff"); }
    dc.globalAlpha = 1;
    const C = ["#f0c030", "#e0901e", "#c0501e", "#8a5a32"];
    drift(now, 26, 1.3, (x, y, i, t) => { const f = Math.floor(t * 2.5 + i) % 3; if (f === 0) dp(x, y, 2, 2, C[i % 4]); else dp(x, y, f === 1 ? 3 : 1, f === 1 ? 1 : 3, C[i % 4]); }, { wind: 0.6 });
  },
  counter() {
    for (let x = 0; x < 12; x++) { const h = Math.round(0.4 + x * 0.33); for (let y = -h; y <= h; y++) dp(274 + x, 42 + y - Math.round(x * 0.1), 1, 1, (x + y) % 3 === 0 ? "#8a5a2a" : "#c8904e"); }
    dp(273, 39, 1, 3, "#c8904e"); dp(274, 38, 1, 1, "#c8904e");
    dp(286, 38, 1, 7, "#5a3a1e");
    disc(289, 42, 1.5, "#d63c3c"); dp(287, 38, 2, 2, "#7a4a8a"); dp(289, 39, 1, 1, "#9a6aaa"); pumpkin(290, 41, 5, 4, null); dp(292, 38, 2, 3, "#9ac84a");
  },
};
