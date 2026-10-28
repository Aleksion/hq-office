// FLOORS, the upgrade: a database from before floors gets its first floor at start, and every existing row is put on
// it. The first floor is "hq" / "HQ" (or named by HUD_FLOOR_NAME), and its HQ agent is HUD_HQ_AGENT.
import { afterAll, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnServer } from "../../scripts/room-hash.ts";

const ROOT = join(import.meta.dir, "..", "..");
const SCHEMA = join(ROOT, "src", "server", "schema");
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

// A data dir holding a database as a version without floors left it: today's tables minus floors, a row in each.
function oldData() {
  const data = mkdtempSync(join(tmpdir(), "hq-floors-upgrade-"));
  dirs.push(data);
  const db = new Database(join(data, "hud.db"), { create: true });
  for (const f of readdirSync(SCHEMA).filter((f) => f.endsWith(".sql") && f !== "floors.sql").sort()) {
    db.exec(readFileSync(join(SCHEMA, f), "utf8").replace(/,\s*floor TEXT/g, ""));
  }
  const now = Date.now();
  db.query("INSERT INTO lanes (name, phase, updated_at) VALUES ('old-lane', 'running', ?)").run(now);
  db.query("INSERT INTO asks (lane, title, created_at) VALUES ('old-lane', 'Old question', ?)").run(now);
  db.query("INSERT INTO updates (at, title) VALUES (?, 'Old update')").run(now);
  db.query("INSERT INTO notes (at, text) VALUES (?, 'Old note')").run(now);
  db.query("INSERT INTO rooms (slug, title, owner, created_at) VALUES ('old-room', 'Old room', 'old-lane', ?)").run(now);
  db.query("INSERT INTO events (at, lane, who, text) VALUES (?, 'old-lane', 'hq', 'old event')").run(now);
  db.query("INSERT INTO hq_outbox (at, text, sent_at) VALUES (?, 'old message', ?)").run(now, now);
  db.close();
  const herdr = join(data, "herdr");
  writeFileSync(herdr, `#!/bin/sh\necho '{"result":{"agents":[]}}'\nexit 0\n`);
  chmodSync(herdr, 0o755);
  return { data, herdr };
}

async function start(extra: Record<string, string>) {
  const { data, herdr } = oldData();
  const server = await spawnServer({ cwd: ROOT, env: { ...process.env, HUD_FLOOR_NAME: undefined, HUD_HOST: "127.0.0.1", HUD_DATA_DIR: data, HERDR_BIN: herdr, HUD_MACHINES: "local", HUD_LOCAL_MACHINE: "local", HUD_GH_BIN: "false", ...extra } });
  return { server, data };
}

test("the first start makes floor one from HUD_HQ_AGENT, and every existing row lands on it", async () => {
  const { server, data } = await start({ HUD_HQ_AGENT: "main-hq" });
  try {
    const s = await (await fetch(`${server.base}/api/state`)).json();
    expect(s.floors).toHaveLength(1);
    expect(s.floors[0]).toMatchObject({ id: "hq", name: "HQ", hq: "main-hq" });
    expect(s.lanes[0].floor).toBe("hq");
    expect(s.open[0].floor).toBe("hq");
    expect(s.updates[0].floor).toBe("hq");
    expect(s.notes[0].floor).toBe("hq");
    expect(s.rooms[0].floor).toBe("hq");
    expect(s.events.find((e: any) => e.text === "old event").floor).toBe("hq");
    expect(s.hq.agent).toBe("main-hq");
  } finally {
    await server.stop();
  }
  // Read after the server stopped: the outbox row is on the first floor too.
  const db = new Database(join(data, "hud.db"), { readonly: true });
  expect((db.query("SELECT floor FROM hq_outbox").get() as { floor: string }).floor).toBe("hq");
  db.close();
});

test("HUD_FLOOR_NAME names the first floor, and its id is that name as a slug", async () => {
  const { server } = await start({ HUD_HQ_AGENT: "hq", HUD_FLOOR_NAME: "Main Office" });
  try {
    const s = await (await fetch(`${server.base}/api/state`)).json();
    expect(s.floors[0]).toMatchObject({ id: "main-office", name: "Main Office", hq: "hq" });
    expect(s.lanes[0].floor).toBe("main-office");
  } finally {
    await server.stop();
  }
});
