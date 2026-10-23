// The ask ledger on the page, in Chrome at 1440x900 against a temporary server: an edited question updates in place
// with its EDITED tag, keeps the typed draft and drops a pick the edit removed; comments (latest 5, MORE for the
// rest) and checklist ticks show on the card; no console errors and no page scroll. Skipped without Chrome.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findChrome, newSession, seed, startChrome, startServer } from "../../scripts/room-hash.ts";

const ROOT = join(import.meta.dir, "..", "..");
const chromeFound = !!findChrome();
const GH = mkdtempSync(join(tmpdir(), "hq-ledger-gh-"));
let chrome: Awaited<ReturnType<typeof startChrome>>;
let server: Awaited<ReturnType<typeof startServer>>;
let page: Awaited<ReturnType<typeof newSession>>;
let askId = 0;
const errors: string[] = [];
const until = async (expr: string, ms = 8000) => {
  for (const end = Date.now() + ms; Date.now() < end; await Bun.sleep(50)) if (await page.evaluate(expr).catch(() => false)) return true;
  throw new Error(`timed out waiting for ${expr}`);
};
const card = () => `document.querySelector('[data-ask="${askId}"]')`;

beforeAll(async () => {
  if (!chromeFound) return;
  // No real GitHub: the server gets the fake gh, which knows no PRs.
  writeFileSync(join(GH, "gh.json"), "{}");
  process.env.HUD_GH_BIN = join(ROOT, "test", "fake-gh.ts");
  process.env.FAKE_GH_DATA = join(GH, "gh.json");
  process.env.HUD_GITHUB_REPO = "example/repo";
  chrome = await startChrome();
  server = await startServer(ROOT);
  askId = await seed(server.post);
  page = await newSession(chrome.cdp, errors);
  await page.s("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await page.s("Page.navigate", { url: `${server.base}/` });
  await until(`!!${card()}`);
});

afterAll(async () => {
  await server?.stop();
  chrome?.close();
  rmSync(GH, { recursive: true, force: true });
});

test.skipIf(!chromeFound)("an edit updates the card in place, keeps the draft and drops a removed pick", async () => {
  await page.evaluate(`${card()}.querySelector('.opt[data-opt="No"]').click()`);
  await until(`${card()}.querySelector(".opt.sel")?.dataset.opt === "No"`);
  await page.evaluate(`(() => { const ta = ${card()}.querySelector("textarea"); ta.focus(); ta.value = "half typed"; ta.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await server.post(`/api/asks/${askId}/update`, { title: "Ship the thing today?", options: ["Yes", "Later"] });
  await until(`${card()}.querySelector("h3").textContent === "Ship the thing today?"`);
  await until(`/^EDITED \\d\\d:\\d\\d$/.test(${card()}.querySelector(".meta .tag.edited")?.textContent ?? "")`);
  expect(await page.evaluate(`[...${card()}.querySelectorAll(".opt")].map((o) => o.dataset.opt)`)).toEqual(["Yes", "Later"]);
  expect(await page.evaluate(`${card()}.querySelector(".opt.sel")`)).toBeNull();
  expect(await page.evaluate(`${card()}.querySelector("textarea").value`)).toBe("half typed");
  expect(await page.evaluate(`document.activeElement === ${card()}.querySelector("textarea")`)).toBe(true);
});

test.skipIf(!chromeFound)("comments and ticks show on the card, the latest five with MORE", async () => {
  await server.post(`/api/asks/${askId}/items`, { text: "Write the notes" });
  await server.post(`/api/asks/${askId}/items`, { text: "Land #4321" });
  await server.post(`/api/asks/${askId}/items/1`, { done: true });
  for (let i = 1; i <= 7; i++) await server.post(`/api/asks/${askId}/comment`, { text: `note ${i}` });
  await until(`${card()}.querySelectorAll(".ledger .lc").length === 5`);
  expect(await page.evaluate(`[...${card()}.querySelectorAll(".lc")].map((c) => c.textContent.slice(c.querySelector(".lat").textContent.length))`)).toEqual(["note 3", "note 4", "note 5", "note 6", "note 7"]);
  expect(await page.evaluate(`[...${card()}.querySelectorAll(".lchk li")].map((li) => [li.classList.contains("done"), li.textContent.trim()])`)).toEqual([[true, "✓Write the notes"], [false, "Land #4321"]]);
  expect(await page.evaluate(`${card()}.querySelectorAll(".lchk li")[1].querySelector("a").href`)).toBe("https://github.com/example/repo/pull/4321");
  // The ledger sits between the question and its answer.
  expect(await page.evaluate(`${card()}.querySelector(".ledger").nextElementSibling.classList.contains("menu")`)).toBe(true);
  await page.evaluate(`${card()}.querySelector("[data-ledger-more]").click()`);
  await until(`${card()}.querySelectorAll(".lc").length === 7`);
  // An answer picked after all this still works, and the ledger survives the panel redrawing the card.
  await page.evaluate(`${card()}.querySelector('.opt[data-opt="Later"]').click()`);
  await until(`${card()}.querySelector(".opt.sel")?.dataset.opt === "Later"`);
  expect(await page.evaluate(`${card()}.querySelectorAll(".lc").length`)).toBe(7);
  expect(await page.evaluate(`!!${card()}.querySelector(".tag.edited")`)).toBe(true);
  expect(await page.evaluate(`document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth`)).toBe(true);
  expect(errors).toEqual([]);
});
