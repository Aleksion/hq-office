// The project panel: one project (a conference room) as a glance, over the room in the accounts panel's place. Its state, a way
// into its room, its pull requests with their board state, what is on its shelf, and who is on it. A frame on the wall, a
// question's PROJECT tag or a link opens it ("panel", "project", { slug });
// another panel opening, Escape or BACK TO THE ROOM closes it. It never covers the questions.
import { emit, on } from "../core/bus.js";
import { CONFIG, S } from "../core/state.js";
import { closePanel, showPanel } from "../core/panel.js";
import { floorTag, projectView } from "../core/floors.js";
import { STATUS_TEXT } from "../core/status.js";
import { esc, setClass, setHTML } from "../core/format.js";
import { shelfLoader } from "./shelf.js";

const room = document.querySelector(".room");
const panel = document.createElement("section");
panel.id = "projectPanel";
panel.className = "projectp";
panel.setAttribute("aria-label", "Project");
room.append(panel);

let slug = null; // the project shown
const shelf = shelfLoader(async (s) => {
  const res = await fetch(`/api/rooms/${encodeURIComponent(s)}`);
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()).artifactList ?? [];
}, () => render());

const KIND = { "claude-artifact": "CLAUDE ARTIFACT", link: "LINK", file: "FILE", image: "IMAGE" };
const laneRow = (l) => {
  const [label, color] = STATUS_TEXT[l.status] ?? [l.status ?? "Not registered", "#6a6a82"];
  return `<div class="lrow"><i class="dot" style="background:${color}"></i><b>${esc(l.name)}</b>${l.owner ? `<span class="tag in">OWNER</span>` : ""}<span class="d">${esc(l.title)}</span><span class="tag">${esc(label.toUpperCase())}</span></div>`;
};
const prMark = (p) => (!p ? "" : p.state === "MERGED" ? " MERGED" : p.state === "CLOSED" ? " CLOSED" : p.draft ? " DRAFT" : p.ci === "running" ? " CI…" : p.ci === "failed" ? " CI ✗" : p.state === "OPEN" ? " OPEN" : "");
const BOARD = { stalled: "STALLED", owner: "WAITING ON YOU", ci: "WAITING ON CI", moving: "MOVING", paused: "PAUSED", done: "DONE", blocked: "BLOCKED" };
const tagOf = (cls, href, text) => (href ? `<a class="tag ${cls}" href="${esc(href)}" target="_blank" rel="noopener">${esc(text)}</a>` : `<span class="tag ${cls}">${esc(text)}</span>`);

function render() {
  const v = slug && S ? projectView(S, CONFIG, slug) : null;
  if (slug && S && !v) { closePanel("project"); return; } // the room is gone or archived
  room.classList.toggle("project-open", !!v);
  if (!v) return void setHTML(panel, "");
  const r = v.room, fl = floorTag(S, { lane: r.owner });
  const sh = shelf.of(r), art = sh?.list ?? null;
  setClass(panel, "projectp");
  setHTML(panel, `<div class="phdr"><div class="ptitle"><h2>${esc(r.title)}</h2><span class="tag st" style="background:${v.color}">${esc(v.name)}</span>${fl ? `<span class="tag floortag" style="background:${fl.color}">${esc(fl.label)}</span>` : ""}${v.issues.map((i) => tagOf("key", i.href, i.key)).join("")}</div><button class="btn" type="button" data-project-close>BACK TO THE ROOM</button></div>
    <div class="box pgrp"><h3>ROOM</h3><a class="btn go" href="#room/${esc(r.slug)}">OPEN THE ROOM</a>${r.unread ? `<span class="tag new">${r.unread} NEW</span>` : ""}</div>
    <div class="box pgrp"><h3>PULL REQUESTS · ${v.prs.length}</h3><div class="pwork">${v.prs.map((p) => `<span class="rwork">${tagOf("pr", p.href, `#${p.num}${prMark(p.pr)}`)}${p.board ? `<span class="tag ws ${esc(p.board.state)}" title="${esc(p.board.why)}">${BOARD[p.board.state] ?? ""}</span>` : ""}</span>`).join("")}</div></div>
    <div class="box pgrp"><h3>ARTIFACTS${art ? ` · ${art.length}` : sh?.failed ? " · COULDN'T LOAD" : ""}</h3><div class="shelf">${(art ?? []).map((a) => `<a class="shelfc" href="${esc(a.url)}" target="_blank" rel="noopener"><span class="tag">${esc(KIND[a.kind] ?? "LINK")}</span>${esc(a.title)}</a>`).join("")}</div></div>
    <div class="box pgrp"><h3>WHO IS ON IT</h3>${v.lanes.map(laneRow).join("")}</div>`);
}

on("panel", (id, detail) => {
  const was = slug;
  slug = id === "project" ? detail?.slug ?? null : null;
  if (slug) emit("room:leave"); // a conference room covers the floor: step out of it (rooms/ does)
  if (slug !== was) shelf.reset();
  else if (slug) shelf.retry();
  render();
});
on("state", render);
// A conference room opening covers the floor, and the panel with it.
on("stage", (shown) => { if (shown !== "office") closePanel("project"); });

panel.addEventListener("click", (e) => {
  if (e.target.closest("[data-project-close]")) closePanel("project");
});
document.addEventListener("click", (e) => {
  const p = e.target.closest("[data-project]");
  if (p) showPanel("project", { slug: p.dataset.project });
});
