// The ROOMS tab in Chrome against a temporary server: the count of rooms with new lane messages, an open room's
// lanes, brief, shelf and thread, writing to the owner and to a member, the brief's markdown staying inert, lanes
// gathering at the conference table, and the phone rules (no zoom, no sideways page, the newest message in view, no
// jump when a message lands while you read older ones). Needs Chrome; skipped without it.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { join } from "node:path";
import { findChrome, newSession, startChrome, startServer } from "../../scripts/room-hash.ts";

const ROOT = join(import.meta.dir, "..", "..");
const chromeFound = !!findChrome();
let chrome: Awaited<ReturnType<typeof startChrome>>;
let server: Awaited<ReturnType<typeof startServer>>;
let page: Awaited<ReturnType<typeof newSession>>;
const errors: string[] = [];
const until = async (expr: string, ms = 8000) => {
  for (const end = Date.now() + ms; Date.now() < end; await Bun.sleep(50)) if (await page.evaluate(expr).catch(() => false)) return true;
  throw new Error(`timed out waiting for ${expr}`);
};
const click = (sel: string) => page.evaluate(`document.querySelector(${JSON.stringify(sel)}).click()`);
const size = (width: number, height: number, mobile: boolean) => Promise.all([
  page.s("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 3 : 1, mobile }),
  page.s("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: 5 }),
]);
const load = async () => {
  await page.s("Page.navigate", { url: `${server.base}/` });
  await until(`!!document.getElementById("card")?.innerHTML && !!window.__roomsReady`);
};

beforeAll(async () => {
  if (!chromeFound) return;
  chrome = await startChrome();
  server = await startServer(ROOT);
  // The stub herdr knows golf (working) and alpha (idle); bravo is away.
  for (const name of ["alpha", "golf", "bravo"]) await server.post("/api/lanes", { name, machine: "local" });
  await server.post("/api/sync", {});
  await server.post("/api/rooms", { slug: "ope-7", title: "Search relevance", owner: "alpha", members: ["golf", "bravo"], issues: ["OPE-7"] });
  await server.post("/api/rooms/ope-7/brief", { body: "## Plan\n- [x] baseline\n- [ ] rerank\n\nSee [the doc](https://example.com/doc) <script>window.pwned = 1</script> [bad](javascript:alert(1))\n\n```\nbun test\n```" });
  await server.post("/api/rooms/ope-7/artifacts", { title: "Eval report", url: "https://claude.ai/artifact/abc" });
  await server.post("/api/rooms/ope-7/artifacts", { title: "Dashboard", url: "https://example.com/dash" });
  const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
  await fetch(`${server.base}/api/rooms/ope-7/files?name=shot.png&title=Screenshot`, { method: "POST", headers: { "content-type": "image/png", "x-hud": "1" }, body: png });
  for (let i = 1; i <= 14; i++) await server.post("/api/rooms/ope-7/say", { text: `Finding ${i}: the reranker moves item ${i} up.\nA second line.` });
  page = await newSession(chrome.cdp, errors);
  // A flag the test waits on: the rooms module has run.
  await page.s("Page.addScriptToEvaluateOnNewDocument", { source: `new MutationObserver((_, o) => { if (document.querySelector("#rooms .rlist")) { window.__roomsReady = true; o.disconnect(); } }).observe(document, { subtree: true, childList: true });` });
  await size(1440, 900, false);
  await load();
}, 40_000);

afterAll(async () => {
  await server?.stop();
  await chrome?.close();
});

test.skipIf(!chromeFound)("the ROOMS tab counts rooms with new lane messages, and lists the room", async () => {
  await until(`document.getElementById("qtRooms").textContent === "1" && !document.getElementById("qtRooms").hidden`);
  await click('[data-qtab="rooms"]');
  await until(`!!document.querySelector('#rooms [data-room="ope-7"]')`);
  const row = await page.evaluate(`document.querySelector('[data-room="ope-7"]').innerText`);
  expect(row).toContain("Search relevance");
  expect(row).toContain("alpha");
  expect(row).toContain("14 NEW");
  expect(row).toContain("+2 LANES");
});

test.skipIf(!chromeFound)("an open room: lanes with level and away, brief as markdown and inert, three cards, the thread at its newest", async () => {
  await click('[data-room="ope-7"]');
  await until(`document.querySelectorAll("#rooms .rthread [data-rmsg]").length === 14`);
  const v = await page.evaluate(`(() => {
    const r = document.getElementById("rooms"), md = r.querySelector(".rbrief .md");
    const last = [...r.querySelectorAll(".rthread [data-rmsg]")].pop().getBoundingClientRect(), t = r.querySelector(".rthread").getBoundingClientRect();
    return {
      lanes: [...r.querySelectorAll(".rtop .rlane")].map((b) => b.innerText.replace(/\\s+/g, " ").trim()),
      h: md.querySelector("h4")?.textContent, ticks: md.querySelectorAll(".tick.on").length, links: [...md.querySelectorAll("a")].map((a) => a.getAttribute("href")),
      scripts: md.querySelectorAll("script").length, text: md.textContent,
      font: (() => { const f = (e) => { const c = getComputedStyle(e); return [c.fontFamily, c.fontSize, c.lineHeight]; }; return { body: f(md.querySelector("p")), item: f(md.querySelector("li")), message: f(r.querySelector(".rthread .msg .text")), label: getComputedStyle(r.querySelector(".rbrief .k")).fontFamily }; })(),
      code: md.querySelector(".codebox pre")?.textContent, copy: !!md.querySelector(".codebox .copy"),
      cards: [...r.querySelectorAll(".art")].map((a) => a.className.replace("art ", "")),
      lastInView: last.bottom <= t.bottom + 1 && last.top >= t.top - 1 && t.bottom <= innerHeight,
      sendInView: r.querySelector("[data-room-send]").getBoundingClientRect().bottom <= innerHeight,
      tellHidden: getComputedStyle(document.querySelector(".tell")).display === "none",
      pageScroll: document.documentElement.scrollHeight > innerHeight,
    };
  })()`);
  // The owner first, then the members (added together: by name).
  expect(v.lanes).toEqual(["alpha MANAGER OWNER", "bravo MANAGER AWAY", "golf MANAGER"]);
  expect(v.h).toBe("Plan");
  expect(v.ticks).toBe(1);
  expect(v.links).toEqual(["https://example.com/doc"]);
  expect(v.scripts).toBe(0);
  // The brief reads like a message: the text font and size, the pixel font for its label only; code in a code box.
  expect(v.font.body).toEqual(v.font.message);
  expect(v.font.item).toEqual(v.font.message);
  expect(v.font.body[0]).not.toContain("Press Start");
  expect(v.font.label).toContain("Press Start");
  expect(v.code).toBe("bun test");
  expect(v.copy).toBe(true);
  expect(v.text).toContain("<script>");
  expect(await page.evaluate("window.pwned")).toBeUndefined();
  expect(v.cards).toEqual(["image", "link", "claude-artifact"]);
  expect(v).toMatchObject({ lastInView: true, sendInView: true, tellHidden: true, pageScroll: false });
  // Opening it marked the lanes' messages seen.
  await until(`document.getElementById("qtRooms").hidden`);
  await click(".art.image [data-art-preview]");
  await until(`document.getElementById("imgPreview")?.open && document.querySelector("#imgPreview figcaption").textContent === "Screenshot"`);
  await page.evaluate(`document.getElementById("imgPreview").close()`);
});

test.skipIf(!chromeFound)("writing: to the owner by default, to a member with To:, kept for a lane that is away", async () => {
  const write = async (text: string) => {
    await page.evaluate(`(() => { const ta = document.querySelector(".rsend textarea"); ta.value = ${JSON.stringify(text)}; ta.dispatchEvent(new Event("input", { bubbles: true })); })()`);
    await click("[data-room-send]");
    await until(`[...document.querySelectorAll("#rooms .msg.you")].some((m) => m.innerText.includes(${JSON.stringify(text)}) && !m.innerText.includes("SENDING"))`);
    return page.evaluate(`[...document.querySelectorAll("#rooms .msg.you")].pop().innerText`);
  };
  expect(await write("How far is the rerank?")).toMatch(/→ alpha[\s\S]*DELIVERED/);
  await page.evaluate(`(() => { const s = document.querySelector("[data-room-to]"); s.value = "golf"; s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
  expect(await page.evaluate(`document.querySelector(".rsend .tostate").textContent`)).toBe("typed into golf");
  expect(await write("Golf, the numbers?")).toMatch(/→ golf[\s\S]*DELIVERED/);
  await page.evaluate(`(() => { const s = document.querySelector("[data-room-to]"); s.value = "bravo"; s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
  expect(await page.evaluate(`document.querySelector(".rsend .tostate").textContent`)).toContain("AWAY");
  expect(await write("Bravo, when you are back.")).toMatch(/→ bravo[\s\S]*AWAY · KEPT/);
  const thread = await (await fetch(`${server.base}/api/rooms/ope-7`)).json();
  expect(thread.messages.slice(-3).map((m: any) => [m.to, m.delivery])).toEqual([["alpha", "sent"], ["golf", "sent"], ["bravo", "away"]]);
});

test.skipIf(!chromeFound)("lanes gather at the conference table while the room talks; a working lane stays at its desk", async () => {
  const where = () => page.evaluate(`import("/src/client/room/workers.js").then(({ workers }) => Object.fromEntries([...workers].map(([n, w]) => [n, [w.target.x, w.target.y]])))`);
  const seats = await page.evaluate(`import("/src/client/room/conference.js").then(({ CONF_SEATS }) => CONF_SEATS.map((s) => [s.x, s.y]))`);
  const at = await where();
  expect(at.alpha).toEqual(seats[0]); // idle at HQ: it walks to the table
  expect(seats).not.toContainEqual(at.golf); // working: at its desk
  expect(seats).not.toContainEqual(at.bravo); // away
});

test.skipIf(!chromeFound)("phone: no zoom, no sideways page, the thread opens at its newest and keeps your place", async () => {
  await size(390, 664, true);
  await load();
  await until(`!document.querySelector("#rooms").hidden && !!document.querySelector("#rooms .rthread [data-rmsg]")`);
  await page.evaluate(`document.querySelector("#rooms .rthread").scrollIntoView({ block: "center" })`);
  const v = await page.evaluate(`(() => {
    const t = document.querySelector("#rooms .rthread"), s = getComputedStyle(t), last = [...t.querySelectorAll("[data-rmsg]")].pop().getBoundingClientRect(), tr = t.getBoundingClientRect();
    return {
      select: parseFloat(getComputedStyle(document.querySelector("[data-room-to]")).fontSize),
      textarea: parseFloat(getComputedStyle(document.querySelector(".rsend textarea")).fontSize),
      wide: document.documentElement.scrollWidth > innerWidth,
      overflowY: s.overflowY, bounded: t.scrollHeight > t.clientHeight,
      newest: last.bottom <= tr.bottom + 1 && last.top >= tr.top - 1,
    };
  })()`);
  expect(v).toEqual({ select: 16, textarea: 16, wide: false, overflowY: "auto", bounded: true, newest: true });
  // Reading older messages: a new one lands below, and what you read stays where it was.
  await page.evaluate(`(() => { const t = document.querySelector("#rooms .rthread"); t.scrollTop = 0; t.dispatchEvent(new Event("scroll")); })()`);
  const first = `document.querySelector('#rooms .rthread [data-rmsg]')`;
  const before = await page.evaluate(`[${first}.dataset.rmsg, ${first}.getBoundingClientRect().top]`);
  await server.post("/api/rooms/ope-7/say", { text: "One more finding, while you read." });
  await until(`[...document.querySelectorAll("#rooms .rthread [data-rmsg]")].some((m) => m.innerText.includes("while you read"))`);
  const after = await page.evaluate(`[${first}.dataset.rmsg, ${first}.getBoundingClientRect().top]`);
  // On the screen, not in page coordinates: Chrome's scroll anchoring may move the page to hold it there.
  expect(after[0]).toBe(before[0]);
  expect(Math.abs(after[1] - before[1])).toBeLessThan(2);
  expect(errors).toEqual([]);
});
