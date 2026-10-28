// An action the owner must do (kind action) is answered DONE, which closes it as before, or NOT YET, which keeps it
// open: HQ hears it at once, and a line on the card says when and what the owner added.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnServer } from "../../scripts/room-hash.ts";

const ROOT = join(import.meta.dir, "..", "..");
const data = mkdtempSync(join(tmpdir(), "hq-not-yet-test-"));
const herdr = join(data, "herdr");
const log = join(data, "prompts.log");
writeFileSync(herdr, `#!/bin/sh
case "$1 $2" in
  "agent list") echo '{"result":{"agents":[{"name":"hq","agent_status":"idle","pane_id":"w8:p1","agent":"claude"}]}}' ;;
  "agent prompt") printf '%s\\n<<END>>\\n' "$4" >> "${log}" ;;
esac
exit 0
`);
chmodSync(herdr, 0o755);
let server: Awaited<ReturnType<typeof spawnServer>>;
beforeAll(async () => {
  server = await spawnServer({ cwd: ROOT, env: { ...process.env, HUD_HOST: "127.0.0.1", HUD_DATA_DIR: data, HERDR_BIN: herdr, HUD_MACHINES: "local", HUD_LOCAL_MACHINE: "local", HUD_HQ_AGENT: "hq", HUD_HQ_HINT: "0", HUD_OWNER: "" } });
});
afterAll(async () => {
  await server?.stop();
  rmSync(data, { recursive: true, force: true });
});
const post = (path: string, body: unknown) => fetch(`${server.base}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-hud": "1" }, body: JSON.stringify(body) });
const state = async () => (await fetch(`${server.base}/api/state`)).json();
const prompts = () => (existsSync(log) ? readFileSync(log, "utf8").split("\n<<END>>\n").filter(Boolean) : []);
const until = async (ok: () => boolean) => { for (let i = 0; i < 80 && !ok(); i++) await Bun.sleep(25); };

test("NOT YET keeps the action open, tells HQ, and puts a line on the card", async () => {
  const { id } = await (await post("/api/asks", { title: "Record the demo", kind: "action", lane: "golf" })).json();
  const res = await post(`/api/asks/${id}/notyet`, { note: "after lunch" });
  expect(res.status).toBe(200);
  const s = await state();
  expect(s.open.map((a: any) => a.id)).toContain(id);
  expect(s.ledger[id].comments.at(-1).text).toBe("the owner: not yet. after lunch");
  await until(() => prompts().some((p) => p.includes("not yet")));
  expect(prompts().find((p) => p.includes("not yet"))).toBe(`HUD not yet #${id} (golf): "Record the demo" -> after lunch`);
});

test("NOT YET without a note, and only on an open ask", async () => {
  const { id } = await (await post("/api/asks", { title: "Merge the PR", kind: "action" })).json();
  expect((await post(`/api/asks/${id}/notyet`, {})).status).toBe(200);
  expect((await state()).ledger[id].comments.at(-1).text).toBe("the owner: not yet");
  await post(`/api/asks/${id}/answer`, { answer: "done" });
  expect((await post(`/api/asks/${id}/notyet`, {})).status).toBe(400);
});
