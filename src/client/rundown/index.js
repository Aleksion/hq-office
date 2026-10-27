// RUNDOWN: a brief the owner can go to. A button in the stage bar opens a panel over the room that lists, for each floor in
// scope, who needs help there and each open project with its state, owner, open calls and brief (core/floors.js rundown).
// The briefs are fetched when the panel opens, for the projects that have one. It takes turns with the other panels over the
// room ("panel"), and Escape, its button or BACK TO THE ROOM close it. It never covers the questions.
import { on } from "../core/bus.js";
import { S } from "../core/state.js";
import { closePanel, showPanel } from "../core/panel.js";
import { view } from "../core/scope.js";
import { HELP_COLORS, floorTagShown, rundown } from "../core/floors.js";
import { esc, setHTML } from "../core/format.js";

const room = document.querySelector(".room");
const panel = document.createElement("section");
panel.id = "rundownPanel";
panel.className = "rundownp";
panel.setAttribute("aria-label", "Rundown");
room.append(panel);

const button = document.createElement("button");
button.type = "button";
button.className = "btn place";
button.id = "rundownBtn";
button.textContent = "RUNDOWN";
button.setAttribute("aria-pressed", "false");
document.querySelector(".stageslot")?.append(button);

let open = false;
const briefs = {}; // slug -> the brief's text, as last fetched
const fetched = {}; // slug -> the room's rev it was fetched at

async function fetchBrief(slug, rev) {
  if (fetched[slug] === rev) return;
  fetched[slug] = rev;
  try {
    const res = await fetch(`/api/rooms/${encodeURIComponent(slug)}`);
    if (!res.ok) throw new Error(String(res.status));
    briefs[slug] = (await res.json()).brief ?? "";
    render();
  } catch {
    delete fetched[slug]; // the next state tries again
  }
}

const dots = (help) => help.map((h) => `<i class="dot" style="background:${HELP_COLORS[h.state]}" title="${esc(h.lane)}"></i>`).join("");
const project = (p) => `<div class="rproj"><div class="rhead"><b>${esc(p.title)}</b><span class="tag st" style="background:${p.color}">${esc(p.name)}</span>${p.calls ? `<span class="tag count">${p.calls} OPEN CALL${p.calls > 1 ? "S" : ""}</span>` : ""}<span class="tag lane">${esc(p.owner)}</span></div>${p.brief ? `<p class="rbrief">${esc(p.brief)}</p>` : ""}<div class="racts"><button class="btn" type="button" data-project="${esc(p.slug)}">PROJECT</button><a class="btn go" href="#room/${esc(p.slug)}">ROOM</a></div></div>`;

function render() {
  room.classList.toggle("rundown-open", open);
  button.classList.toggle("on", open);
  button.setAttribute("aria-pressed", String(open));
  if (!open || !S) return void setHTML(panel, "");
  const floors = rundown(S, view(), briefs), tagged = floorTagShown(S);
  for (const f of floors) for (const p of f.projects) {
    const r = S.rooms.find((x) => x.slug === p.slug);
    if (r?.briefAt) fetchBrief(r.slug, r.rev);
  }
  setHTML(panel, `<div class="rdhdr"><h2>RUNDOWN</h2><button class="btn" type="button" data-rundown-close>BACK TO THE ROOM</button></div>${floors.map((f) => `<div class="box rdfloor"><h3>${tagged ? `<span class="tag floortag" style="background:${f.color}">${esc(f.label)}</span>` : ""}${dots(f.help)}</h3>${f.projects.length ? f.projects.map(project).join("") : `<p class="rnone">NO PROJECTS</p>`}</div>`).join("")}`);
}

on("panel", (id) => { open = id === "rundown"; render(); });
on("state", render);
on("scope", render);
// A conference room opening covers the floor, and the panel with it.
on("stage", (shown) => { if (shown !== "office") closePanel("rundown"); });

button.addEventListener("click", () => (open ? closePanel("rundown") : showPanel("rundown")));
panel.addEventListener("click", (e) => {
  if (e.target.closest("[data-rundown-close]")) closePanel("rundown");
});
