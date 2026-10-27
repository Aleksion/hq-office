// Pointer input on the room (hover, click to select) and fitting the canvas to its box.
import { H, TS, W, cv } from "./canvas.js";
import { workers } from "./workers.js";
import { renderCard } from "../card/card.js";

export let selected = null;
export let hovered = null;

function workerAt(e) {
  const r = cv.getBoundingClientRect();
  const nx = ((e.clientX - r.left) / r.width) * W * TS, ny = ((e.clientY - r.top) / r.height) * H * TS;
  let hit = null;
  for (const w of workers.values()) {
    const sx = w.x * TS, sy = w.y * TS - 6;
    if (nx >= sx + 2 && nx <= sx + 14 && ny >= sy && ny <= sy + 22) if (!hit || w.y > hit.y) hit = w;
  }
  return hit;
}
cv.addEventListener("mousemove", (e) => { const w = workerAt(e); hovered = w?.lane.name ?? null; cv.style.cursor = w ? "pointer" : "default"; });
cv.addEventListener("mouseleave", () => { hovered = null; });
cv.addEventListener("click", (e) => {
  const w = workerAt(e);
  if (!w) return;
  select(w.lane.name, true);
});

export function select(name, jump) {
  selected = name;
  renderCard();
  if (jump) {
    const card = document.querySelector(`.ask[data-lane="${CSS.escape(name)}"]`);
    if (card) { card.scrollIntoView({ behavior: "smooth", block: "center" }); card.classList.remove("flash"); void card.offsetWidth; card.classList.add("flash"); }
  }
}

// Desktop: the canvas is as big as the room box allows, keeping its 3:2 shape, so the page never scrolls. A floor
// that is shown in a box of its own is fitted to that box instead (fitTo); null gives it back to the rule below.
const roomBox = cv.parentElement, roomLegend = roomBox.querySelector(".legend");
let own = null;
export function fitTo(box) {
  own = box;
  fitRoom();
}
function fitRoom() {
  if (own) { cv.style.width = Math.max(1, Math.floor(Math.min(own.width, (own.height * W) / H))) + "px"; return; }
  if (!matchMedia("(min-width: 1151px)").matches) { cv.style.width = ""; return; }
  const w = roomBox.clientWidth - 16;
  const h = roomBox.clientHeight - 16 - (roomLegend?.offsetHeight ?? 0);
  cv.style.width = Math.max(160, Math.floor(Math.min(w, (h * W) / H))) + "px";
}
new ResizeObserver(fitRoom).observe(roomBox);
