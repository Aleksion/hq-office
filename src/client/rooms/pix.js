// The strip at the top of an open room: the conference room's interior in pixels, the owner at the head of the table
// and the room's lanes along it, each in its sprite from the office. A lane that is working has its laptop open and
// lit, with a typing mark over its head; a lane waiting on something shows the office's bubble. It is a still
// picture: drawn when what it shows changes (the room, a lane's status, the theme, the hero, the size, a font load),
// never on a timer, with the office's sprite cache (room/canvas.js blit).
import { SC, ctx, px, setCtx } from "../room/canvas.js";
import { drawSprite } from "../room/sprites.js";
import { GLYPH, drawBubble } from "../room/scene.js";
import { heroPal, hqPal } from "../room/looks.js";
import { palette } from "../room/palette.js";
import { workers } from "../room/workers.js";
import { drawAccessories, wornBy } from "../room/accessories.js";
import { hero, settings } from "../settings/prefs.js";

export const ART_H = 48; // art pixels; the strip's width follows its box
const FRAME = "#56688a", GLASS = "#cfe9f3", GLEAM = "#f4fbff", SILL = "#7d8fb0", WALL = "#9aa8c4";
const CARPET = ["#b9c3d9", "#b0bbd2"];
const WOOD = "#b07a44", WOOD_TOP = "#c89058", WOOD_EDGE = "#7a4e28", LEG = "#5a3820";
const SEAT = "#4f5f94", SEAT_DARK = "#36426e", SEAT_LIGHT = "#6f80b8";
const TABLE_Y = 31; // the table's top edge: a seated lane shows its head and shoulders above it
const SIT_Y = 17; // a seated sprite's top
const HEAD_X = 10; // the owner's chair at the table's head

const palOf = (name) => (name === "hq" ? hqPal() : workers.get(name)?.pal ?? palette(name));

// Where each lane sits: spread along the table, at least a sprite's width apart.
export function seatsFor(n, width) {
  const first = HEAD_X + 30, room = Math.max(0, width - first - 16);
  const gap = n > 1 ? Math.max(17, Math.min(26, Math.floor(room / n))) : 26;
  return Array.from({ length: n }, (_, i) => first + i * gap);
}

function wall(w) {
  px(0, 0, w, 15, WALL);
  // the glass along the back, with mullions and a gleam, on a sill
  px(0, 2, w, 2, FRAME);
  px(0, 4, w, 8, GLASS);
  for (let x = 6; x < w - 6; x += 23) { px(x, 5, 2, 1, GLEAM); px(x + 2, 6, 2, 1, GLEAM); px(x + 4, 7, 2, 1, GLEAM); }
  for (let x = 32; x < w; x += 48) px(x, 2, 2, 10, FRAME);
  px(0, 12, w, 3, SILL);
  px(0, 15, w, 1, FRAME);
  for (let y = 16; y < ART_H; y += 8) for (let x = 0; x < w; x += 8) px(x, y, 8, 8, CARPET[((x + y) / 8) % 2]);
  // a plant in the far corner, and a whiteboard on the back wall
  if (w > 120) {
    const p = w - 14;
    px(p + 2, 26, 8, 8, "#a0603c");
    px(p, 17, 12, 10, "#3f9e4f");
    px(p + 3, 14, 7, 4, "#57b866");
  }
}
function chairBack(x) {
  px(x + 3, SIT_Y + 3, 10, 12, SEAT_DARK);
  px(x + 4, SIT_Y + 4, 8, 1, SEAT_LIGHT);
}
function laptop(x, on) {
  // on the table in front of a lane: lid up and lit while it works, shut otherwise
  if (on) {
    px(x + 3, TABLE_Y - 4, 10, 6, "#2b2f3a");
    px(x + 4, TABLE_Y - 3, 8, 4, "#6ad1ff");
    px(x + 5, TABLE_Y - 2, 4, 1, "#f4fbff");
    px(x + 2, TABLE_Y + 2, 12, 2, "#8a8aa0");
  } else {
    px(x + 3, TABLE_Y + 2, 10, 2, "#55555f");
  }
}
// Three dots over a working lane's head.
function typing(x) {
  px(x + 3, SIT_Y - 5, 10, 5, "#22202a");
  px(x + 4, SIT_Y - 4, 8, 3, "#ffffff");
  for (const d of [5, 7, 9]) px(x + d, SIT_Y - 3, 1, 1, "#2f9e57");
}

