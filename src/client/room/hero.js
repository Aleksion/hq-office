// The hero behind the counter: the dance, the sleep at night, the shadow, sparkles and notes.
import { SC, TS, ctx, px } from "./canvas.js";
import { HEADS } from "./sprites.js";
import { hero } from "../settings/prefs.js";
import { BEAT_MS } from "./beat.js";

// One routine of 30 beats, looping. Each move: facing, walk frame, sideways offset in pixels, how he moves
// ("bob", "hop", "still" or "slide"), and whether sparkles fly. The routine is side steps, hops, a spin, a back hop,
// a shuffle, and a moonwalk that travels left, turns, travels right, turns, and comes back to the middle. He always
// slides backwards: side-on, facing the way he is not going. A slide's offset is a [from, to] pair of pixels.
const MOVE_MS = 2 * BEAT_MS; // two of the room's beats a move: on the ground, then in the air
const DANCE = [
  ["down", 0, 0, "bob", false], ["down", 1, 0, "bob", false],
  ["left", 1, -4, "bob", false], ["left", 0, -4, "still", false],
  ["right", 1, 4, "bob", false], ["right", 0, 4, "still", false],
  ["down", 0, 0, "hop", true], ["down", 1, 0, "hop", true],
  ["right", 1, 0, "bob", false], ["down", 1, 0, "bob", false], ["left", 1, 0, "bob", false], ["up", 1, 0, "bob", false],
  ["up", 0, 0, "hop", true], ["down", 0, -2, "bob", false], ["down", 0, 2, "bob", false], ["up", 0, 0, "hop", true],
  // The moonwalk: left, turn, right, turn, back to the middle, face the room, hold
  ["right", 0, [0, -4], "slide", false], ["right", 1, [-4, -8], "slide", false],
  ["left", 0, -8, "still", false],
  ["left", 0, [-8, -4], "slide", false], ["left", 1, [-4, 0], "slide", false],
  ["left", 0, [0, 4], "slide", false], ["left", 1, [4, 8], "slide", false],
  ["right", 0, 8, "still", false],
  ["right", 1, [8, 6], "slide", false], ["right", 0, [6, 4], "slide", false],
  ["right", 1, [4, 2], "slide", false], ["right", 0, [2, 0], "slide", false],
  ["down", 0, 0, "still", false], ["down", 0, 0, "still", false],
];
// Midnight to seven, by this computer's clock.
export function isNight(date = new Date()) {
  const h = date.getHours();
  return h >= 0 && h < 7;
}
// Asleep in bed behind the desk.
export function drawSleep(now) {
  // A cosy bed two tiles wide against the wall, its foot behind the counter. The hero sleeps in it with its own quiff
  // on the pillow, eyes shut, a nose bubble growing and popping, a teddy tucked in beside it under a starry
  // blanket that rises and falls. A lamp glows on the nightstand and z's drift up past the sign.
  const bx = 20 * TS - 16, wood = "#9a6a3a", dark = "#6e4826", panel = "#7a4a2a", gold = "#f0d040";
  const breathe = Math.floor(now / 1500) % 2, top = 35 - breathe;
  // the lamp's warm glow, under everything else
  ctx.globalAlpha = 0.16; px(bx + 28, 23, 20, 14, "#ffe9a0");
  ctx.globalAlpha = 0.22; px(bx + 31, 24, 14, 10, "#ffe9a0");
  ctx.globalAlpha = 1;
  // bed frame and headboard with a gold star
  px(bx, 24, 3, 22, dark);
  px(bx + 29, 24, 3, 22, dark);
  px(bx, 23, 3, 1, wood);
  px(bx + 29, 23, 3, 1, wood);
  px(bx + 3, 26, 26, 8, wood);
  px(bx + 5, 28, 22, 4, panel);
  px(bx + 3, 33, 26, 1, dark);
  px(bx + 15, 28, 2, 4, gold); px(bx + 14, 29, 4, 2, gold);
  // sheet and pillow
  px(bx + 3, 34, 26, 12, "#f3efe6");
  px(bx + 4, 30, 24, 7, "#ffffff");
  px(bx + 4, 36, 24, 1, "#d8d2c6");
  px(bx + 4, 30, 1, 6, "#e6e0d4"); px(bx + 27, 30, 1, 6, "#e6e0d4");
  // his head, the spiky mane of his own sprite, with the eyes shut and a blush
  const me = hero().pal, pal = { ...me, r: "#f09a8a" };
  const rows = HEADS[me.t].down;
  for (let r = 0; r < 10; r++) for (let c = 0; c < 16; c++) {
    let ch = rows[r][c];
    if (r === 7 && ch === "k" && c > 1 && c < 14) ch = "s";
    if (r === 8) ch = c === 4 || c === 5 || c === 10 || c === 11 ? "k" : c === 3 || c === 12 ? "r" : ch === "k" && c > 1 && c < 14 ? "s" : ch;
    if (ch !== ".") px(bx + 8 + c, 23 + r, 1, 1, pal[ch]);
  }
  // a nose bubble that swells over three seconds, then pops
  const b = (now % 3000) / 3000, nx = bx + 24, ny = 30;
  if (b < 0.86) {
    const rad = 1 + (b / 0.86) * 2;
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > rad) continue;
      if (d > rad - 1) px(nx + dx, ny + dy, 1, 1, "#7ec8f0");
      else { ctx.globalAlpha = 0.45; px(nx + dx, ny + dy, 1, 1, "#d8f4ff"); ctx.globalAlpha = 1; }
    }
    if (rad > 2) px(nx - 1, ny - Math.floor(rad) + 1, 1, 1, "#ffffff");
  } else {
    for (const [dx, dy] of [[-3, -3], [3, -3], [-3, 2], [3, 2], [0, -4]]) px(nx + dx, ny + dy, 1, 1, "#9fe3ff");
  }
  // shoulders in his red shirt with the gold collar
  px(bx + 7, 33, 18, 2, me.k);
  px(bx + 8, 33, 16, 1, me.c);
  px(bx + 8, 34, 16, 1, me.C);
  px(bx + 15, 33, 2, 1, gold);
  // the blanket: night blue, gold stars, a white turned-over edge
  px(bx + 3, top, 26, 46 - top, "#3a4a9a");
  px(bx + 3, top + 2, 26, 1, "#5a6ac0");
  px(bx + 3, top + 2, 2, 44 - top, "#2a3670");
  px(bx + 27, top + 2, 2, 44 - top, "#2a3670");
  px(bx + 3, top, 26, 1, "#ffffff");
  px(bx + 3, top + 1, 26, 1, "#e6e0d4");
  for (const [sx, sy] of [[11, 5], [18, 7], [24, 4], [14, 9], [22, 9]]) {
    px(bx + sx, top + sy, 1, 1, gold);
    if ((sx + Math.floor(now / 600)) % 3 === 0) { px(bx + sx - 1, top + sy, 3, 1, gold); px(bx + sx, top + sy - 1, 1, 3, gold); }
  }
  // his hands on the blanket
  for (const hx of [bx + 9, bx + 20]) { px(hx, top - 1, 3, 2, me.s); px(hx, top + 1, 3, 1, me.S); }
  // a teddy tucked in at his side
  const tx = bx + 3, ty = top + 1, fur = "#b07a44";
  px(tx, ty, 2, 2, fur); px(tx + 5, ty, 2, 2, fur);
  px(tx, ty + 1, 7, 5, fur);
  px(tx + 1, ty + 2, 1, 1, me.k); px(tx + 5, ty + 2, 1, 1, me.k);
  px(tx + 2, ty + 3, 3, 2, "#e8c898"); px(tx + 3, ty + 3, 1, 1, me.k);
  // nightstand and lamp
  px(bx + 33, 34, 10, 2, wood);
  px(bx + 33, 36, 10, 10, panel);
  px(bx + 34, 39, 8, 1, dark);
  px(bx + 37, 41, 2, 1, gold);
  px(bx + 37, 30, 2, 4, "#8a8a96");
  px(bx + 35, 33, 6, 1, "#6a6a76");
  px(bx + 35, 25, 6, 1, "#e8c870");
  px(bx + 34, 26, 8, 4, "#ffe090");
  px(bx + 34, 29, 8, 1, "#e8c870");
  // z's drifting up past the sign, small and big
  for (let i = 0; i < 3; i++) {
    const p = ((now + i * 900) % 2700) / 2700, x = bx + 24 + i * 2 + Math.sin(p * 6 + i) * 2, y = 26 - p * 16;
    ctx.globalAlpha = 1 - p;
    if (i === 1) {
      px(x, y, 5, 1, "#ffffff");
      for (let j = 1; j < 4; j++) px(x + 4 - j, y + j, 1, 1, "#ffffff");
      px(x, y + 4, 5, 1, "#ffffff");
    } else drawZ(x, y, "#9fe3ff");
  }
  ctx.globalAlpha = 1;
}
function drawZ(x, y, c) {
  px(x, y, 3, 1, c);
  px(x + 2, y + 1, 1, 1, c);
  px(x + 1, y + 2, 1, 1, c);
  px(x, y + 3, 3, 1, c);
}

