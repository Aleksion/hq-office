// HQ's queue in the top bar: how many messages wait for HQ, how long the oldest has waited, and whether any is urgent.
// The box is an alarm when an item is urgent or has waited more than 30 minutes. It is added beside the other top-bar
// boxes and holds no question, so it can never push an open question out of view.
import { on } from "../core/bus.js";
import { S } from "../core/state.js";
import { esc, setClass, setHTML } from "../core/format.js";

const ALARM_MS = 30 * 60_000;
const box = document.createElement("div");
box.id = "sQueue";
box.className = "box queue";
box.hidden = true;
document.querySelector(".top .right .spacer")?.before(box);

const mins = (ms) => { const m = Math.max(0, Math.floor(ms / 60_000)); return m < 60 ? `${m}M` : `${Math.floor(m / 60)}H${String(m % 60).padStart(2, "0")}`; };
let timer = null;

function render() {
  const q = S?.queue ?? null;
  clearTimeout(timer);
  box.hidden = !q || !q.count;
  if (box.hidden) return;
  const age = Date.now() - q.oldest;
  const alarm = q.urgent > 0 || age > ALARM_MS;
  setClass(box, "box queue" + (alarm ? " alarm" : ""));
  setHTML(box, `<span class="k">${esc(q.lead.toUpperCase())} QUEUE</span><span class="v"><b>${q.count}</b> · OLDEST ${mins(age)}${q.urgent ? ` · <em>${q.urgent} URGENT</em>` : ""}</span>`);
  box.title = `${q.count} waiting for ${q.lead}. Read them with: hud req next`;
  // The age is in minutes: wake at the next one, and not while the page is hidden.
  if (!document.hidden) timer = setTimeout(render, 60_000 - (age % 60_000) + 5);
}
on("state", render);
document.addEventListener("visibilitychange", render);
