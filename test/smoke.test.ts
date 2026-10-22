// Starts server.ts on a spare port with a throwaway data dir and checks the core routes.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const PORT = 4800 + Math.floor(Math.random() * 100);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = mkdtempSync(join(tmpdir(), "hq-office-test-"));
let server: ReturnType<typeof Bun.spawn>;

beforeAll(async () => {
  server = Bun.spawn([process.execPath, "server.ts"], {
    cwd: ROOT,
    env: {
      ...process.env,
      HUD_PORT: String(PORT),
      HUD_HOST: "127.0.0.1",
      HUD_DATA_DIR: DATA,
      HERDR_BIN: join(DATA, "no-such-herdr"),
    },
    stdout: "ignore",
    stderr: "ignore",
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${BASE}/api/state`)).ok) return;
    } catch {}
    await Bun.sleep(100);
  }
  throw new Error(`server did not come up on port ${PORT}`);
});

afterAll(async () => {
  server?.kill();
  await server?.exited;
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
