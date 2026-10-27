// One floor's room, as the page uses it: the page asks for the ring and listens for a click, and never reaches into
// the room's other modules. HQ's floor is the page's own graph; a floor's copy (U8) has the same API on its own bus.
import { on } from "../core/bus.js";
import { cv } from "./canvas.js";
import { select } from "./input.js";
import { FLOOR } from "./here.js";

export const floor = {
  id: FLOOR,
  canvas: cv,
  select, // the ring on a worker by name, or on none (null)
  onWorker: (fn) => on("worker", fn), // a click on a worker, with its name
};
