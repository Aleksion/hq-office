// CLOSE ROOM in a room's view: the owner archives the room from the page. A confirm step built into the page (never
// a browser dialog) asks first; KEEP IT OPEN backs out. Closed, the room shows ARCHIVED, cannot be written to, and is
// listed under ARCHIVED in ROOMS. Needs Chrome (CHROME_BIN); skipped without it.
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
const head = `document.querySelector("#roomView .rvhead")`;
const room = async () => (await (await fetch(`${server.base}/api/state`)).json()).rooms.find((r: any) => r.slug === "ope-3");

beforeAll(async () => {
  if (!chromeFound) return;
  chrome = await startChrome();
  server = await startServer(ROOT);
  await server.post("/api/lanes", { name: "alpha", machine: "local" });
  await server.post("/api/rooms", { slug: "ope-3", title: "Token refresh", owner: "alpha" });
  page = await newSession(chrome.cdp, errors);
  await page.s("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  // A browser dialog would block the page: any use of one fails the test.
  await page.s("Page.addScriptToEvaluateOnNewDocument", { source: `window.confirm = window.alert = window.prompt = () => { throw new Error("a browser dialog was used"); };` });
  await page.s("Page.navigate", { url: `${server.base}/#room/ope-3` });
  await until(`!document.getElementById("roomView").hidden && !!${head}?.querySelector("h2")`);
}, 30_000);

afterAll(async () => {
  await server?.stop();
  await chrome?.close();
});

test.skipIf(!chromeFound)("CLOSE ROOM asks first, in the page; KEEP IT OPEN backs out", async () => {
  await page.evaluate(`${head}.querySelector("[data-room-close]").click()`);
  await until(`!!document.querySelector("#roomView [data-close-confirm]")`);
  expect(await page.evaluate(`document.querySelector("#roomView [data-close-confirm]").textContent`)).toContain("Close Token refresh?");
  await page.evaluate(`document.querySelector("#roomView [data-close-keep]").click()`);
  await until(`!document.querySelector("#roomView [data-close-confirm]")`);
  expect((await room()).archivedAt).toBeNull();
});

test.skipIf(!chromeFound)("CLOSE IT archives the room: ARCHIVED in its view, no send box, and under ARCHIVED in ROOMS", async () => {
  await page.evaluate(`${head}.querySelector("[data-room-close]").click()`);
  await until(`!!document.querySelector("#roomView [data-close-yes]")`);
  await page.evaluate(`document.querySelector("#roomView [data-close-yes]").click()`);
  await until(`${head}.querySelector(".tag.muted")?.textContent === "ARCHIVED"`);
  expect((await room()).archivedAt).toBeGreaterThan(0);
  expect(await page.evaluate(`!!${head}.querySelector("[data-room-close]")`)).toBe(false);
  expect(await page.evaluate(`document.querySelector("#roomView [data-room-send]")`)).toBeNull();
  const ev = (await (await fetch(`${server.base}/api/state`)).json()).events.find((e: any) => e.text === "closed room ope-3");
  expect(ev).toBeTruthy();
  await page.evaluate(`document.querySelector('[data-qtab="rooms"]').click()`);
  await until(`[...document.querySelectorAll("#rooms h4")].some((h) => h.textContent === "ARCHIVED (1)")`);
  expect(errors).toEqual([]);
});
