// A page address listed in HUD_TRUSTED_ORIGINS (a phone over Tailscale serve) may read and write like the
// machine's own page; any other origin is still refused, and secrets stay this machine's own page only.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const probe = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response() });
const PORT = probe.port;
probe.stop(true);
const BASE = `http://127.0.0.1:${PORT}`;
const PHONE = "https://office.example.ts.net:4747";
const DATA = mkdtempSync(join(tmpdir(), "hq-office-origins-"));
let server: ReturnType<typeof Bun.spawn>;

beforeAll(async () => {
  server = Bun.spawn([process.execPath, "server.ts"], {
    cwd: ROOT,
    env: { ...process.env, HUD_PORT: String(PORT), HUD_HOST: "127.0.0.1", HUD_DATA_DIR: DATA, HERDR_BIN: join(DATA, "no-such-herdr"), HUD_TRUSTED_ORIGINS: `${PHONE}/` },
    stdout: "ignore",
    stderr: "ignore",
  });
  for (const deadline = Date.now() + 8000; Date.now() < deadline; await Bun.sleep(100)) {
    try {
      if ((await fetch(`${BASE}/api/state`)).ok) return;
    } catch {}
  }
  throw new Error(`server did not come up on port ${PORT}`);
});

afterAll(async () => {
  server?.kill();
  await server?.exited;
  rmSync(DATA, { recursive: true, force: true });
});

const from = (origin: string, path: string, init: RequestInit = {}) =>
  fetch(`${BASE}${path}`, { ...init, headers: { ...(init.headers as Record<string, string>), origin } });

test("a listed page address reads and writes", async () => {
  expect((await from(PHONE, "/api/state")).status).toBe(200);
  const tell = await from(PHONE, "/api/updates", { method: "POST", headers: { "x-hud": "1", "content-type": "application/json" }, body: JSON.stringify({ title: "from the phone" }) });
  expect(tell.status).not.toBe(403);
});

test("any other origin is still refused", async () => {
  expect((await from("https://elsewhere.example", "/api/state")).status).toBe(403);
});

test("secrets stay this machine's own page only, even for a listed address", async () => {
  expect((await from(PHONE, "/api/secrets")).status).toBe(403);
});
