// THE BUILDING: one tile per floor, the top floor first and the first floor at the bottom, each with its name, its HQ,
// what it counts (needs you, blocked, working, lanes) and a red mark when its HQ isn't receiving. A tile's picture is
// a small plan of its office, drawn once and again only when its lanes or its colour change: no live canvas, no
// frame loop. A click enters the floor (floors/index.js). Adapted from the building in PR #8 by Aleksander.
import { esc, setHTML } from "../core/format.js";
import { floorLabel, floorsOf } from "../core/floors.js";
import { STATUS_TEXT } from "../core/status.js";

const MAP_W = 64, MAP_H = 30, SEATS = 30;
const drawn = new Map(); // floor id -> what its plan was drawn from

// The plan: desks with a figure per lane in its status colour, a red pixel over one that waits on you or is blocked,
// and the floor's HQ at its terminal on the right.
function paintMap(c, f, lanes) {
  const key = `${f.color}|${lanes.map((l) => `${l.name}:${l.status}`).join(",")}`;
  if (drawn.get(f.id) === key && c.dataset.drawn) return;
  drawn.set(f.id, key);
  c.dataset.drawn = "1";
  const g = c.getContext("2d");
  const r = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  r(0, 0, MAP_W, MAP_H, "#eadfc4");
  r(51, 0, MAP_W - 51, MAP_H, "#cfe0e6");
  r(0, 0, MAP_W, 4, f.color);
  r(0, 4, MAP_W, 1, "#56688a");
  lanes.slice(0, SEATS).forEach((l, i) => {
    const x = 2 + (i % 10) * 5, y = 8 + Math.floor(i / 10) * 7;
    const color = ["done", "parked"].includes(l.status) ? "#a8a8b8" : STATUS_TEXT[l.status]?.[1] ?? "#6a6a82";
    r(x, y + 4, 4, 2, "#9a6a3a");
    r(x + 1, y, 2, 2, "#f2c79a");
    r(x + 1, y + 2, 2, 2, color);
    if (l.status === "needs_you" || l.status === "blocked" || l.asks) r(x + 1, y - 2, 2, 1, "#d63c3c");
  });
  r(54, 11, 4, 4, "#1d2733");
  r(55, 12, 2, 1, "#3ee08f");
  r(59, 10, 2, 2, "#f2c79a");
  r(59, 12, 2, 3, f.color);
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
function infoHTML(f) {
  const c = f.counts ?? {};
  const counts = [
    `<span class="${c.needsYou ? "hot" : ""}">${plural(c.needsYou ?? 0, "NEEDS YOU", "NEED YOU")}</span>`,
    `<span class="${c.blocked ? "hot" : ""}">${c.blocked ?? 0} BLOCKED</span>`,
    `<span>${c.working ?? 0} WORKING</span>`,
    `<span>${plural(c.lanes ?? 0, "LANE", "LANES")}</span>`,
  ].join(" · ");
  return `<span class="finfo"><span class="fhead"><b class="fname">${esc(floorLabel(f))}</b><span class="fhq">HQ: ${esc(f.hq)}</span></span><span class="fcounts">${counts}</span></span>`
    + (f.receiving === false ? `<span class="fdown" title="${esc(f.reason ?? "")}">HQ ISN'T RECEIVING</span>` : "");
}

export function renderTiles(box, S) {
  const floors = [...floorsOf(S)].reverse();
  const ids = floors.map((f) => f.id).join(",");
  if (box.dataset.ids !== ids) {
    box.dataset.ids = ids;
    box.replaceChildren(...floors.map((f) => {
      const t = document.createElement("button");
      t.type = "button";
      t.className = "ftile";
      t.dataset.floor = t.dataset.floorGo = f.id;
      t.innerHTML = `<canvas class="fmap" width="${MAP_W}" height="${MAP_H}" aria-hidden="true"></canvas><span class="fbody"></span>`;
      return t;
    }));
    for (const id of [...drawn.keys()]) if (!floors.some((f) => f.id === id)) drawn.delete(id);
  }
  for (const f of floors) {
    const t = box.querySelector(`[data-floor-go="${CSS.escape(f.id)}"]`);
    t.style.setProperty("--fc", f.color);
    t.setAttribute("aria-label", `Go into the ${f.name} floor`);
    setHTML(t.querySelector(".fbody"), infoHTML(f));
    paintMap(t.querySelector(".fmap"), f, (S.lanes ?? []).filter((l) => l.floor === f.id));
  }
}
