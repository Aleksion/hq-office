// SETTINGS · FLOORS: every floor with its colour, name and HQ; add one (a name, its HQ: one of herdr's live agents
// that runs no floor, or a name typed, and a colour from a fixed palette), rename it, recolour it, give it another HQ,
// or remove an empty one after a confirm in the page (never a browser dialog). Uses the floor routes (docs/floors.md).
import { on } from "../core/bus.js";
import { $, toast } from "../core/dom.js";
import { post } from "../core/net.js";
import { esc } from "../core/format.js";
import { S } from "../core/state.js";
import { floorLabel, floorsOf } from "../core/floors.js";

export const FLOOR_COLORS = ["#3c6fd6", "#2f9e57", "#e0901e", "#b0469a", "#d63c3c", "#1abc9c", "#7a4fc9", "#6a6a82"];
const TYPE = "__type";
// The open form: { mode: "add" | "edit", id, name, hq, typed, color, confirm }; null when none is open.
let form = null;

const slug = (name) => name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32).replace(/-+$/, "");
// herdr's live agents that are not lanes (untracked in /api/state; the page's stream leaves them out, so the form
// reads them once when it opens), less those that run another floor.
let untracked = [];
function readAgents() {
  fetch("/api/state").then((r) => r.json()).then((s) => {
    untracked = s.untracked ?? [];
    if (!form || form.typed) return;
    keep();
    if (!form.hq) form.hq = liveAgents(form.id)[0] ?? "";
    redraw();
  }).catch(() => {});
}
function liveAgents(except) {
  const taken = new Set(floorsOf(S).filter((f) => f.id !== except).map((f) => f.hq));
  return [...new Set(untracked.map((a) => a.name).filter((n) => n && !taken.has(n)))].sort();
}
const removable = (f) => floorsOf(S).length > 1 && !f.counts?.lanes && !f.counts?.needsYou;

function formHTML() {
  const f = form.mode === "edit" ? floorsOf(S).find((x) => x.id === form.id) : null;
  const agents = liveAgents(form.id);
  const typed = form.typed || !agents.length || (!!form.hq && !agents.includes(form.hq));
  const hq = typed
    ? `<input class="levels" name="hqText" maxlength="64" spellcheck="false" autocomplete="off" placeholder="its name in herdr" value="${esc(form.hq)}" aria-label="HQ agent">${agents.length ? `<button class="btn-s" type="button" data-floor-pick>PICK</button>` : ""}`
    : `<select class="levels" name="hq" aria-label="HQ agent">${agents.map((a) => `<option value="${esc(a)}"${a === form.hq ? " selected" : ""}>${esc(a)}</option>`).join("")}<option value="${TYPE}">TYPE A NAME…</option></select>`;
  const colors = FLOOR_COLORS.includes(form.color) ? FLOOR_COLORS : [...FLOOR_COLORS, form.color];
  const confirm = form.confirm && f
    ? `<div class="fconfirm" data-floor-confirm><span>Remove ${esc(floorLabel(f))}? What it leaves (answered questions, updates, notes, the log) moves to the first floor.</span><button class="btn-s" type="button" data-floor-rm-no>KEEP IT</button><button class="btn-s danger" type="button" data-floor-rm-yes>REMOVE IT</button></div>`
    : "";
  return `<form class="fform" data-floor-form>
      <label class="frow2"><span class="sk">NAME</span><input class="levels" name="name" maxlength="40" spellcheck="false" autocomplete="off" value="${esc(form.name)}" aria-label="Floor name"></label>
      <div class="frow2"><span class="sk">HQ</span>${hq}</div>
      <div class="frow2"><span class="sk">COLOUR</span><div class="opts2">${colors.map((c) => `<button class="fcolor${c === form.color ? " on" : ""}" type="button" data-color="${esc(c)}" style="background:${esc(c)}" aria-label="Colour ${esc(c)}" aria-pressed="${c === form.color}"></button>`).join("")}</div></div>
      <div class="opts2"><button class="btn-s on" type="submit" data-floor-save>${form.mode === "add" ? "ADD FLOOR" : "SAVE"}</button><button class="btn-s" type="button" data-floor-cancel>CANCEL</button>${f ? `<button class="btn-s" type="button" data-floor-rm ${removable(f) ? "" : "disabled"} title="${removable(f) ? "Remove this floor" : "Only an empty floor can go: move its lanes first (hud lane NAME --floor OTHER)"}">REMOVE</button>` : ""}</div>
      ${confirm}
    </form>`;
}

