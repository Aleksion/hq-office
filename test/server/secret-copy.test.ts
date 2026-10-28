// COPY on the SECRETS tab: POST /api/secrets/copy {name} gives the owner's page a secret's value for the clipboard.
// Only to a browser page of this HUD (its own origin, or one in HUD_TRUSTED_ORIGINS, as from the tailnet), same-origin
// (Sec-Fetch-Site), with x-hud; never to another site, never without an Origin (the CLI has `hud secret get`). Each
// copy is an event line; the value never reaches /api/state, the event log, the database or the server's log.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnServer } from "../../scripts/room-hash.ts";

const ROOT = join(import.meta.dir, "..", "..");
const DATA = mkdtempSync(join(tmpdir(), "hq-secret-copy-"));
const LOG = join(DATA, "server.log");
const TRUSTED = "https://hud.example.ts.net";
const VALUE = "TEST_ONLY_COPY_VALUE_7f3a";
let server: Awaited<ReturnType<typeof spawnServer>>;
let OWN = "";
beforeAll(async () => {
  server = await spawnServer({
    cwd: ROOT,
    env: { ...process.env, HUD_HOST: "127.0.0.1", HUD_DATA_DIR: DATA, HERDR_BIN: join(DATA, "no-herdr"), HUD_MACHINES: "local", HUD_TRUSTED_ORIGINS: TRUSTED, HUD_OWNER: "" },
    out: (chunk) => writeFileSync(LOG, chunk, { flag: "a" }),
  });
  OWN = server.base;
  const set = await fetch(`${OWN}/api/secrets`, { method: "POST", headers: { "content-type": "application/json", "x-hud": "1" }, body: JSON.stringify({ name: "REVIEW_LOGIN", value: VALUE, minutes: 60, by: "owner" }) });
  expect(set.status).toBe(200);
});
afterAll(async () => {
  await server?.stop();
  rmSync(DATA, { recursive: true, force: true });
});

const copy = (headers: Record<string, string>, name = "REVIEW_LOGIN") =>
  fetch(`${OWN}/api/secrets/copy`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ name }) });
const page = (origin: string) => ({ origin, "sec-fetch-site": "same-origin", "x-hud": "1" });

test("the owner's page, on this machine or a trusted origin, gets the value, and an event says so", async () => {
  for (const origin of [OWN, TRUSTED]) {
    const res = await copy(page(origin));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ value: VALUE });
  }
  const s = await (await fetch(`${OWN}/api/state`)).json();
  expect(s.events.filter((e: any) => e.text === "copied REVIEW_LOGIN" && e.who === "the owner")).toHaveLength(2);
});

test("refused: another site, no Origin, not same-origin, no x-hud", async () => {
  expect((await copy(page("https://evil.example"))).status).toBe(403);
  expect((await copy({ "x-hud": "1" })).status).toBe(403); // the CLI: it has hud secret get
  expect((await copy({ origin: OWN, "sec-fetch-site": "cross-site", "x-hud": "1" })).status).toBe(403);
  expect((await copy({ origin: OWN, "x-hud": "1" })).status).toBe(403);
  expect((await copy({ origin: OWN, "sec-fetch-site": "same-origin" })).status).toBe(403);
});

test("a name that is not set is a 404, without a value", async () => {
  const res = await copy(page(OWN), "NOPE");
  expect(res.status).toBe(404);
});

test("the value is nowhere but the answer to that click: not in the state, the events, the database or the log", async () => {
  const state = await (await fetch(`${OWN}/api/state`)).text();
  expect(state.includes(VALUE)).toBe(false);
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
  for (const f of files(DATA)) expect({ f, hit: readFileSync(f).toString("latin1").includes(VALUE) }).toEqual({ f, hit: false });
});
