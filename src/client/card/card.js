// The worker card: the selected lane's status, links and open asks.
import { $ } from "../core/dom.js";
import { CONFIG, S } from "../core/state.js";
import { selected } from "../room/input.js";
import { STATUS_TEXT } from "../core/status.js";
import { dur, esc, setHTML } from "../core/format.js";
import { linkify } from "../core/text.js";
import { hasTree } from "../room/looks.js";

export function renderCard() {
  const card = $("card");
  const lane = S?.lanes.find((l) => l.name === selected);
  if (!lane) {
    setHTML(card, `<h3>CLICK A WORKER</h3><div class="sub">Each worker is one lane. Click one to see what it does, where it is, and what it waits on.</div>`);
    return;
  }
  const [label, color] = STATUS_TEXT[lane.status] || [lane.status, "#6a6a82"];
  const asks = S.open.filter((a) => a.lane === lane.name);
  const links = [
    ...(lane.issue && CONFIG.linearWorkspace ? lane.issue.split(/[ ,]+/).filter(Boolean).map((i) => `<a class="tag" href="https://linear.app/${esc(CONFIG.linearWorkspace)}/issue/${esc(i)}" target="_blank" rel="noopener">${esc(i)}</a>`) : []),
    ...(lane.pr && CONFIG.githubRepo ? String(lane.pr).split(/[ ,]+/).filter(Boolean).map((p) => `<a class="tag" href="https://github.com/${CONFIG.githubRepo}/pull/${esc(p.replace("#", ""))}" target="_blank" rel="noopener">#${esc(p.replace("#", ""))}</a>`) : []),
    ...(lane.issue && !CONFIG.linearWorkspace ? lane.issue.split(/[ ,]+/).filter(Boolean).map((i) => `<span class="tag">${esc(i)}</span>`) : []),
    ...(lane.pr && !CONFIG.githubRepo ? String(lane.pr).split(/[ ,]+/).filter(Boolean).map((p) => `<span class="tag">#${esc(p.replace("#", ""))}</span>`) : []),
    lane.machine ? `<span class="tag">${esc(lane.machine)} ${esc(lane.pane || "")}</span>` : "",
  ].join("");
  // Where it sits in the tree, once there is one: its level and the chain up to HQ (each step selects that lane).
  const tree = hasTree(S.lanes) ? `<div class="path"><span class="tag level">${esc(String(lane.level || "").toUpperCase())}</span><span class="chain">HQ${(lane.path || []).map((p) => ` &gt; <button class="up" data-select="${esc(p)}">${esc(p)}</button>`).join("")} &gt; <b>${esc(lane.name)}</b></span></div>` : "";
  setHTML(card, `<h3>${esc(lane.name)}</h3>
    <div class="sub">${esc(lane.title || "")}</div>${tree}
    <div class="row"><span class="status" style="background:${color}">${esc(label.toUpperCase())}</span>${lane.herdr_since ? `<span class="tag">FOR <span data-since="${lane.herdr_since}">${dur(Date.now() - lane.herdr_since)}</span></span>` : ""}${links}</div>
    ${lane.note ? `<div class="note">${linkify(lane.note)}</div>` : ""}
    ${asks.length ? `<div class="row">${asks.map((a) => `<button class="tag lane" data-select="${esc(lane.name)}">ANSWER: ${esc(a.title.slice(0, 40))}${a.title.length > 40 ? "…" : ""}</button>`).join("")}</div>` : ""}`);
}
