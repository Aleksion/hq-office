// The layer over the room and the project panel, in Chrome, on the floors fixture (test/floors-fixture.ts) at 1440 and at 390: project frames on
// the wall, markers beside the agents that need help, the NEED HELP strip under the floor, and the two new legend rows.
// With one floor the room is in a scene of its own and the page is otherwise today's. Needs Chrome (CHROME_BIN); skipped
// without it. Written against the fixture's FACTS; not yet run.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { findChrome, newSession, startChrome } from "../../scripts/room-hash.ts";
import { FACTS, startFloors } from "../floors-fixture.ts";

const chromeFound = !!findChrome();
let chrome: Awaited<ReturnType<typeof startChrome>>;
let general: Awaited<ReturnType<typeof startFloors>>;
let single: Awaited<ReturnType<typeof startFloors>>;
let page: Awaited<ReturnType<typeof newSession>>;
const errors: string[] = [];
const until = async (expr: string, ms = 10_000) => {
  for (const end = Date.now() + ms; Date.now() < end; await Bun.sleep(50)) if (await page.evaluate(expr).catch(() => false)) return true;
  throw new Error(`timed out waiting for ${expr}`);
};
const ev = (expr: string) => page.evaluate(expr);
const click = (sel: string) => ev(`document.querySelector(${JSON.stringify(sel)}).click()`);
const press = (key: string) => ev(`document.body.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(key)}, bubbles: true }))`);
const scopeOf = () => ev(`JSON.parse(sessionStorage.getItem("hq-scope") ?? "null")`);
const shown = (sel: string) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!e && !e.hidden && getComputedStyle(e).display !== "none"; })()`);
const SIZES: [number, number][] = [[1440, 900], [390, 844]];
// The layer of a floor: the frames hung and the agents marked, as the page says it drew them.
const layer = (id: string) => ev(`(() => { const l = document.querySelector('.layer[data-floor="${id}"]'); return l && { frames: l.dataset.frames.split(" ").filter(Boolean), marks: l.dataset.marks.split(" ").filter(Boolean), hits: l.querySelectorAll(".hit").length }; })()`) as Promise<{ frames: string[]; marks: string[]; hits: number } | null>;
// What the markers are not allowed to cover, in the scene's units, read from the floor's own room modules.
const KEEP_OFF = (id: string) => `(async () => {
  const mod = await import(${id === "hq" ? `"/src/client/room/floor.js"` : `"/floor/${id}/src/client/room/floor.js"`});
  const place = await import("/src/client/layer/place.js");
  const c = document.querySelector(${JSON.stringify(id === "hq" ? "canvas#room" : `canvas#room-${id}`)}).getBoundingClientRect();
  const sprites = mod.floor.positions(), labels = mod.floor.labels();
  const avoid = [...labels, ...sprites.map((p) => place.figure(p.sx, p.sy)), place.figure(place.TERMINAL.sx, place.TERMINAL.sy)];
  const marks = [...document.querySelectorAll('.layer[data-floor="${id}"] .hit.agent')].map((b) => {
    const r = b.getBoundingClientRect();
    return { lane: b.dataset.select, x: ((r.left - c.left) / c.width) * place.RW, y: ((r.top - c.top) / c.height) * place.RH, w: (r.width / c.width) * place.RW, h: (r.height / c.height) * place.RH };
  });
  return marks.map((m) => ({ lane: m.lane, over: avoid.filter((a) => place.meets(a, m, -0.5)).length }));
})()`;

async function open(base: string, width: number, height: number) {
  const phone = width < 600;
  await page.s("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: phone });
  await page.s("Emulation.setTouchEmulationEnabled", { enabled: phone, maxTouchPoints: 5 });
  for (let i = 0; i < 2; i++) {
    await page.s("Page.navigate", { url: "about:blank" });
    await page.s("Page.navigate", { url: `${base}/` });
    await until(`!!document.getElementById("card")?.innerHTML`);
    if (!i) await ev(`sessionStorage.clear()`);
  }
}

beforeAll(async () => {
  if (!chromeFound) return;
  chrome = await startChrome();
  general = await startFloors();
  single = await startFloors({ general: false });
  page = await newSession(chrome.cdp, errors);
}, 60_000);

afterAll(async () => {
  await general?.stop();
  await single?.stop();
  await chrome?.close();
});

for (const [width, height] of SIZES) {
  const at = `${width}`;
  // Who needs help, by floor, worst first. The generals are idle in herdr with nothing asked of them: waiting on HQ, a
  // general's normal state, so neither is marked at its terminal (core/floors.js generalNeedsHelp).
  const MARKS = { hq: [FACTS.blocked, "hq-ops"], fin: [FACTS.stalled], sales: ["sales-outb"] } as Record<string, string[]>;

  test.skipIf(!chromeFound)(`${at}: zoomed out, every floor hangs its projects and marks everyone who needs help, with no buttons`, async () => {
    await open(general.base, width, height);
    await until(`document.querySelectorAll(".building .tile").length === 3 && document.querySelectorAll(".layer").length === 3`);
    await Bun.sleep(600);
    for (const id of FACTS.floors) {
      const l = await layer(id);
      expect({ id, frames: l?.frames, marks: l?.marks, hits: l?.hits }).toEqual({ id, frames: FACTS.rooms[id as keyof typeof FACTS.rooms], marks: MARKS[id], hits: 0 });
    }
    // the layer lies over its canvas, to the pixel, and paints something
    expect(await ev(`[...document.querySelectorAll(".layer")].every((l) => {
      const a = l.getBoundingClientRect(), c = l.parentElement.querySelector(":scope > canvas").getBoundingClientRect();
      const g = l.querySelector("canvas").getContext("2d");
      return Math.abs(a.left - c.left) < 1 && Math.abs(a.top - c.top) < 1 && Math.abs(a.width - c.width) < 1 && Math.abs(a.height - c.height) < 1 && g.getImageData(0, 0, 384 * 3, 256 * 3).data.some((v, i) => i % 4 === 3 && v > 0);
    })`)).toBe(true);
    // the legend is hidden zoomed out, and the room's own click still zooms in
    expect(await shown(".room .legend")).toBe(false);
  }, 60_000);

  test.skipIf(!chromeFound)(`${at}: zoomed in, frames and markers are buttons, a marker chooses its agent, and no marker covers a name or a figure`, async () => {
    await open(general.base, width, height);
    await until(`document.querySelectorAll(".building .tile").length === 3`);
    await click(`.tile[data-floor="fin"] .tlabel`);
    await until(`document.querySelector(".room").dataset.stage === "in"`);
    await until(`document.querySelectorAll('.layer[data-floor="fin"] .hit').length === ${1 + MARKS.fin.length}`);
    const frame = await ev(`document.querySelector('.layer[data-floor="fin"] .hit.frame').getAttribute("aria-label")`);
    expect(frame).toBe("Reconcile March: STALLED");
    // zoomed in a worker waiting on you keeps main's own "!" and gets no second sign: only blocked and stalled are marked
    expect(await ev(`[...document.querySelectorAll('.layer[data-floor="fin"] .hit.agent')].map((b) => b.dataset.state + ":" + b.dataset.select)`)).toEqual([`stalled:${FACTS.stalled}`]);
    expect((await ev(KEEP_OFF("fin"))) as any[]).toEqual(MARKS.fin.map((lane) => ({ lane, over: 0 })));
    // the legend names the two new signs
    expect(await ev(`document.querySelector(".room .legend").textContent`)).toMatch(/BLOCKED.*STALLED/);
    await click(`.layer[data-floor="fin"] .hit.agent[data-select="${FACTS.stalled}"]`);
    await until(`document.querySelector(".scopechip")?.textContent === "FIN FLOOR › ${FACTS.stalled} ✕"`);
    expect(await ev(`document.querySelector("#card h3").textContent`)).toBe(FACTS.stalled);
    expect(await scopeOf()).toEqual({ floor: "fin", agent: FACTS.stalled, all: false });
  }, 60_000);

  test.skipIf(!chromeFound)(`${at}: NEED HELP lists the scope's agents, a row chooses its agent, and nobody needing help reads 0 and is disabled`, async () => {
    await open(general.base, width, height);
    await until(`document.querySelectorAll(".building .tile").length === 3 && !!document.querySelector(".needhelp .lrow")`);
    // unscoped: every agent that needs help, worst first (the idle generals wait on HQ, which is no call for help)
    expect(await ev(`document.querySelector(".needhelp h3").textContent`)).toBe("4 NEED HELP");
    expect(await ev(`[...document.querySelectorAll(".needhelp .lrow")].map((r) => r.dataset.select)`)).toEqual([FACTS.blocked, "hq-ops", "sales-outb", FACTS.stalled]);
    // it sits between the floor and the worker card, and nothing is pushed off the page sideways
    expect(await ev(`(() => { const s = document.querySelector(".needhelp").getBoundingClientRect(), r = document.querySelector(".room").getBoundingClientRect(), u = document.querySelector(".under").getBoundingClientRect(); return s.top >= r.bottom - 1 && u.top >= s.bottom - 1; })()`)).toBe(true);
    expect(await ev(`document.documentElement.scrollWidth <= innerWidth`)).toBe(true);
    // scoped to FIN: its one agent; the row keeps the floor
    await click(`.tile[data-floor="fin"] .tlabel`);
    await until(`document.querySelector(".needhelp h3")?.textContent === "1 NEED HELP"`);
    await click(`.needhelp .lrow[data-select="${FACTS.stalled}"]`);
    await until(`document.querySelector(".scopechip")?.textContent === "FIN FLOOR › ${FACTS.stalled} ✕"`);
    // an agent that needs nothing: 0 NEED HELP, disabled, and pressing it moves nothing
    await click(`#hud .ask[data-lane="fin-audit"] .tag.lane`);
    await until(`document.querySelector(".scopechip")?.textContent === "FIN FLOOR › fin-audit ✕"`);
    await until(`document.querySelector(".needhelp .helpzero")?.textContent === "0 NEED HELP"`);
    expect(await ev(`document.querySelector(".needhelp .helpzero").disabled`)).toBe(true);
    await ev(`document.querySelector(".needhelp .helpzero").click()`);
    expect(await scopeOf()).toEqual({ floor: "fin", agent: "fin-audit", all: false });
    // the questions are as many and as easy to reach as before
    expect(await ev(`(() => { const a = document.querySelector("#hud .ask"), h = document.getElementById("hud").getBoundingClientRect(); return !!a && a.getBoundingClientRect().top >= h.top - 1; })()`)).toBe(true);
  }, 60_000);

  // ---- U11: the project panel, links on a question, and more ways into rooms ----
  const frameLabels = (id: string) => ev(`[...document.querySelectorAll('.layer[data-floor="${id}"] .hit.frame')].map((b) => b.getAttribute("aria-label"))`) as Promise<string[]>;
  const panelHeads = () => ev(`[...document.querySelectorAll("#projectPanel .pgrp h3")].map((h) => h.textContent)`);

  test.skipIf(!chromeFound)(`${at}: each frame names its project and state, and a frame opens the project panel without hiding a question`, async () => {
    await open(general.base, width, height);
    await until(`document.querySelectorAll(".building .tile").length === 3`);
    await click(`.tile[data-floor="hq"] .tlabel`);
    await until(`document.querySelectorAll('.layer[data-floor="hq"] .hit.frame').length === 2`);
    expect(await frameLabels("hq")).toEqual(["Ship the release: WAITING ON YOU", "Fix the web build: BLOCKED AT A PROMPT"]);
    expect(await ev(`document.querySelectorAll(".layer .hit.frame .count").length`)).toBe(0);
    await click(`.layer[data-floor="hq"] .hit.frame[data-project="release"]`);
    await until(`!!document.querySelector("#projectPanel h2")`);
    expect(await ev(`document.querySelector("#projectPanel h2").textContent`)).toBe(FACTS.release.title);
    expect(await ev(`document.querySelector("#projectPanel .tag.st").textContent`)).toBe("WAITING ON YOU");
    await until(`document.querySelectorAll("#projectPanel .shelfc").length === 1`);
    expect(await panelHeads()).toEqual(["OPEN CALLS · 1", "ROOM", "PULL REQUESTS · 1", "ARTIFACTS · 1", "WHO IS ON IT"]);
    expect(await ev(`[...document.querySelectorAll("#projectPanel .pgrp:last-child .lrow b")].map((b) => b.textContent)`)).toEqual([FACTS.release.owner, ...FACTS.release.members]);
    expect(await ev(`document.querySelector("#projectPanel a.btn").getAttribute("href")`)).toBe("#room/release");
    expect(await ev(`document.querySelector("#projectPanel .shelfc").textContent`)).toContain(FACTS.release.shelf);
    // it is over the room, not over the questions: the panel lies inside the room, which does not meet the question list
    expect(await ev(`(() => { const p = document.getElementById("projectPanel").getBoundingClientRect(), r = document.querySelector(".room").getBoundingClientRect(), h = document.getElementById("hud").getBoundingClientRect(); const apart = r.left >= h.right - 1 || r.top >= h.bottom - 1; return p.left >= r.left - 1 && p.right <= r.right + 1 && apart; })()`)).toBe(true);
    expect(await ev(`document.querySelectorAll("#hud .ask").length`)).toBe(FACTS.waiting.hq);
    expect(await ev(`document.documentElement.scrollWidth <= innerWidth`)).toBe(true);
    // an open call chooses its agent and gets the panel out of the way of the question
    await click(`#projectPanel .pgrp button.lrow`);
    await until(`!document.querySelector("#projectPanel h2")`);
    expect(await scopeOf()).toMatchObject({ floor: "hq", agent: "hq-pm" });
    // the other floor's frames
    await click(".stagebar [data-building]");
    await click(`.tile[data-floor="sales"] .tlabel`);
    await until(`document.querySelectorAll('.layer[data-floor="sales"] .hit.frame').length === 2`);
    expect(await frameLabels("sales")).toEqual(["Pipeline review: MOVING", "Outbound calls: WAITING ON YOU"]);
  }, 60_000);

  test.skipIf(!chromeFound)(`${at}: panels over the room take turns, and Escape closes the panel before the scope`, async () => {
    await open(general.base, width, height);
    await until(`document.querySelectorAll(".building .tile").length === 3`);
    await click(`#hud .ask[data-lane="hq-pm"] .tag.lane`);
    await until(`document.querySelector(".scopechip")?.textContent === "HQ FLOOR › hq-pm ✕"`);
    await click(`#accounts`);
    await until(`document.querySelector(".room").classList.contains("accounts-open")`);
    // a project opening closes ACCOUNTS
    await click(`#hud .ask[data-lane="hq-pm"] .tag.project`);
    await until(`!!document.querySelector("#projectPanel h2")`);
    expect(await ev(`document.querySelector(".room").classList.contains("accounts-open")`)).toBe(false);
    // and ACCOUNTS opening closes the project
    await click(`#accounts`);
    await until(`document.querySelector(".room").classList.contains("accounts-open")`);
    expect(await ev(`!!document.querySelector("#projectPanel h2")`)).toBe(false);
    // Escape: the panel first, then the agent, then the floor
    await click(`#hud .ask[data-lane="hq-pm"] .tag.project`);
    await until(`!!document.querySelector("#projectPanel h2")`);
    await press("Escape");
    await until(`!document.querySelector("#projectPanel h2")`);
    expect(await scopeOf()).toEqual({ floor: "hq", agent: "hq-pm", all: false });
    await press("Escape");
    await until(`document.querySelector(".scopechip")?.textContent === "HQ FLOOR ✕"`);
    await press("Escape");
    await until(`document.querySelector(".room").dataset.stage === "out"`);
    // Escape with ACCOUNTS open closes ACCOUNTS and leaves the scope
    await click(`.tile[data-floor="fin"] .tlabel`);
    await click(`#accounts`);
    await until(`document.querySelector(".room").classList.contains("accounts-open")`);
    await press("Escape");
    await until(`!document.querySelector(".room").classList.contains("accounts-open")`);
    expect(await scopeOf()).toEqual({ floor: "fin", agent: null, all: false });
  }, 60_000);

  test.skipIf(!chromeFound)(`${at}: a question links to its project, room, issue and pull request; a lane with none shows none`, async () => {
    await open(general.base, width, height);
    await until(`document.querySelectorAll("#hud .ask").length === 6`);
    const tags = (lane: string) => ev(`[...document.querySelectorAll('#hud .ask[data-lane="${lane}"] .meta .tag')].map((t) => t.className.replace("tag ", "").split(" ")[0] + ":" + t.textContent)`) as Promise<string[]>;
    const pm = await tags("hq-pm");
    expect(pm).toEqual(expect.arrayContaining([`project:PROJECT · ${FACTS.release.title}`, "room:ROOM", `key:${FACTS.release.issue}`, "pr:#12"]));
    expect((await tags("hq-ops")).filter((t) => /^(project|room|key|pr):/.test(t))).toEqual([]);
    // the links sit in the meta row, and the question's title and options are still there
    expect(await ev(`document.querySelector('#hud .ask[data-lane="hq-pm"] h3') !== null && document.querySelectorAll('#hud .ask[data-lane="hq-pm"] .opt').length`)).toBe(2);
    // ROOM goes to the conference room; the project panel's OPEN THE ROOM does too, and the panel closes behind it
    await click(`#hud .ask[data-lane="hq-pm"] a.tag.room`);
    await until(`location.hash === "#room/release" && !document.getElementById("roomView").hidden`);
    await ev(`history.replaceState(null, "", location.pathname); dispatchEvent(new HashChangeEvent("hashchange"))`);
    await until(`document.getElementById("roomView").hidden`);
    await click(`#hud .ask[data-lane="hq-pm"] .tag.project`);
    await until(`!!document.querySelector("#projectPanel a.btn")`);
    await click(`#projectPanel a.btn`);
    await until(`location.hash === "#room/release" && !document.getElementById("roomView").hidden`);
    expect(await ev(`document.querySelector(".room").classList.contains("project-open")`)).toBe(false);
  }, 60_000);
}

