// The conference room in the office's bottom-left corner: glass walls, a long table and six chairs. Drawn once with
// the room's still parts; lanes gather at its chairs while one of the HUD's rooms is talking (rooms/gather.js).
import { TS, px } from "./canvas.js";

// Inside: tiles x 0 to 6, rows 12 to 14. The glass wall runs along the bottom of row 11 (a door at x 6), down column
// 7, and a low rail closes row 14 off from row 15, which stays clear for the event rooms' art along the floor's edge.
export const CONF = { x0: 0, x1: 7, y0: 11, y1: 14 };
export const inConference = (x, y) => x >= CONF.x0 && x <= CONF.x1 && y >= CONF.y0 && y <= CONF.y1;
const DOOR_X = 6;
// The chairs, in the order they fill: the first two face each other across the middle of the table.
export const CONF_SEATS = [[3, 12, "down"], [3, 14, "up"], [1, 12, "down"], [5, 14, "up"], [5, 12, "down"], [1, 14, "up"]].map(([x, y, face]) => ({ x, y, face }));
// Tiles nobody walks through: the walls (not the door), the table, and the strip below the rail.
export const CONF_BLOCKED = [];
for (let x = 0; x < 7; x++) {
  if (x !== DOOR_X) CONF_BLOCKED.push([x, 11]);
  if (x < 6) CONF_BLOCKED.push([x, 13]);
  CONF_BLOCKED.push([x, 15]);
}
for (let y = 11; y <= 15; y++) CONF_BLOCKED.push([7, y]);

const FRAME = "#56688a", GLASS = "#cfe9f3", GLEAM = "#f4fbff", SILL = "#7d8fb0";
const CARPET = ["#b9c3d9", "#b0bbd2"];
const WOOD = "#b07a44", WOOD_EDGE = "#7a4e28", LEG = "#5a3820";
const SEAT = "#4f5f94", SEAT_DARK = "#36426e", SEAT_LIGHT = "#6f80b8";

function chair(x, y, face) {
  const cx = x * TS + 3, cy = y * TS;
  if (face === "down") {
    px(cx + 1, cy + 1, 8, 6, SEAT_DARK); // the back, behind whoever sits
    px(cx + 2, cy + 2, 6, 1, SEAT);
    px(cx, cy + 7, 10, 4, SEAT);
    px(cx, cy + 7, 10, 1, SEAT_LIGHT);
    px(cx + 1, cy + 11, 2, 2, LEG);
    px(cx + 7, cy + 11, 2, 2, LEG);
  } else {
    px(cx, cy + 6, 10, 4, SEAT);
    px(cx, cy + 6, 10, 1, SEAT_LIGHT);
    px(cx + 1, cy + 10, 8, 5, SEAT_DARK); // the back, in front of whoever sits
    px(cx + 2, cy + 11, 6, 1, SEAT);
  }
}

export function paintConference() {
  const L = CONF.x0 * TS, R = CONF.x1 * TS, T = 12 * TS, B = 15 * TS;
  // carpet
  for (let y = 12; y <= 14; y++) for (let x = 0; x < 7; x++) px(x * TS, y * TS, TS, TS, CARPET[(x + y) % 2]);
  // the glass wall along the top, with a door at DOOR_X: a frame, the pane with a gleam, a sill
  const wall = (x0, x1) => {
    px(x0, T - 10, x1 - x0, 2, FRAME);
    px(x0, T - 8, x1 - x0, 6, GLASS);
    for (let x = x0 + 5; x < x1 - 4; x += 19) { px(x, T - 7, 2, 1, GLEAM); px(x + 2, T - 6, 2, 1, GLEAM); px(x + 4, T - 5, 2, 1, GLEAM); }
    px(x0, T - 2, x1 - x0, 2, SILL);
    for (let x = x0 + 31; x < x1 - 2; x += 32) px(x, T - 10, 1, 10, FRAME); // mullions
  };
  wall(L, DOOR_X * TS);
  px(DOOR_X * TS, T - 10, 2, 10, FRAME); // door posts and the threshold
  px((DOOR_X + 1) * TS - 2, T - 10, 2, 10, FRAME);
  px(DOOR_X * TS + 2, T - 2, TS - 4, 2, "#9fb3bd");
  // the glass wall down the right side
  px(R, T - 10, 4, B - T + 12, FRAME);
  px(R + 1, T - 8, 2, B - T + 8, GLASS);
  px(R + 1, T + 4, 1, 3, GLEAM);
  px(R + 1, T + 26, 1, 3, GLEAM);
  // the low rail along the bottom
  px(L, B, R - L + 4, 2, FRAME);
  px(L, B, R - L + 4, 1, SILL);
  // a plant in the corner, at the table's end
  px(L + 3, T + 10, 7, 7, "#a0603c");
  px(L + 1, T + 3, 11, 8, "#3f9e4f");
  px(L + 3, T, 7, 4, "#57b866");
  // chairs, then the table over the backs of the top row's seats
  for (const s of CONF_SEATS) chair(s.x, s.y, s.face);
  const tx = L + 14, tw = 6 * TS - 14, ty = 13 * TS - 1;
  px(tx, ty, tw, 11, WOOD);
  px(tx, ty, tw, 1, "#c89058");
  px(tx, ty + 11, tw, 3, WOOD_EDGE);
  px(tx + 2, ty + 14, 2, 3, LEG);
  px(tx + tw - 4, ty + 14, 2, 3, LEG);
  // on the table: papers, a laptop, the speakerphone in the middle, a mug
  px(tx + 5, ty + 3, 7, 5, "#f8f8f0");
  px(tx + 7, ty + 2, 7, 5, "#ffffff");
  px(tx + 37, ty + 4, 8, 4, "#2b2f3a");
  px(tx + 40, ty + 5, 2, 1, "#3ee08f");
  px(tx + 54, ty + 2, 11, 6, "#3b4a5a");
  px(tx + 55, ty + 3, 9, 4, "#6ad1ff");
  px(tx + 53, ty + 8, 13, 2, "#8a8aa0");
  px(tx + 72, ty + 3, 4, 5, "#f8f8f0");
  px(tx + 76, ty + 4, 1, 3, "#f8f8f0");
  px(tx + 72, ty + 3, 4, 1, "#7a4e28");
}