export function floorsRow() {
  const rows = floorsOf(S).map((f) => form?.mode === "edit" && form.id === f.id
    ? formHTML()
    : `<div class="frow" data-floor-row="${esc(f.id)}"><i class="fsw" style="background:${esc(f.color)}"></i><b>${esc(floorLabel(f))}</b><span class="fh">HQ: ${esc(f.hq)} · ${f.counts?.lanes ?? 0} ${f.counts?.lanes === 1 ? "LANE" : "LANES"}</span><button class="btn-s" type="button" data-floor-edit>EDIT</button></div>`).join("");
  const add = form?.mode === "add" ? formHTML() : `<div class="opts2"><button class="btn-s" type="button" data-floor-add>+ ADD A FLOOR</button></div>`;
  return `<div class="srow" data-floors><span class="k">FLOORS</span><div class="flist">${rows}</div>${add}<span class="hint">A floor is one HQ agent and everything it runs. With two or more, the office becomes a building.</span></div>`;
}
function redraw() {
  const el = document.querySelector("#settings [data-floors]");
  if (el) el.outerHTML = floorsRow();
}
// What is typed stays in the form while it redraws.
function keep() {
  const el = document.querySelector("#settings [data-floor-form]");
  if (!el || !form) return;
  form.name = el.elements.name.value;
  if (el.elements.hqText) form.hq = el.elements.hqText.value.trim();
  else if (el.elements.hq && el.elements.hq.value !== TYPE) form.hq = el.elements.hq.value;
}

async function save() {
  keep();
  const name = form.name.trim(), hq = form.hq.trim();
  if (!name) { toast("GIVE THE FLOOR A NAME"); return; }
  if (!hq) { toast("NAME ITS HQ AGENT"); return; }
  try {
    if (form.mode === "add") {
      const id = slug(name);
      if (!id) { toast("A NAME WITH LETTERS OR DIGITS"); return; }
      await post("/api/floors", { id, name, hq, color: form.color });
    } else await post(`/api/floors/${encodeURIComponent(form.id)}`, { name, hq, color: form.color });
    form = null;
    redraw();
  } catch (err) { toast(err.message); }
}

const panel = $("settings");
panel.addEventListener("submit", (e) => {
  if (!e.target.closest("[data-floor-form]")) return;
  e.preventDefault();
  save();
});
panel.addEventListener("input", (e) => { if (e.target.closest("[data-floor-form]")) keep(); });
panel.addEventListener("change", (e) => {
  if (e.target.name === "hq" && e.target.value === TYPE) { keep(); form.typed = true; form.hq = ""; redraw(); panel.querySelector("[name=hqText]")?.focus(); }
});
panel.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-floor-add], [data-floor-edit], [data-floor-cancel], [data-color], [data-floor-pick], [data-floor-rm], [data-floor-rm-no], [data-floor-rm-yes]");
  if (!t) return;
  if (t.matches("[data-floor-add]")) {
    const used = new Set(floorsOf(S).map((f) => f.color));
    form = { mode: "add", id: null, name: "", hq: liveAgents(null)[0] ?? "", typed: false, color: FLOOR_COLORS.find((c) => !used.has(c)) ?? FLOOR_COLORS[0], confirm: false };
    readAgents();
  } else if (t.matches("[data-floor-edit]")) {
    const f = floorsOf(S).find((x) => x.id === t.closest("[data-floor-row]").dataset.floorRow);
    form = { mode: "edit", id: f.id, name: f.name, hq: f.hq, typed: false, color: f.color, confirm: false };
    readAgents();
  } else if (t.matches("[data-floor-cancel]")) form = null;
  else if (t.matches("[data-color]")) { keep(); form.color = t.dataset.color; }
  else if (t.matches("[data-floor-pick]")) { keep(); form.typed = false; form.hq = ""; }
  else if (t.matches("[data-floor-rm]")) { keep(); form.confirm = true; }
  else if (t.matches("[data-floor-rm-no]")) form.confirm = false;
  else if (t.matches("[data-floor-rm-yes]")) {
    try { await post(`/api/floors/${encodeURIComponent(form.id)}`, { rm: true }); form = null; } catch (err) { toast(err.message); form.confirm = false; }
  }
  redraw();
});
// The rows follow the state while the panel is open (a floor added by HQ, its lanes, its HQ), except while a field
// in the form is being typed in.
on("state", () => {
  const el = !panel.hidden && panel.querySelector("[data-floors]");
  if (!el || (el.contains(document.activeElement) && document.activeElement.matches("input, select"))) return;
  if (form?.mode === "edit" && !floorsOf(S).some((f) => f.id === form.id)) form = null;
  const html = floorsRow();
  if (el.outerHTML !== html) el.outerHTML = html;
});
