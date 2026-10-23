// Runs the current event's art: its still layer, painted once, and its live bits every frame.
import { ctx, cv } from "./canvas.js";
import { season } from "./seasons.js";
import { drawParticles } from "./weather.js";
import { dc, partyYear, setDc } from "./art.js";
import { stillHasEvent } from "./scene.js";
import christmas from "./events/christmas.js";
import halloween from "./events/halloween.js";
import thanksgiving from "./events/thanksgiving.js";
import valentine from "./events/valentine.js";
import stpatrick from "./events/stpatrick.js";
import easter from "./events/easter.js";
import newyear from "./events/newyear.js";

export const EVENT_ART = {
  christmas,
  halloween,
  thanksgiving,
  valentine,
  stpatrick,
  easter,
  newyear,
};
export const eventLayer = document.createElement("canvas");
eventLayer.width = cv.width; eventLayer.height = cv.height;
let eventLayerKey = null;
export function paintEventLayer(art) {
  const key = `${season}|${partyYear()}`;
  if (eventLayerKey === key) return;
  const lc = eventLayer.getContext("2d");
  lc.clearRect(0, 0, eventLayer.width, eventLayer.height);
  const real = dc;
  setDc(lc);
  try { art.still(); } finally { setDc(real); }
  eventLayerKey = key;
  eventLayer.v = (eventLayer.v ?? 0) + 1;
}
function drawEvent(now) {
  const art = EVENT_ART[season];
  if (!art) return;
  if (!stillHasEvent) ctx.drawImage(eventLayer, 0, 0);
  art.live(now);
}
// Things on the hero's counter, drawn after the counter itself.
export function drawEventCounter(now) { EVENT_ART[season]?.counter?.(now); }
export function drawSeason(now) {
  drawEvent(now);
  drawParticles(now);
}
