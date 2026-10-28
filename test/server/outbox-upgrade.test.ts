// Upgrading to confirmed delivery never replays the past: rows from before the confirmed_at column count as
// confirmed, so a server that starts on an old outbox sends nothing again.
import { afterAll, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnServer } from "../../scripts/room-hash.ts";

const ROOT = join(import.meta.dir, "..", "..");
const data = mkdtempSync(join(tmpdir(), "hq-outbox-upgrade-"));
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
// The outbox as 0.16.0 left it: no confirmed_at, no resend, two rows typed in long ago.
const old = new Database(join(data, "hud.db"));
old.exec(`CREATE TABLE hq_outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, text TEXT NOT NULL, ref TEXT, sent_at INTEGER, error TEXT, tries INTEGER NOT NULL DEFAULT 0)`);
const t = Date.now() - 60_000;
old.query("INSERT INTO hq_outbox (at, text, ref, sent_at, tries) VALUES (?, ?, ?, ?, 1)").run(t, "HUD note from the owner: old one", "note:1", t);
old.query("INSERT INTO hq_outbox (at, text, ref, sent_at, tries) VALUES (?, ?, ?, ?, 1)").run(t, "HUD answer #1: old answer", "ask:1", t);
old.close();

let server: Awaited<ReturnType<typeof spawnServer>> | null = null;
afterAll(async () => {
  await server?.stop();
  rmSync(data, { recursive: true, force: true });
});

test("a server starting on an old outbox sends none of it again", async () => {
  server = await spawnServer({ cwd: ROOT, env: { ...process.env, HUD_HOST: "127.0.0.1", HUD_DATA_DIR: data, HERDR_BIN: herdr, HUD_MACHINES: "local", HUD_LOCAL_MACHINE: "local", HUD_HQ_AGENT: "hq", HUD_HQ_HINT: "0" } });
  await fetch(`${server.base}/api/hq/check`, { method: "POST", headers: { "content-type": "application/json", "x-hud": "1" }, body: "{}" });
  await Bun.sleep(400);
  expect(existsSync(log) ? readFileSync(log, "utf8") : "").toBe("");
});
