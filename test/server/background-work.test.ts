// An idle agent whose pane says shells or a monitor are still running is working, not waiting on HQ.
// A stub herdr reports three idle agents; the pane of each ends differently.
import { afterAll, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const data = mkdtempSync(join(tmpdir(), "hq-bg-test-"));
const herdr = join(data, "herdr");
const agents = JSON.stringify({ result: { agents: [
  { name: "shells-lane", agent_status: "idle", pane_id: "p1", agent: "claude" },
  { name: "monitor-lane", agent_status: "done", pane_id: "p2", agent: "claude" },
  { name: "quiet-lane", agent_status: "idle", pane_id: "p3", agent: "claude" },
  { name: "agent-lane", agent_status: "done", pane_id: "p4", agent: "claude" },
  { name: "subagent-lane", agent_status: "idle", pane_id: "p5", agent: "claude" },
] } });
writeFileSync(herdr, `#!/bin/sh
case "$*" in
  *"agent list"*) echo '${agents}' ;;
  *"pane read p1"*) printf '❯\\n  ⏵⏵ bypass permissions on (shift+tab to cycle) · 2 shells still running\\n' ;;
  *"pane read p2"*) printf '❯\\n  ⏵⏵ accept edits on · monitor still running\\n' ;;
  *"pane read p3"*) printf '❯\\n  ⏵⏵ bypass permissions on (shift+tab to cycle)\\n' ;;
  *"pane read p4"*) printf '❯\\n  ⏵⏵ bypass permissions on · ← 1 agent · PR #1 · 1 shell, 1 monitor\\n\\n  ⏺ main\\n' ;;
  *"pane read p5"*) printf '❯\\n  ⏵⏵ bypass permissions on\\n\\n  ⏺ main\\n  ◯ general-purpose  Running measurements   34m 0s\\n' ;;
esac
exit 0
`);
chmodSync(herdr, 0o755);
const probe = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response() });
const port = probe.port;
probe.stop(true);
const base = `http://127.0.0.1:${port}`;
const server = Bun.spawn([process.execPath, "server.ts"], {
  cwd: ROOT,
  env: { ...process.env, HUD_PORT: String(port), HUD_HOST: "127.0.0.1", HUD_DATA_DIR: data, HERDR_BIN: herdr, HUD_MACHINES: "local", HUD_LOCAL_MACHINE: "local" },
  stdout: "ignore",
  stderr: "ignore",
});
afterAll(async () => {
  server.kill();
  await server.exited;
  rmSync(data, { recursive: true, force: true });
});
const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-hud": "1" }, body: JSON.stringify(body) });

test("idle with shells or a monitor still running reads as moving; idle without reads as HQ's turn", async () => {
  for (const deadline = Date.now() + 8000; Date.now() < deadline; await Bun.sleep(100)) {
    try { if ((await fetch(`${base}/api/state`)).ok) break; } catch {}
  }
  for (const name of ["shells-lane", "monitor-lane", "quiet-lane", "agent-lane", "subagent-lane"]) await post("/api/lanes", { name, machine: "local" });
  await post("/api/sync", {});
  const lanes = Object.fromEntries((await (await fetch(`${base}/api/state`)).json()).lanes.map((l: any) => [l.name, l]));
  expect(lanes["shells-lane"].status).toBe("moving");
  expect(lanes["shells-lane"].bg).toBe("2 shells still running");
  expect(lanes["monitor-lane"].status).toBe("moving");
  expect(lanes["quiet-lane"].status).toBe("hq_turn");
  expect(lanes["agent-lane"].status).toBe("moving");
  expect(lanes["agent-lane"].bg).toBe("← 1 agent");
  expect(lanes["subagent-lane"].status).toBe("moving");
  expect(lanes["subagent-lane"].bg).toBe("subagent general-purpose running");
  expect(lanes["quiet-lane"].bg).toBeNull();
});