// What the strip shows, as text: drawn again only when this changes.
export function stripKey(room, lanes, width) {
  const l = room ? [room.owner, ...room.members].map((n) => { const x = lanes.get(n); return `${n}:${x?.status ?? "-"}:${x?.herdr ?? ""}:${palOf(n)?.look?.id ?? ""}`; }) : [];
  return [width, settings.theme, hero().name, document.fonts?.status, ...l].join("|");
}

export function drawStrip(canvas, room, lanes, width) {
  if (canvas.width !== width * SC) canvas.width = width * SC;
  if (canvas.height !== ART_H * SC) canvas.height = ART_H * SC;
  const g = canvas.getContext("2d");
  g.imageSmoothingEnabled = false;
  const real = ctx;
  try {
    setCtx(g);
    wall(width);
    if (!room) return;
    const names = [room.owner, ...room.members];
    const seats = seatsFor(names.length, width);
    const end = (seats.at(-1) ?? HEAD_X + 30) + 24;
    // the chairs behind the lanes, the lanes, then the table over their laps
    for (const x of seats) chairBack(x);
    names.forEach((name, i) => {
      const l = lanes.get(name), pal = palOf(name), gone = l?.herdr === "gone" || l?.status === "gone";
      drawSprite(pal, seats[i], SIT_Y, "down", 0, gone ? 0.4 : 1);
      if (name !== "hq") drawAccessories(pal, wornBy(name, false, pal.look?.hides), seats[i], SIT_Y, "down", 0, gone ? 0.4 : 1);
    });
    // the owner at the head, side on, facing down the table
    const me = heroPal();
    px(HEAD_X - 2, SIT_Y + 4, 4, 14, SEAT_DARK);
    drawSprite(me, HEAD_X, SIT_Y + 4, "right", 0);
    drawAccessories(me, wornBy(hero().name, true, me.look?.hides), HEAD_X, SIT_Y + 4, "right", 0);
    px(HEAD_X + 1, SIT_Y + 18, 12, 3, SEAT);
    px(HEAD_X + 1, SIT_Y + 18, 12, 1, SEAT_LIGHT);
    px(HEAD_X + 2, SIT_Y + 21, 2, 4, LEG);
    px(HEAD_X + 10, SIT_Y + 21, 2, 4, LEG);
    // the table
    const tx = HEAD_X + 18;
    px(tx, TABLE_Y, end - tx, 8, WOOD);
    px(tx, TABLE_Y, end - tx, 1, WOOD_TOP);
    px(tx, TABLE_Y + 8, end - tx, 3, WOOD_EDGE);
    px(tx + 3, TABLE_Y + 11, 2, 5, LEG);
    px(end - 5, TABLE_Y + 11, 2, 5, LEG);
    // papers in front of the owner
    px(tx + 3, TABLE_Y + 2, 7, 4, "#f8f8f0");
    px(tx + 5, TABLE_Y + 1, 7, 4, "#ffffff");
    names.forEach((name, i) => {
      const l = lanes.get(name), st = l?.herdr === "gone" ? "gone" : l?.status;
      laptop(seats[i], st === "moving");
      if (st === "moving") typing(seats[i]);
      else if (GLYPH[st]) drawBubble(seats[i], SIT_Y, GLYPH[st][0], GLYPH[st][1], 0, GLYPH[st][2]);
    });
  } finally {
    setCtx(real);
  }
}

// The lane under an art x, for the strip's tooltip.
export function laneAt(room, width, x) {
  if (!room) return null;
  const names = [room.owner, ...room.members];
  const seats = seatsFor(names.length, width);
  if (x >= HEAD_X && x < HEAD_X + 16) return "you";
  const i = seats.findIndex((s) => x >= s && x < s + 16);
  return i < 0 ? null : names[i];
}
