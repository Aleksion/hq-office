// The floors on the page. A click on a worker chooses that agent (core/scope.js); the chosen agent gets the room's ring
// on its floor; Escape steps the scope out one level. HQ's floor is the page's own room; a floor's copy joins the same map.
import { on } from "../core/bus.js";
import { $ } from "../core/dom.js";
import { S } from "../core/state.js";
import { floor as hq } from "../room/floor.js";
import { chooseAgent, outOne, scope } from "../core/scope.js";
import { escapeAction, floorOfLane } from "../core/floors.js";

const floors = new Map([[hq.id, hq]]);

for (const f of floors.values()) f.onWorker((name) => chooseAgent(name, { jump: true }));

// Each floor rings the agent when it is on that floor, and no one otherwise.
function ring() {
  if (!S) return;
  const agent = scope().agent, at = floorOfLane(S, agent);
  for (const [id, f] of floors) f.select(agent && at === id ? agent : null);
}
on("scope", ring);
on("state", ring);

// Caught before the room's own Escape (rooms/), which would otherwise act on the same key press.
let stage = false;
on("stage", (shown) => { stage = shown !== "office"; });
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const f = document.activeElement;
  const busy = {
    stage,
    settings: !$("settings").hidden,
    dialog: !!document.querySelector("dialog[open]"),
    typing: !!f?.matches?.("input, textarea, select, [contenteditable]"),
  };
  if (escapeAction(scope(), busy) !== "out") return;
  e.preventDefault();
  outOne();
}, true);
