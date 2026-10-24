// Images on the send boxes, in Chrome against a temporary server: every send box has an ATTACH button; a picked image
// is re-encoded before upload (a big PNG comes out at most 2048 px, as JPEG where the browser has no WebP encoder, an
// image the server does not take but the browser can read is converted); chips show, remove and retry; the text box
// stays clean and the tokens are appended on send; the draft keeps its images through a re-render and a reload; on a
// touch screen the button is at least 44x44. Needs Chrome; skipped without it.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { findChrome, newSession, seed, startChrome, startServer } from "../../scripts/room-hash.ts";

const ROOT = join(import.meta.dir, "..", "..");
const chromeFound = !!findChrome();
let chrome: Awaited<ReturnType<typeof startChrome>>;
let server: Awaited<ReturnType<typeof startServer>>;
let page: Awaited<ReturnType<typeof newSession>>;
let askId = 0;
const errors: string[] = [];
const until = async (expr: string, ms = 10_000) => {
  for (const end = Date.now() + ms; Date.now() < end; await Bun.sleep(50)) if (await page.evaluate(expr).catch(() => false)) return true;
  throw new Error(`timed out waiting for ${expr}`);
};
const state = async () => (await fetch(`${server.base}/api/state`)).json();
// In the page: a picture as a File (a gradient with a few shapes; a PNG unless asked otherwise), and a pick through
// a box's file input, the way the phone's menu hands the files over.
const HELPERS = `
  window.__img = async (w, h, { name = "pic.png", type = "image/png", as = "image/png" } = {}) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d"), g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#d63c3c"); g.addColorStop(1, "#3c6fd6"); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = "#fff"; for (let i = 0; i < 40; i++) x.fillRect((i * 97) % w, (i * 53) % h, 30, 30);
    const b = await new Promise((r) => c.toBlob(r, as));
    return new File([b], name, { type });
  };
  window.__pick = (sel, files) => {
    const input = document.querySelector(sel), dt = new DataTransfer();
    for (const f of files) dt.items.add(f);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  window.__images = () => import("/src/client/images/images.js");
  window.__size = (blob) => new Promise((res) => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.src = URL.createObjectURL(blob); });
`;
const chips = (key: string) => page.evaluate(`[...document.querySelectorAll('[data-chips="${key}"] .chip')].map((c) => c.className.replace("chip ", ""))`);