// Where the hero is on the routine right now: the move, how far off the ground (0 to 1), and the lift in pixels.
export function danceMove(now) {
  const beat = Math.floor(now / MOVE_MS) % DANCE.length;
  const frac = (now % MOVE_MS) / MOVE_MS;
  const [dir, step, offset, kind, sparkle] = DANCE[beat];
  const travel = Array.isArray(offset) ? offset[0] + (offset[1] - offset[0]) * frac : offset;
  const arc = Math.abs(Math.sin(frac * Math.PI));
  const air = kind === "hop" ? arc : 0;
  const lift = kind === "bob" ? -3 * arc : kind === "hop" ? -8 * arc : 0;
  return {
    dir, step,
    dx: Math.round(travel),
    dy: 0,
    air, lift: Math.round(lift), sparkle: sparkle && frac < 0.6,
  };
}
// Whether the hero is mid-moonwalk: a slide travels, so it is drawn at the walking rate.
export const sliding = (now) => DANCE[Math.floor(now / MOVE_MS) % DANCE.length][3] === "slide";
// When the slide next carries the hero a whole pixel, or the move ends.
export function slideChange(now) {
  const i = Math.floor(now / MOVE_MS), [a, b] = DANCE[i % DANCE.length][2], start = i * MOVE_MS;
  const edge = Math.round(a + ((b - a) * (now - start)) / MOVE_MS) + Math.sign(b - a) / 2;
  return start + Math.min(1, (edge - a) / (b - a)) * MOVE_MS + 1;
}
// A soft shadow under his feet, smaller the higher he is and following him sideways.
export function drawShadow(air, dx) {
  ctx.globalAlpha = 0.25 - air * 0.1;
  ctx.fillStyle = "#22202a";
  ctx.beginPath();
  ctx.ellipse((20 * TS + dx) * SC, (2 * TS + 11) * SC, (5 - air * 1.5) * SC, 1.6 * SC, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}
// Sparkles that fly off his head on the hops.
export function drawSparkles(now) {
  const colors = ["#ffd166", "#9fe3ff", "#ff8fab"];
  for (let i = 0; i < 4; i++) {
    const a = (now / 120 + i * 1.6) % (Math.PI * 2);
    px(20 * TS + 6 + Math.cos(a) * 14, 2 * TS - 4 + Math.sin(a) * 6, 1, 1, colors[i % colors.length]);
  }
}
// Music notes float up off the hero's head while it dances.
export function drawNotes(now) {
  for (let i = 0; i < 2; i++) {
    const t = ((now + i * 600) % 1200) / 1200;
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = i ? "#ffd166" : "#9fe3ff";
    ctx.font = `${5 * SC}px Nunito, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(i ? "♫" : "♪", (20 * TS + 14 + i * 12 - 6 * t) * SC, (2 * TS - 4 - t * 22) * SC);
  }
  ctx.globalAlpha = 1;
}