test.skipIf(!chromeFound)("one floor: the room sits in a scene of its own, the layer hangs the projects and marks the agents, and the page has no building", async () => {
  for (const [width, height] of SIZES) {
    await open(single.base, width, height);
    await until(`document.querySelectorAll("#hud .ask").length === 3 && document.querySelectorAll(".layer").length === 1 && !!document.querySelector(".needhelp .lrow")`);
    await Bun.sleep(600);
    expect(await ev(`document.getElementById("room").parentElement.matches(".room > .scene")`)).toBe(true);
    expect(await ev(`document.querySelectorAll(".scene, .layer").length`)).toBe(2);
    expect(await ev(`!!document.querySelector(".building, .tile")`)).toBe(false);
    const l = await layer("hq");
    // with one floor the room is "zoomed in": the frames are buttons and only blocked and stalled workers are marked
    expect(l).toEqual({ frames: FACTS.rooms.hq, marks: [FACTS.blocked], hits: FACTS.rooms.hq.length + 1 });
    expect(await ev(`document.querySelector(".needhelp h3").textContent`)).toBe("2 NEED HELP");
    expect((await ev(KEEP_OFF("hq"))) as any[]).toEqual([{ lane: FACTS.blocked, over: 0 }]);
    expect(await ev(`document.querySelector(".room .legend").textContent`)).toMatch(/BLOCKED.*STALLED/);
    // the canvas keeps its 3:2 shape and its place in the room
    const r = (await ev(`(() => { const c = document.getElementById("room").getBoundingClientRect(), a = document.querySelector(".room").getBoundingClientRect(); return { ratio: c.width / c.height, inside: c.left >= a.left && c.right <= a.right && c.top >= a.top && c.bottom <= a.bottom }; })()`)) as { ratio: number; inside: boolean };
    expect(Math.abs(r.ratio - 1.5) / 1.5).toBeLessThan(0.03);
    expect(r.inside).toBe(true);
  }
  expect(errors).toEqual([]);
}, 60_000);

test.skipIf(!chromeFound)("one floor: a frame opens the project panel, and Escape closes the panel with nothing scoped", async () => {
  for (const [width, height] of SIZES) {
    await open(single.base, width, height);
    await until(`document.querySelectorAll('.layer[data-floor="hq"] .hit.frame').length === ${FACTS.rooms.hq.length}`);
    await click(`.layer[data-floor="hq"] .hit.frame[data-project="web-fix"]`);
    await until(`document.querySelector("#projectPanel h2")?.textContent === "Fix the web build"`);
    expect(await ev(`document.querySelector("#projectPanel .tag.st").textContent`)).toBe("BLOCKED AT A PROMPT");
    expect(await ev(`!!document.querySelector("#projectPanel .floortag")`)).toBe(false);
    await press("Escape");
    await until(`!document.querySelector("#projectPanel h2")`);
    expect(await scopeOf()).toEqual({ floor: null, agent: null, all: false });
    expect(await ev(`document.querySelectorAll("#hud .ask").length`)).toBe(3);
  }
  expect(errors).toEqual([]);
}, 60_000);
