// Starts server.ts on a spare port with a throwaway data dir and checks the core routes.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnServer } from "../scripts/room-hash.ts";

const ROOT = join(import.meta.dir, "..");
let BASE = "";
const DATA = mkdtempSync(join(tmpdir(), "hq-office-test-"));
let server: Awaited<ReturnType<typeof spawnServer>>;

beforeAll(async () => {
  server = await spawnServer({ cwd: ROOT, env: { ...process.env, HUD_HOST: "127.0.0.1", HUD_DATA_DIR: DATA, HERDR_BIN: join(DATA, "no-such-herdr") } });
  BASE = server.base;
});

afterAll(async () => {
  await server?.stop();
  rmSync(DATA, { recursive: true, force: true });
});

test("serves the page", async () => {
  const res = await fetch(`${BASE}/`);
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("HQ OFFICE");
});

test("state has lanes, open, config and page", async () => {
  const state = await (await fetch(`${BASE}/api/state`)).json();
  for (const key of ["lanes", "open", "config", "page"]) expect(state).toHaveProperty(key);
  expect(Array.isArray(state.lanes)).toBe(true);
  expect(Array.isArray(state.open)).toBe(true);
  expect(typeof state.config).toBe("object");
  expect(state.config).not.toBeNull();
});

test("writes without the x-hud header are refused", async () => {
  const res = await fetch(`${BASE}/api/notes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "hello" }),
  });
  expect(res.status).toBe(403);
});

test("uploads land in the data dir and are served back", async () => {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const res = await fetch(`${BASE}/api/uploads?name=smoke.png`, {
    method: "POST",
    headers: { "x-hud": "1", "content-type": "image/png" },
    body: bytes,
  });
  expect(res.status).toBe(200);
  const { path, url } = await res.json();
  expect(path.startsWith(join(DATA, "uploads"))).toBe(true);
  const back = await fetch(`${BASE}${url}`);
  expect(back.status).toBe(200);
  expect(new Uint8Array(await back.arrayBuffer())).toEqual(bytes);
});

// Reads server-sent messages from the page stream, one `data:` payload at a time.
async function* streamMessages(res: Response) {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buf += dec.decode(value, { stream: true });
    let end;
    while ((end = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, end);
      buf = buf.slice(end + 2);
      const data = block.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("\n");
      if (data) yield data;
    }
  }
}

test("the page stream starts with the whole state, then sends only the parts that changed", async () => {
  const ctrl = new AbortController();
  const res = await fetch(`${BASE}/api/stream`, { signal: ctrl.signal });
  const messages = streamMessages(res);
  const whole = JSON.parse((await messages.next()).value!);
  for (const key of ["lanes", "open", "answered", "notes", "updates", "updatesUnread", "config", "page", "machines", "score"]) expect(whole).toHaveProperty(key);
  const post = await fetch(`${BASE}/api/updates`, {
    method: "POST",
    headers: { "x-hud": "1", "content-type": "application/json" },
    body: JSON.stringify({ title: "stream test" }),
  });
  expect(post.status).toBe(200);
  const part = JSON.parse((await messages.next()).value!);
  expect(part.updates[0].title).toBe("stream test");
  expect(part.updatesUnread).toBe(whole.updatesUnread + 1);
  for (const key of ["lanes", "open", "answered", "notes", "config", "page"]) expect(part).not.toHaveProperty(key);
  ctrl.abort();
});

test("an answer still succeeds when herdr cannot be started, and the failure is logged", async () => {
  const post = (path: string, body: unknown) =>
    fetch(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-hud": "1" }, body: JSON.stringify(body) });
  const { id } = await (await post("/api/asks", { title: "answer without herdr", kind: "info" })).json();
  const res = await post(`/api/asks/${id}/answer`, { answer: "seen" });
  expect(res.status).toBe(200);
  const state = await (await fetch(`${BASE}/api/state`)).json();
  expect(state.open.some((a: any) => a.id === id)).toBe(false);
  expect(state.events.some((e: any) => e.text.startsWith("could not reach HQ"))).toBe(true);
});
