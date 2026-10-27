// The layer over the room, in Chrome, on the floors fixture (test/floors-fixture.ts) at 1440 and at 390: project frames on
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
  // Who needs help, by floor, worst first. The generals are idle in herdr with nothing asked of them, which the page reads
  // as waiting on HQ, so each head is marked at its terminal.
  const MARKS = { hq: [FACTS.blocked, "hq-ops"], fin: [FACTS.stalled, "fin"], sales: ["sales-outb", "sales"] } as Record<string, string[]>;

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
    expect(await ev(`[...document.querySelectorAll('.layer[data-floor="fin"] .hit.agent')].map((b) => b.dataset.state + ":" + b.dataset.select)`)).toEqual([`stalled:${FACTS.stalled}`, "hq:fin"]);
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
    // unscoped: every worker that needs help, worst first (heads are marked at their terminal, not listed)
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
}

test.skipIf(!chromeFound)("one floor: the room sits in a scene of its own, the layer hangs the projects and marks the agents, and the page has no building", async () => {
  for (const [width, height] of SIZES) {
    await open(single.base, width, height);
    await until(`document.querySelectorAll("#hud .ask").length === 3 && document.querySelectorAll(".layer").length === 1 && !!document.querySelector(".needhelp .lrow")`);
    await Bun.sleep(600);
    expect(await ev(`document.getElementById("room").parentElement.matches(".room > .scene")`)).toBe(true);
    expect(await ev(`document.querySelectorAll(".scene, .layer").length`)).toBe(2);
    expect(await ev(`!!document.querySelector(".building, .stagebar, .tile")`)).toBe(false);
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
