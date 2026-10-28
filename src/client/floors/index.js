// FLOORS on the page (docs/floors.md). With two or more floors the stage shows THE BUILDING (floors/building.js) or the
// floor you are in, under a bar with ◀ BUILDING and the floor's name; every list follows the scope (core/scope.js),
// and a change of scope draws them again here. A lane's tag on another floor takes you into that floor. Esc steps out
// one level. With one floor nothing here touches the page. Adapted from the building and the scope in PR #8 by
// Aleksander.
import { on } from "../core/bus.js";
import { $ } from "../core/dom.js";
import { S } from "../core/state.js";
import { esc, setHTML } from "../core/format.js";
import { floorById, floorLabel, floorsOf, multi } from "../core/floors.js";
import { enter, officeFloor, settle, toBuilding, toggleAll } from "../core/scope.js";
import { PANELS } from "../questions/drafts.js";
import { syncWorkers } from "../room/workers.js";
import { renderTiles } from "./building.js";

const stage = document.querySelector(".stage");
let bar = null, building = null, wasMulti = null;

// Made the first time there are two floors, taken down when there is one again.
function make() {
  bar = document.createElement("div");
  bar.className = "floorbar";
  building = document.createElement("section");
  building.className = "box building";
  building.setAttribute("aria-label", "The building");
  stage.prepend(bar, building);
}
function takeDown() {
  bar.remove();
  building.remove();
  bar = building = null;
  stage.removeAttribute("data-floors");
  stage.style.removeProperty("--fc");
}

function draw() {
  if (!S) return;
  const many = multi(S);
  // The office's lanes change with the number of floors: one floor's office holds every lane.
  if (wasMulti !== null && wasMulti !== many) syncWorkers(true);
  wasMulti = many;
  if (!many) { if (bar) takeDown(); return; }
  if (!bar) make();
  const f = floorById(S, officeFloor());
  const mode = f ? "floor" : "building";
  if (stage.dataset.floors !== mode) stage.dataset.floors = mode;
  if (f) {
    stage.style.setProperty("--fc", f.color);
    setHTML(bar, `<button class="btn back" type="button" data-building>◀ BUILDING</button><i class="fswatch" style="background:${esc(f.color)}"></i><b class="fname">${esc(floorLabel(f))}</b><span class="fhq">HQ: ${esc(f.hq)}</span>`);
  } else {
    stage.style.removeProperty("--fc");
    setHTML(bar, `<b class="fname">THE BUILDING</b><span class="fhq">${floorsOf(S).length} FLOORS · PICK ONE TO GO IN</span>`);
    renderTiles(building, S);
  }
}

on("state", () => { settle(); draw(); });
// Another floor, the building, or SHOW ALL: every list and count, and the office, again.
on("scope", () => {
  for (const [, render] of PANELS) render();
  syncWorkers(true);
  draw();
});

stage.addEventListener("click", (e) => {
  if (e.target.closest(".floorbar [data-building]")) { toBuilding(); return; }
  const tile = e.target.closest("[data-floor-go]");
  if (tile) enter(tile.dataset.floorGo);
});
document.addEventListener("click", (e) => { if (e.target.closest?.("[data-scope-all]")) toggleAll(); });
// A lane's tag (on a question, a message, the card) selects its worker: on another floor, go there first so the
// office shows it. Before the click that selects it (core/clicks.js).
document.addEventListener("click", (e) => {
  const sel = e.target.closest?.("[data-select]");
  if (!sel || !S || !multi(S)) return;
  const lane = S.lanes.find((l) => l.name === sel.dataset.select);
  if (lane?.floor && lane.floor !== officeFloor()) enter(lane.floor);
}, true);

// Esc steps out of a floor to the building; not while typing, in SETTINGS, in a conference room or a preview.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || e.defaultPrevented || !officeFloor()) return;
  const el = document.activeElement;
  if (el?.matches?.("input, textarea, select, [contenteditable]") || el?.closest?.("[data-rbox]")) return;
  if (!$("settings").hidden || stage.classList.contains("inroom") || document.querySelector(".preview:not([hidden])")) return;
  e.preventDefault();
  toBuilding();
});
