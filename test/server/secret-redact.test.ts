// hud secret redact NAME: a secret's value that was typed somewhere it should not be (an answer, a note, an update)
// is replaced with [secret NAME] everywhere it is stored, by the server, which holds the value: it never passes
// through the command. Only this machine, never a browser. Overwritten pages are zeroed and the WAL truncated, so the
// value is gone from the files.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnServer } from "../../scripts/room-hash.ts";

const ROOT = join(import.meta.dir, "..", "..");
const DATA = mkdtempSync(join(tmpdir(), "hq-redact-"));
const VALUE = "TEST_ONLY_REDACT_ME_5d1e";
let server: Awaited<ReturnType<typeof spawnServer>>;
const post = (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(`${server.base}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-hud": "1", ...headers }, body: JSON.stringify(body) });
beforeAll(async () => {
  server = await spawnServer({ cwd: ROOT, env: { ...process.env, HUD_HOST: "127.0.0.1", HUD_DATA_DIR: DATA, HERDR_BIN: join(DATA, "no-herdr"), HUD_MACHINES: "local" } });
  await post("/api/secrets", { name: "REVIEW_PASS", value: VALUE, minutes: 60, by: "owner" });
  const { id } = await (await post("/api/asks", { title: "The reviewer login?", body: `use ${VALUE} for now` })).json();
  await post(`/api/asks/${id}/answer`, { answer: `it is ${VALUE}, thanks` });
  await post("/api/notes", { text: `again: ${VALUE}` });
});
afterAll(async () => {
  await server?.stop();
  rmSync(DATA, { recursive: true, force: true });
});
const inFiles = () => readdirSync(DATA).filter((f) => f.startsWith("hud.db")).filter((f) => readFileSync(join(DATA, f)).toString("latin1").includes(VALUE));

test("refused from a browser page", async () => {
  expect((await post("/api/secrets/redact", { name: "REVIEW_PASS" }, { origin: server.base, "sec-fetch-site": "same-origin" })).status).toBe(403);
});

test("the value is replaced everywhere it is stored, counted per table, and gone from the database files", async () => {
  const res = await post("/api/secrets/redact", { name: "REVIEW_PASS" });
  expect(res.status).toBe(200);
  const out = await res.json();
  expect(out.rows).toBeGreaterThanOrEqual(4); // the ask's body and answer, the note, the events
  const s = await (await fetch(`${server.base}/api/state`)).text();
  expect(s.includes(VALUE)).toBe(false);
  expect(s).toContain("[secret REVIEW_PASS]");
  expect(inFiles()).toEqual([]);
  const ev = JSON.parse(s).events.find((e: any) => e.text.startsWith("redacted REVIEW_PASS"));
  expect(ev).toBeTruthy();
});
