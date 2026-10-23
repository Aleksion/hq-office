// christmas: the room for this event. Its still() is painted once into a layer and copied every frame; live(now)
// draws the moving bits.
import { H, TS, W } from "../canvas.js";
import { shade } from "../palette.js";
import { HEART5, WIN, dc, disc, dp, drift, glow, inGlass, mullions, plank, rnd, stamp, swagLine, swagY, text3, twinkle } from "../art.js";

// A nisse: a red cap pulled down over the eyes, a nose, a big white beard, a grey coat.
const NISSE = ["...k...", "..krk..", "..krRk.", ".krrRk.", ".krrrRk", "krrrrRk", "kssPssk", "kwwwwwk", "kgwwwgk", "kggwggk", ".kk.kk."];
const NISSE_PAL = { k: "#22202a", r: "#d63c3c", R: "#9a2626", s: "#f0c49c", P: "#e0786a", w: "#f8f8f8", g: "#7a8aa0" };
const nisse = (x, y) => stamp(NISSE, NISSE_PAL, x, y);
// A woven paper heart (julehjerte): plain lobes, one of each colour, and the checked weave below, on a paper loop.
const HJERTE = ["..eee.eee..", ".eaaaebbbe.", "eaaaaebbbbe", "eaaaaxbbbbe", "eaaxxxxxbbe", ".exxxxxxxe.", "..exxxxxe..", "...exxxe...", "....exe....", ".....e....."];
function julehjerte(x, y, a, b, edge) {
  dp(x + 2, y - 1, 1, 1, edge); dp(x + 3, y - 2, 5, 1, edge); dp(x + 8, y - 1, 1, 1, edge); // the paper loop
  for (let r = 0; r < HJERTE.length; r++) for (let c = 0; c < 11; c++) {
    const ch = HJERTE[r][c];
    if (ch !== ".") dp(x + c, y + r, 1, 1, ch === "e" ? edge : ch === "a" ? a : ch === "b" ? b : (Math.floor((c + r) / 2) + Math.floor((c - r + 20) / 2)) % 2 ? a : b);
  }
}
const MINIHEART = ["x.x", "xxx", ".x."];
const STAR5 = ["..x..", ".xxx.", "xxxxx", ".xxx.", ".x.x."];
// The calendar's door numbers in grid order, six across and four down, shuffled like a real one.
const DOORS = [7, 19, 2, 14, 23, 10, 5, 17, 12, 1, 21, 8, 15, 3, 24, 11, 6, 20, 9, 16, 4, 22, 13, 18];
const DOOR_C = ["#f4ead8", "#e8c060", "#d63c3c", "#3f8e46"];
// Days of December gone, up to 24. A preview outside December opens two doors.
const xmasDay = (d = new Date()) => (d.getMonth() === 11 ? Math.min(24, d.getDate()) : 2);
// Advent Sundays reached: the fourth is the last Sunday on or before the 24th. A preview lights them in turn.
function adventLit(now, d = new Date()) {
  if (d.getMonth() !== 11) return (Math.floor(now / 2500) % 4) + 1;
  const fourth = 24 - new Date(d.getFullYear(), 11, 24).getDay();
  let n = 0;
  for (let k = 3; k >= 0; k--) if (d.getDate() >= fourth - k * 7) n++;
  return Math.max(1, n);
}
const ADVENT = [[80, 21], [85, 18], [91, 18], [96, 21]]; // candle feet on the wreath, in lighting order
// The tree in the top-right corner, bottom tier first: top row, bottom row, half-width at each.
const TREE_X = 375, TIERS = [[54, 70, 5, 9], [41, 58, 4, 8], [29, 45, 3, 7], [19, 32, 2, 5], [12, 22, 1, 3]];
const TREE_CANDLES = [[371, 29], [379, 29], [369, 42], [381, 42], [368, 55], [382, 55], [367, 67], [383, 67], [376, 36], [373, 49], [378, 61]];
const XMAS_BULBS = Array.from({ length: 33 }, (_, k) => 8 + k * 8);
function cottage(x, base, w, h, wall) {
  dp(x, base - h, w, h, wall);
  for (let r = 0; r < Math.ceil(w / 2) + 1; r++) dp(x - 1 + r, base - h - 1 - r, w + 2 - 2 * r, 1, r === 0 ? "#c8d4e4" : "#f4f8fc");
  for (let k = 1; k < w - 1; k += 3) dp(x + k, base - h + 1, 1, 1, "#ffd860");
}
function snowFir(x, base, h) {
  for (let r = 0; r < h; r++) { const w = Math.floor(r * 0.6); dp(x - w, base - h + r, 2 * w + 1, 1, r % 3 === 1 ? "#e8f0f8" : "#2a5a3a"); }
}
function danishFlag(x, y, w, h) { // a Dannebrog, the cross set towards the hoist
  const v = Math.round(w * 0.3), t = Math.max(1, Math.round(h / 5)), hy = Math.round((h - t) / 2);
  for (let c = 0; c < w; c++) {
    const dark = Math.sin((c + 1) / 3.2) < -0.4;
    for (let r = 0; r < h; r++) {
      const cross = (c >= v && c < v + t) || (r >= hy && r < hy + t);
      dp(x + c, y + r, 1, 1, cross ? (dark ? "#d8dce4" : "#f8f8f8") : dark ? "#a00c24" : "#c8102e");
    }
  }
}
const TINYFLAG = ["rwrr", "wwww", "rwrr"]; // a flag for the tree's garland of little flags
const JULEBUK = ["........k.k.", "........kxk.", "........xxxx", ".........xx.", "x.xxxxxxxx..", ".xxrxxxxrx..", "..xrxxxxrx..", "..x.x..x.x..", "..x.x..x.x..", ".kk.kk.kk.kk"];export default {
  still() {
    dc.globalAlpha = 0.05; dp(0, 32, W * TS, H * TS - 32, "#ffb060"); dc.globalAlpha = 1; // a warm, candlelit floor
    // snowy night views: stars, a moon, hills, little houses with lit windows, a white church
    WIN.forEach((gx, i) => inGlass(gx, () => {
      dp(gx, 6, 28, 14, "#1a2446"); dp(gx, 12, 28, 8, "#22305a");
      for (let s = 0; s < 6; s++) dp(gx + Math.floor(rnd(i * 11 + s + 70) * 28), 6 + Math.floor(rnd(i * 13 + s + 90) * 6), 1, 1, "#fff6d8");
      if (i === 2) { glow(gx + 22, 9, 5, "#fff2c0", 0.15); disc(gx + 22, 9, 2, "#fff2c0"); dp(gx + 23, 8, 1, 1, "#e0d49a"); }
      for (let x = 0; x < 28; x++) { const top = 16 + Math.round(Math.sin((x + i * 28) / 6) * 1.2); dp(gx + x, top, 1, 20 - top, "#e8eef8"); if ((x + i) % 6 === 0) dp(gx + x, top, 1, 1, "#ffffff"); }
      if (i === 0) { cottage(gx + 2, 18, 7, 4, "#a8382a"); snowFir(gx + 11, 18, 6); cottage(gx + 17, 18, 6, 3, "#d8a040"); snowFir(gx + 25, 18, 5); }
      if (i === 1) {
        dp(gx + 3, 9, 4, 9, "#f0ece4"); dp(gx + 3, 8, 1, 1, "#f0ece4"); dp(gx + 4, 7, 2, 1, "#f0ece4"); dp(gx + 6, 8, 1, 1, "#f0ece4"); // a stepped-gable tower
        dp(gx + 4, 11, 1, 2, "#ffd860"); dp(gx + 7, 13, 9, 5, "#f0ece4");
        for (let r = 0; r < 3; r++) dp(gx + 7 + r, 12 - r, 9 - r, 1, r === 0 ? "#c8d4e4" : "#f4f8fc");
        for (const x of [9, 12]) dp(gx + x, 14, 1, 2, "#ffd860");
        cottage(gx + 19, 18, 6, 3, "#a8382a"); snowFir(gx + 17, 18, 5);
      }
      if (i === 2) { snowFir(gx + 3, 18, 7); cottage(gx + 7, 18, 6, 4, "#d8a040"); cottage(gx + 17, 18, 7, 3, "#a8382a"); }
    }));
    mullions();
    // on the sills: a candle in every window, a nisse in two, a paper star lamp hanging in the middle one
    WIN.forEach((gx, i) => {
      dp(gx + 3, 19, 5, 2, "#c8961a"); dp(gx + 4, 18, 3, 1, "#e8c060"); dp(gx + 5, 13, 2, 5, "#f8f4e8"); dp(gx + 6, 13, 1, 5, "#d8d0c0");
      if (i !== 1) nisse(gx + 18, 10);
    });
    dp(134, 6, 1, 4, "#c8c8d0"); glow(134, 13, 6, "#ffe9a0", 0.2); stamp(["...x...", "...x...", "xxxxxxx", ".xxxxx.", "..xxx..", ".xx.xx.", "x.....x"], { x: "#fff2c0" }, 131, 10); dp(134, 12, 1, 1, "#ffd84a");
    // a Dannebrog banner on a gold rod
    swagLine(3, 27, 24, 1, 2, "#8a8a96"); dp(15, 0, 1, 2, "#4a4a58");
    dp(3, 4, 25, 1, "#c8961a"); dp(2, 3, 2, 3, "#e8c060"); dp(27, 3, 2, 3, "#e8c060");
    danishFlag(5, 5, 21, 15); dp(5, 20, 21, 1, "#7a0a1a");
    // the advent wreath hangs from a hook on four red ribbons
    dp(87, 0, 3, 1, "#c8961a");
    for (const [fx, fy] of [[78, 19], [98, 19], [83, 16], [93, 16]]) for (let k = 0, n = 20; k <= n; k++) dp(Math.round(88 + ((fx - 88) * k) / n), Math.round(1 + ((fy - 1) * k) / n), 1, 1, "#d63c3c");
    for (let dy = -5; dy <= 5; dy++) for (let dx = -12; dx <= 12; dx++) {
      const e = (dx / 11.5) ** 2 + (dy / 4) ** 2;
      if (e > 1 || e < 0.3) continue;
      const n = rnd(dx * 17 + dy * 31 + 5);
      dp(88 + dx, 19 + dy, 1, 1, n > 0.92 ? "#c0202a" : n > 0.86 ? "#8a5a2a" : dy > 1 ? "#1f5a2e" : n > 0.5 ? "#3f8e46" : "#2f7a3e");
    }
    dp(85, 22, 3, 2, "#d63c3c"); dp(89, 22, 3, 2, "#d63c3c"); dp(88, 22, 1, 2, "#9a2626"); dp(86, 24, 1, 2, "#d63c3c"); dp(90, 24, 1, 2, "#d63c3c");
    // a julekalender with 24 doors over a night picture
    plank(146, 3, 27, 24, "#2a3a64", "#9a2626");
    dp(147, 4, 25, 6, "#d63c3c"); text3("JUL", 154, 5, "#ffffff"); stamp(MINIHEART, { x: "#ffffff" }, 149, 6); stamp(MINIHEART, { x: "#ffffff" }, 167, 6);
    for (let s = 0; s < 5; s++) dp(147 + Math.floor(rnd(s + 600) * 25), 11 + Math.floor(rnd(s + 610) * 13), 1, 1, "#fff6d8");
    // woven paper hearts on strings, red and white, green and white, red and green
    [[183, [7, 18], 0], [233, [5, 16], 1], [247, [9, 20], 2], [261, [4, 15], 0]].forEach(([x, ys, s]) => {
      dp(x, 0, 1, ys[ys.length - 1] - 6, "#c8c8d0");
      const [a, b, e] = [["#d63c3c", "#f8f8f8", "#7a1a22"], ["#2f8a3e", "#f8f8f8", "#1a4e2a"], ["#d63c3c", "#2f8a3e", "#5a1a1a"]][(s + ys[0]) % 3];
      ys.forEach((y, k) => julehjerte(x - 5, y - 3, k ? b : a, k ? a : b, e));
    });
    // a pine garland along the wall band with red bows; its warm lights glow (the bulbs are live)
    for (let x = 4; x <= 266; x++) {
      const y = swagY(x, 4, 44, 26, 2);
      dp(x, y - 1, 1, 3, rnd(x) > 0.5 ? "#2f7a3e" : "#1f5a2e");
      if (rnd(x + 9) > 0.6) dp(x, y - 2, 1, 1, "#3f8e46");
      if (rnd(x + 19) > 0.6) dp(x, y + 2, 1, 1, "#16442a");
    }
    dc.globalAlpha = 0.25;
    for (const x of XMAS_BULBS) if (x <= 262) dp(x - 1, swagY(x, 4, 44, 26, 2), 4, 4, "#ffe9a0");
    dc.globalAlpha = 1;
    for (const x of [48, 136, 180, 224]) { dp(x - 3, 24, 3, 3, "#d63c3c"); dp(x + 1, 24, 3, 3, "#d63c3c"); dp(x, 25, 1, 2, "#9a2626"); dp(x - 1, 27, 1, 3, "#d63c3c"); dp(x + 1, 27, 1, 3, "#d63c3c"); }
    // the tree: tiers of needles, a garland of little flags, hearts, paper stars, baubles and white candles
    for (const [y0, y1, a, b] of TIERS) for (let y = y0; y <= y1; y++) {
      const hw = Math.round(a + ((b - a) * (y - y0)) / (y1 - y0));
      for (let x = -hw; x <= hw; x++) {
        if (y === y1 && (x + y) % 2) continue;
        const n = rnd(x * 13 + y * 7);
        dp(TREE_X + x, y, 1, 1, y >= y1 - 1 ? "#16442a" : x < -hw / 3 ? (n > 0.8 ? "#4a9a4e" : "#2f7a3e") : x > hw / 2 ? "#1a4e2a" : n > 0.85 ? "#2f7a3e" : "#1f5a2e");
      }
    }
    for (const [x0, y0, x1, y1] of [[369, 47, 382, 51], [367, 60, 384, 64]]) {
      for (let x = x0; x <= x1; x++) dp(x, Math.round(y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)), 1, 1, "#e8dcc0");
      for (let x = x0 + 1; x + 3 <= x1; x += 5) stamp(TINYFLAG, { r: "#c8102e", w: "#f8f8f8" }, x, Math.round(y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)) + 1);
    }
    for (const [x, y] of [[371, 34], [378, 44], [370, 57], [379, 66]]) stamp(MINIHEART, { x: "#e0304a" }, x, y);
    for (const [x, y] of [[377, 24], [373, 39], [380, 54], [372, 65]]) { dp(x, y - 1, 1, 3, "#ffd84a"); dp(x - 1, y, 3, 1, "#ffd84a"); dp(x, y, 1, 1, "#ffffff"); }
    for (const [x, y, c] of [[373, 28, "#d63c3c"], [379, 37, "#e8c060"], [372, 51, "#c8cede"], [377, 57, "#d63c3c"], [375, 66, "#e8c060"], [369, 63, "#c8cede"]]) { dp(x, y, 2, 2, c); dp(x, y, 1, 1, "#ffffff"); }
    for (const [x, y] of TREE_CANDLES) dp(x, y, 1, 2, "#fffaf0");
    stamp(STAR5, { x: "#ffd84a" }, 373, 7); dp(375, 9, 1, 1, "#fff6c0");
    // its foot in a basket, presents, and a bowl of rice porridge left out for the nisse
    dp(373, 71, 4, 3, "#6a4426"); dp(369, 74, 12, 6, "#c8904e");
    for (let x = 369; x < 381; x += 2) dp(x, 74, 1, 6, "#a8743a");
    dp(369, 76, 12, 1, "#8a5a2a");
    dp(362, 75, 7, 7, "#d63c3c"); dp(365, 75, 1, 7, "#f8f8f8"); dp(362, 78, 7, 1, "#f8f8f8"); dp(364, 74, 3, 1, "#f8f8f8");
    dp(378, 77, 6, 5, "#2f8a3e"); dp(380, 77, 1, 5, "#d63c3c"); dp(378, 79, 6, 1, "#d63c3c");
    dp(370, 81, 6, 2, "#3a62c8"); dp(371, 80, 4, 1, "#fff6e0"); dp(372, 80, 1, 1, "#ffd84a");
    // along the wall: a lantern, presents, a straw goat
    dp(44, 34, 3, 1, "#22202a"); dp(43, 35, 5, 1, "#2a2a34"); dp(42, 36, 7, 1, "#2a2a34"); dp(42, 37, 7, 8, "#2a2a34"); dp(43, 38, 5, 6, "#f8d890"); dp(45, 41, 1, 3, "#f8f4e8"); dp(41, 45, 9, 2, "#2a2a34");
    dp(118, 40, 8, 7, "#d63c3c"); dp(121, 40, 2, 7, "#f8f8f8"); dp(118, 43, 8, 1, "#f8f8f8");
    dp(127, 42, 7, 5, "#2f8a3e"); dp(130, 42, 1, 5, "#ffd84a"); dp(127, 44, 7, 1, "#ffd84a");
    dp(120, 35, 5, 5, "#e8c060"); dp(122, 35, 1, 5, "#d63c3c"); dp(121, 34, 3, 1, "#d63c3c");
    stamp(JULEBUK, { x: "#e0b860", k: "#a07830", r: "#d63c3c" }, 201, 37);
    // nisser on the HQ terminal, on the couch arm and by the plant in the break room
    nisse(258, 55); nisse(366, 193); nisse(239, 245);
    // a red and white checked throw over the couch arm, heart pillows
    for (let y = 0; y < 12; y++) for (let x = 0; x < 9; x++) dp(267 + x, 203 + y, 1, 1, (Math.floor(x / 2) + Math.floor(y / 2)) % 2 ? "#f8f8f8" : "#d63c3c");
    for (let x = 267; x < 276; x += 2) dp(x, 215, 1, 2, "#f8f8f8");
    for (const x of [279, 352]) { dp(x, 204, 9, 7, "#f8f4e8"); stamp(MINIHEART, { x: "#d63c3c" }, x + 3, 206); }
    // æbleskiver with jam and sugar on the snack table
    dp(343, 221, 22, 7, "#c98f4a"); dp(344, 225, 18, 2, "#f8f8f8"); dp(345, 227, 16, 1, "#c8cede");
    for (const [x, y] of [[345, 222], [350, 222], [355, 222], [347, 219], [352, 219]]) { dp(x, y, 4, 3, "#b8702e"); dp(x + 1, y - 1, 2, 1, "#c8803e"); dp(x + 1, y - 1, 1, 1, "#ffffff"); dp(x + 3, y + 2, 1, 1, "#8a4a1e"); }
    dp(360, 222, 4, 3, "#c0202a"); dp(360, 222, 4, 1, "#f8f8f8");
  },
  live(now) {
    const t = now / 1000, d = new Date(), f = Math.floor(now / 140);
    const flame = (x, y, k) => { const s = (f + k) % 3; dp(x, y - 1, 1, 1, s === 2 ? "#fff6c0" : "#ffd84a"); dp(x, y, 1, 1, "#ff9a3a"); if (s === 0) dp(x, y - 2, 1, 1, "#ffd84a"); };
    // warm wall lights, a few twinkling
    XMAS_BULBS.forEach((x, k) => { if (x <= 262) dp(x, swagY(x, 4, 44, 26, 2) + 1, 2, 2, (Math.floor(now / 700) + k * 5) % 9 === 0 ? "#c8963a" : k % 2 ? "#ffe08a" : "#ffd060"); });
    // the advent candles burn down in turn; the ones lit longest are shortest
    const lit = adventLit(now, d);
    for (const k of [1, 2, 0, 3]) {
      const [fx, fy] = ADVENT[k], h = 8 - (k < lit ? Math.round((lit - 1 - k) * 1.5) : 0);
      dp(fx, fy - h, 2, h, "#f8f4e8"); dp(fx + 1, fy - h, 1, h, "#d8d0c0");
      if (k < lit) { dc.globalAlpha = 0.18; dp(fx - 2, fy - h - 5, 6, 5, "#ffe9a0"); dc.globalAlpha = 1; flame(fx, fy - h - 1, k); }
      else dp(fx, fy - h - 1, 1, 1, "#3a3a44");
    }
    // calendar doors: open up to today, today's one glinting
    const day = xmasDay(d);
    DOORS.forEach((n, idx) => {
      const x = 148 + (idx % 6) * 4, y = 12 + Math.floor(idx / 6) * 3;
      if (n > day) { dp(x, y, 3, 2, DOOR_C[n % 4]); dp(x + 1, y, 1, 1, shade(DOOR_C[n % 4], 0.7)); return; }
      dp(x, y, 3, 2, "#1a1428"); dp(x + 1, y + 1, 1, 1, ["#ffd84a", "#d63c3c", "#ffffff"][n % 3]);
      if (n === day && Math.floor(now / 500) % 2) dp(x + 2, y, 1, 1, "#ffffff");
    });
    // candles in the windows, on the tree, in the lantern
    WIN.forEach((gx, i) => { dc.globalAlpha = 0.16; dp(gx + 2, 8, 8, 6, "#ffe9a0"); dc.globalAlpha = 1; flame(gx + 5, 12, i); });
    TREE_CANDLES.forEach(([x, y], k) => flame(x, y - 1, k));
    dc.globalAlpha = 0.14 + (f % 2) * 0.04; dp(40, 34, 11, 12, "#ffe9a0"); dc.globalAlpha = 1; flame(45, 40, 1);
    // the star on the tree top twinkles
    const tw = Math.floor(now / 300) % 6;
    if (tw < 2) twinkle(375, 9, "#ffffff"); else if (tw === 3) { dp(371, 6, 1, 1, "#fff6c0"); dp(379, 8, 1, 1, "#fff6c0"); }
    // snow falling past the houses
    WIN.forEach((gx, i) => inGlass(gx, () => { for (let k = 0; k < 5; k++) dp(gx + Math.floor((rnd(k + i * 7 + 800) * 28 + Math.sin(t + k) * 2 + 28) % 28), 6 + ((rnd(k + i * 7 + 900) * 14 + t * (3 + k * 0.6)) % 14), 1, 1, "#ffffff"); }));
    // and in the room: snowflakes with a few red hearts drifting among them
    drift(now, 28, 0.8, (x, y, i) => { if (i % 7 === 3) stamp(HEART5, { x: "#e0304a" }, x, y); else { dp(x, y, 2, 2, "#ffffff"); dp(x + 1, y + 1, 1, 1, "#b8cad8"); } });
  },
  counter(now) {
    // a calendar candle (kalenderlys) that burns down a mark a day, and a plate of pebernødder
    const day = new Date().getMonth() === 11 ? Math.min(24, new Date().getDate()) : 12, h = 14 - Math.round((day - 1) * 0.45);
    dc.globalAlpha = 0.16; dp(355, 40 - h, 9, 7, "#ffe9a0"); dc.globalAlpha = 1;
    dp(355, 44, 9, 2, "#c8961a"); dp(354, 43, 3, 2, "#3f8e46"); dp(362, 43, 3, 2, "#3f8e46"); dp(357, 44, 1, 1, "#d63c3c");
    dp(358, 44 - h, 3, h, "#f8f4e8"); dp(360, 44 - h, 1, h, "#d8d0c0");
    for (let y = 44 - h + 1; y < 43; y += 2) dp(358, y, 2, 1, "#d63c3c");
    const s = Math.floor(now / 140) % 3;
    dp(359, 43 - h, 1, 1, "#ff9a3a"); dp(359, 42 - h, 1, 1, s === 2 ? "#fff6c0" : "#ffd84a"); if (s === 0) dp(359, 41 - h, 1, 1, "#ffd84a");
    dp(276, 45, 15, 1, "#f8f8f8"); dp(277, 46, 13, 1, "#c8cede");
    for (const [x, y] of [[278, 43], [281, 43], [284, 43], [287, 43], [280, 41], [283, 41], [286, 41], [282, 39]]) { dp(x, y, 2, 2, "#b8702e"); dp(x, y, 1, 1, "#d8984e"); }
  },
};
