// A page address listed in HUD_TRUSTED_ORIGINS (a phone over Tailscale serve) may read and write like the
// machine's own page; any other origin is still refused, and secrets stay this machine's own page only.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnServer } from "../../scripts/room-hash.ts";

const ROOT = join(import.meta.dir, "..", "..");
let BASE = "";
const PHONE = "https://office.example.ts.net:4747";
const DATA = mkdtempSync(join(tmpdir(), "hq-office-origins-"));
let server: Awaited<ReturnType<typeof spawnServer>>;

beforeAll(async () => {
  server = await spawnServer({
    cwd: ROOT,
    env: { ...process.env, HUD_HOST: "127.0.0.1", HUD_DATA_DIR: DATA, HERDR_BIN: join(DATA, "no-such-herdr"), HUD_TRUSTED_ORIGINS: `${PHONE}/` },
  });
  BASE = server.base;
});

afterAll(async () => {
  await server?.stop();
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
