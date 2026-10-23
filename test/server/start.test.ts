// The server starts from the repo root (bun server.ts, as the service and the plugin run it), serves the page shell
// with every stylesheet and the entry module, serves each client file with its type and a 304 when unchanged,
// refuses anything outside src/client, and answers /api/state with what the page reads.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const probe = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response() });
const PORT = probe.port;
probe.stop(true);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = mkdtempSync(join(tmpdir(), "hq-office-start-"));
let server: ReturnType<typeof Bun.spawn>;

beforeAll(async () => {
  server = Bun.spawn([process.execPath, "server.ts"], {
    cwd: ROOT,
    env: { ...process.env, HUD_PORT: String(PORT), HUD_HOST: "127.0.0.1", HUD_DATA_DIR: DATA, HERDR_BIN: join(DATA, "no-such-herdr") },
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

const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const clientFiles = walk(join(ROOT, "src", "client")).map((f) => "/" + relative(ROOT, f).split("\\").join("/"));

test("the page links every stylesheet, core first, and loads main.js", async () => {
  const res = await fetch(`${BASE}/`);
  expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
  const html = await res.text();
  expect(html).toContain("HQ OFFICE");
  expect(html).toContain(`<script type="module" src="/src/client/main.js"></script>`);
  const links = [...html.matchAll(/<link rel="stylesheet" href="(\/src\/client\/[^"]+)">/g)].map((m) => m[1]);
  expect([...links].sort()).toEqual(clientFiles.filter((f) => f.endsWith(".css")).sort());
  const firstOther = links.findIndex((l) => !l.startsWith("/src/client/core/"));
  expect(links.slice(firstOther).some((l) => l.startsWith("/src/client/core/"))).toBe(false);
});

test("every client file is served with its type, and revalidates to 304", async () => {
  for (const f of clientFiles) {
    const res = await fetch(`${BASE}${f}`);
    expect({ f, status: res.status }).toEqual({ f, status: 200 });
    expect(res.headers.get("content-type")).toBe(f.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/css; charset=utf-8");
    const again = await fetch(`${BASE}${f}`, { headers: { "if-none-match": res.headers.get("etag")! } });
    expect(again.status).toBe(304);
  }
});

test("nothing outside src/client is served", async () => {
  for (const p of ["/src/server/config.ts", "/src/client/../server/config.ts", "/src/client/%2e%2e/server/config.ts", "/hud.db", "/server.ts", "/src/client/main.ts"]) {
    expect({ p, status: (await fetch(`${BASE}${p}`)).status }).toEqual({ p, status: 404 });
  }
});

test("state has what the page reads", async () => {
  const state = await (await fetch(`${BASE}/api/state`)).json();
  for (const key of ["now", "version", "lanes", "open", "answered", "notes", "updates", "updatesUnread", "events", "score", "untracked", "sync", "page", "config", "machines"]) expect(state).toHaveProperty(key);
  expect(typeof state.page).toBe("number");
});

test("unknown routes are 404, writes without the header 403", async () => {
  expect((await fetch(`${BASE}/api/nope`)).status).toBe(404);
  expect((await fetch(`${BASE}/api/nope`, { method: "POST", headers: { "x-hud": "1" }, body: "{}" })).status).toBe(404);
  expect((await fetch(`${BASE}/api/lanes`, { method: "POST", body: "{}" })).status).toBe(403);
});
