// The page on a phone, in Chrome at 390x664 with touch, against a temporary server: no zoom (the viewport forbids
// it, every text field is 16px or more), one page scroll, MESSAGES opens at its newest message, a live update keeps
// the place of what you read, and at the newest message a new one stays in view. Needs Chrome; skipped without it.
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
const settle = () => Bun.sleep(300);
const LAST = `[...document.querySelectorAll("#msgs [data-msg]")].pop()`;
const lastInView = () => page.evaluate(`(() => { const r = ${LAST}.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })()`);
const topOf = (key: string) => page.evaluate(`document.querySelector('#msgs [data-msg="${key}"]').getBoundingClientRect().top`);

beforeAll(async () => {
  if (!chromeFound) return;
  chrome = await startChrome();
  server = await startServer(ROOT);
  await server.post("/api/asks", { lane: "alpha", kind: "action", title: "One question" });
  for (let i = 1; i <= 24; i++) {
    await server.post("/api/updates", { lane: "alpha", title: `Update ${i}`, body: "Two lines of news.\nThe second line." });
    if (i % 3 === 0) await server.post("/api/notes", { text: `Note ${i}` });
  }
  page = await newSession(chrome.cdp, errors);
  await page.s("Emulation.setDeviceMetricsOverride", { width: 390, height: 664, deviceScaleFactor: 3, mobile: true });
  await page.s("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await page.s("Page.navigate", { url: `${server.base}/` });
  await until(`!!document.querySelector(".ask")`);
});

afterAll(async () => {
  await server?.stop();
  chrome?.close();
});

test.skipIf(!chromeFound)("no zoom: the viewport forbids it, and no text field is under 16px", async () => {
  const meta = await page.evaluate(`document.querySelector('meta[name="viewport"]').content`);
  expect(meta).toContain("maximum-scale=1");
  expect(meta).toContain("user-scalable=no");
  expect(await page.evaluate(`getComputedStyle(document.documentElement).touchAction`)).toBe("pan-x pan-y");
  const sizes: number[] = await page.evaluate(`[...document.querySelectorAll("textarea, input, select")].map((e) => parseFloat(getComputedStyle(e).fontSize))`);
  expect(sizes.length).toBeGreaterThan(1);
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(16);
});

test.skipIf(!chromeFound)("MESSAGES opens at the newest message, in one page scroll", async () => {
  await page.evaluate(`document.querySelector('[data-qtab="messages"]').click()`);
  await until(`document.querySelectorAll("#msgs [data-msg]").length > 20`);
  await settle();
  // the page scrolls, not the thread
  expect(await page.evaluate(`document.getElementById("msgs").scrollHeight <= document.getElementById("msgs").clientHeight + 1`)).toBe(true);
  expect(await page.evaluate(`scrollY`)).toBeGreaterThan(0);
  expect(await lastInView()).toBe(true);
});

test.skipIf(!chromeFound)("reading older messages, a live update does not move them", async () => {
  await page.evaluate(`document.querySelector('#msgs [data-msg="u12"]').scrollIntoView({ block: "start" }); scrollBy(0, -200)`);
  await settle();
  const before = await topOf("u12");
  await server.post("/api/updates", { lane: "alpha", title: "Arrives while reading" });
  // a reply to an older message lands above the screen
  await server.post("/api/notes", { text: `re: #u2 ("Update 2") A reply above` });
  await until(`document.getElementById("msgs").textContent.includes("A reply above")`);
  await settle();
  expect(Math.abs((await topOf("u12")) - before)).toBeLessThan(1);
});

test.skipIf(!chromeFound)("at the newest message, a new one stays in view", async () => {
  await page.evaluate(`${LAST}.scrollIntoView({ block: "end" })`);
  await settle();
  await server.post("/api/updates", { lane: "alpha", title: "Arrives at the bottom", body: "A longer one.\nWith a second line.\nAnd a third." });
  await until(`document.getElementById("msgs").textContent.includes("Arrives at the bottom")`);
  await settle();
  expect(await page.evaluate(`${LAST}.textContent.includes("Arrives at the bottom")`)).toBe(true);
  expect(await lastInView()).toBe(true);
  expect(errors).toEqual([]);
});