beforeAll(async () => {
  if (!chromeFound) return;
  chrome = await startChrome();
  server = await startServer(ROOT);
  askId = await seed(server.post);
  page = await newSession(chrome.cdp, errors);
  await page.s("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await page.s("Page.navigate", { url: `${server.base}/` });
  await until(`!!document.querySelector(".ask")`);
  await page.evaluate(HELPERS);
}, 30_000);

afterAll(async () => {
  await server?.stop();
  await chrome?.close();
});

describe.skipIf(!chromeFound)("attach", () => {
  test("every send box has an ATTACH button that opens the image picker", async () => {
    const boxes = await page.evaluate(`[...document.querySelectorAll(".reply")].map((r) => { const i = r.querySelector("label.attach input[type=file]"); return i && { key: i.dataset.attach, accept: i.accept, multiple: i.multiple, beforeSend: !!i.closest("label").nextElementSibling?.matches(".send") }; })`);
    expect(boxes).toContainEqual({ key: "note", accept: "image/*", multiple: true, beforeSend: true });
    expect(boxes.filter((b: any) => /^\d+$/.test(b?.key))).toHaveLength(2);
    expect(boxes.every((b: any) => b && b.accept === "image/*" && b.multiple && b.beforeSend)).toBe(true);
    await page.evaluate(`document.querySelector('[data-qtab="messages"]').click()`);
    await until(`!!document.querySelector("#msgs [data-reply]")`);
    await page.evaluate(`document.querySelector("#msgs [data-reply]").click()`);
    await until(`!!document.querySelector('[data-rbox] .reply label.attach input[data-attach="reply"][accept="image/*"][multiple]')`);
    await page.evaluate(`document.querySelector("#msgs [data-reply]").click(); document.querySelector('[data-qtab="questions"]').click()`);
  });

  test("a big PNG is re-encoded to at most 2048 px: JPEG without a WebP encoder (Safari), the smaller of the two in Chrome", async () => {
    const r = await page.evaluate(`(async () => {
      const { prepare } = await __images();
      const png = await __img(3000, 2000, { name: "screen.png" });
      const chrome = await prepare(png);
      // Safari's toBlob has no WebP and returns a PNG instead.
      const real = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (cb, type, q) { return real.call(this, cb, type === "image/webp" ? "image/png" : type, q); };
      let safari; try { safari = await prepare(png); } finally { HTMLCanvasElement.prototype.toBlob = real; }
      return { inSize: png.size, chrome: { type: chrome.type, name: chrome.name, size: chrome.size, dims: await __size(chrome) }, safari: { type: safari.type, name: safari.name, size: safari.size, dims: await __size(safari) } };
    })()`);
    expect(r.safari).toMatchObject({ type: "image/jpeg", name: "screen.jpg", dims: [2048, 1365] });
    expect(["image/jpeg", "image/webp"]).toContain(r.chrome.type);
    expect(r.chrome.dims).toEqual([2048, 1365]);
    expect(r.chrome.size).toBeLessThanOrEqual(r.safari.size);
    expect(r.safari.size).toBeLessThan(r.inSize);
  });

  test("an image the server does not take is converted when the browser can read it; one it cannot read says why", async () => {
    const r = await page.evaluate(`(async () => {
      const { prepare } = await __images();
      // An iPhone photo the browser can decode (here PNG bytes labelled HEIC), and a BMP.
      const heic = await __img(800, 600, { name: "IMG_0001.HEIC", type: "image/heic" });
      const bmp = new File([await __img(40, 30)], "old.bmp", { type: "image/bmp" });
      const out = [];
      for (const f of [heic, bmp]) { const p = await prepare(f); out.push({ type: p.type, name: p.name.replace(/\\.(jpg|webp)$/, ".X"), dims: await __size(p) }); }
      const why = async (f) => { try { await prepare(f); return "accepted"; } catch (e) { return [e.label, e.message]; } };
      out.push(await why(new File([new Uint8Array(64)], "IMG_0002.HEIC", { type: "" })));
      out.push(await why(new File(["hello"], "notes.txt", { type: "text/plain" })));
      out.push(await why(new File([new Uint8Array(10.5 * 1024 * 1024)], "huge.gif", { type: "image/gif" })));
      // a small accepted image goes as it is
      const small = await __img(300, 200, { name: "small.png" });
      out.push((await prepare(small)) === small);
      return out;
    })()`);
    expect(["image/jpeg", "image/webp"]).toContain(r[0].type);
    expect(r[0]).toMatchObject({ name: "IMG_0001.X", dims: [800, 600] });
    expect(r[1].name).toBe("old.X");
    expect(r[2][0]).toBe("CAN'T READ HEIC");
    expect(r[2][1]).toContain("cannot read HEIC");
    expect(r[3][0]).toBe("NOT AN IMAGE");
    expect(r[4][0]).toBe("OVER 10 MB");
    expect(r[5]).toBe(true);
  });

  test("picked images show as chips, one can be removed, and the text box stays clean", async () => {
    await page.evaluate(`document.getElementById("noteText").value = "Look at these"`);
    await page.evaluate(`(async () => __pick('[data-attach="note"]', [await __img(3000, 2000, { name: "one.png" }), await __img(400, 300, { name: "two.png" }), await __img(300, 300, { name: "three.png" })]))()`);
    await until(`document.querySelectorAll('[data-chips="note"] .chip.done').length === 3`);
    expect(await page.evaluate(`document.getElementById("noteText").value`)).toBe("Look at these");
    expect(await page.evaluate(`document.querySelectorAll('[data-chips="note"] .chip img').length`)).toBe(3);
    await page.evaluate(`document.querySelectorAll('[data-chips="note"] [data-chip-rm]')[2].click()`);
    expect(await chips("note")).toEqual(["done", "done"]);
  });

  test("on send the tokens are appended, the files are on disk, and the box and chips clear", async () => {
    await page.evaluate(`document.getElementById("compose").requestSubmit()`);
    await until(`document.getElementById("lastNote").textContent.includes("Look at these")`);
    const text: string = (await state()).notes[0].text;
    const paths = [...text.matchAll(/\[image: ([^\]]+)\]/g)].map((m) => m[1]);
    expect(text).toMatch(/^Look at these \[image: \S+one\.(jpg|webp)\] \[image: \S+two\.png\]$/);
    expect(paths.every((p) => existsSync(p))).toBe(true);
    expect(await page.evaluate(`document.getElementById("noteText").value`)).toBe("");
    expect(await chips("note")).toEqual([]);
  });

  test("an ask keeps its images through a re-render and a reload, and sends them with the answer", async () => {
    const card = `[data-ask="${askId}"]`;
    await page.evaluate(`(async () => __pick('${card} [data-attach]', [await __img(200, 100, { name: "proof.png" })]))()`);
    await until(`document.querySelectorAll('${card} .chip.done').length === 1`);
    // An image is enough to send a decision without an option.
    expect(await page.evaluate(`document.querySelector('${card} .send').disabled`)).toBe(false);
    await server.post("/api/asks", { lane: "golf", kind: "info", title: "Arrives while attaching" });
    await until(`document.getElementById("hud").textContent.includes("Arrives while attaching")`);
    expect(await chips(String(askId))).toEqual(["done"]);
    await page.evaluate(`location.reload()`);
    await until(`!!document.querySelector('${card} .chip.done img')`);
    await page.evaluate(HELPERS);
    await page.evaluate(`document.querySelector('${card} .opt[data-opt="No"]').click()`);
    await until(`!!document.querySelector('${card} .opt.sel')`);
    await page.evaluate(`document.querySelector('${card} .send').click()`);
    await until(`!document.querySelector('${card}')`);
    const answer = (await state()).answered.find((a: any) => a.id === askId)?.answer;
    expect(answer).toMatch(/^No\. \[image: \S+proof\.png\]$/);
  });

  test("a reply keeps its images while the thread updates, and a failed upload shows on its chip with a retry", async () => {
    await page.evaluate(`document.querySelector('[data-qtab="messages"]').click()`);
    await until(`!!document.querySelector("#msgs [data-reply]")`);
    await page.evaluate(`document.querySelector('#msgs [data-reply="u1"]').click()`);
    await until(`!!document.querySelector("[data-rbox]")`);
    // The first upload fails, as on a phone that loses its connection.
    await page.evaluate(`(() => { const real = window.fetch; let n = 0; window.fetch = (u, o) => (String(u).startsWith("/api/uploads") && !n++ ? Promise.reject(new TypeError("Load failed")) : real(u, o)); })()`);
    await page.evaluate(`(async () => __pick('[data-attach="reply"]', [await __img(320, 240, { name: "shot.png" })]))()`);
    await until(`!!document.querySelector('[data-chips="reply"] .chip.err [data-chip-retry]')`);
    expect(await page.evaluate(`document.querySelector('[data-chips="reply"] .chip.err .cs').textContent`)).toBe("FAILED");
    // Sending waits for it.
    expect(await page.evaluate(`document.querySelector("[data-rsend]").disabled`)).toBe(false);
    await page.evaluate(`document.querySelector("[data-rsend]").click()`);
    expect((await state()).notes[0].text).not.toContain("re: #u1");
    await page.evaluate(`document.querySelector('[data-chips="reply"] [data-chip-retry]').click()`);
    await until(`document.querySelectorAll('[data-chips="reply"] .chip.done').length === 1`);
    await server.post("/api/updates", { lane: "golf", title: "Lands in the thread" });
    await until(`document.getElementById("msgs").textContent.includes("Lands in the thread")`);
    expect(await chips("reply")).toEqual(["done"]);
    await page.evaluate(`document.querySelector("[data-rbox] textarea").value = "Here"; document.querySelector("[data-rbox] textarea").dispatchEvent(new Event("input", { bubbles: true }))`);
    await page.evaluate(`document.querySelector("[data-rsend]").click()`);
    await until(`!document.querySelector("[data-rbox]")`);
    expect((await state()).notes[0].text).toMatch(/^re: #u1 \("[^"]*"\) Here \[image: \S+shot\.png\]$/);
    await page.evaluate(`document.querySelector('[data-qtab="questions"]').click()`);
    expect(errors).toEqual([]);
  });

  test("on a touch screen the button is at least 44x44 and the picker's field is 16px", async () => {
    await page.s("Emulation.setDeviceMetricsOverride", { width: 390, height: 664, deviceScaleFactor: 3, mobile: true });
    await page.s("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await page.evaluate(`location.reload()`);
    await until(`matchMedia("(pointer: coarse)").matches && !!document.querySelector(".ask label.attach")`);
    const sizes = await page.evaluate(`[...document.querySelectorAll("label.attach")].map((l) => { const r = l.getBoundingClientRect(); return [r.width, r.height, parseFloat(getComputedStyle(l.querySelector("input")).fontSize)]; })`);
    expect(sizes.length).toBeGreaterThanOrEqual(2);
    for (const [w, h, f] of sizes) { expect(w).toBeGreaterThanOrEqual(44); expect(h).toBeGreaterThanOrEqual(44); expect(f).toBeGreaterThanOrEqual(16); }
    await page.s("Emulation.setTouchEmulationEnabled", { enabled: false });
  });
});
