// Recruit end to end: a throwaway server, a fake herdr (steered by flag files), a fake guard, a fake ssh that runs the
// remote command here, and a fake HOME with three Claude accounts. Nothing real is started, measured or reached.
import { Database } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnServer } from "../../scripts/room-hash.ts";

const ROOT = join(import.meta.dir, "..", "..");
const TMP = mkdtempSync(join(tmpdir(), "hq-office-recruit-"));
const DATA = join(TMP, "data");
const HOME = join(TMP, "home");
const FLAGS = join(TMP, "flags");
const START_ROOT = join(TMP, "floors");
const LOG = join(TMP, "commands.log");
const PROMPTS = join(TMP, "prompts.log");
const SSH_LOG = join(TMP, "ssh.log");
let server: Awaited<ReturnType<typeof spawnServer>>;
let BASE = "";

const put = (path: string, text: string, mode?: number) => {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
  if (mode) chmodSync(path, mode);
};
const flag = (name: string, on = true) => (on ? writeFileSync(join(FLAGS, name), "") : rmSync(join(FLAGS, name), { force: true }));
const usage = (account: string, sessionUsed: number, weeklyUsed: number) => put(join(HOME, `.local/state/hq-office/claude-usage/${account}.json`), JSON.stringify({ rate_limits: { five_hour: { used_percentage: sessionUsed, resets_at: Math.floor(Date.now() / 1000) + 7200 }, seven_day: { used_percentage: weeklyUsed, resets_at: Math.floor(Date.now() / 1000) + 90_000 } } }));

async function startServer() {
  server = await spawnServer({
    cwd: ROOT,
    env: {
      ...process.env,
      HOME,
      PATH: `${join(TMP, "bin")}:${process.env.PATH}`,
      HUD_HOST: "127.0.0.1",
      HUD_DATA_DIR: DATA,
      HERDR_BIN: join(TMP, "bin/herdr"),
      HUD_MACHINES: "local,other",
      HUD_LOCAL_MACHINE: "local",
      HUD_HQ_HINT: "0",
      HUD_START_ROOT: START_ROOT,
      HUD_CAPACITY_GUARD: join(TMP, "bin/guard"),
      HUD_START_POLL_MS: "20",
      HUD_START_AGENT_WAIT_MS: "150",
      HUD_START_READY_WAIT_MS: "600",
      HUD_RECRUIT_HOLD_MS: "150",
    },
  });
  BASE = server.base;
}

beforeAll(async () => {
  // Homes: default (no usage recorded), work (plenty left), low (10% of its window left), out (none).
  put(join(HOME, ".claude/.credentials.json"), "{}");
  for (const a of ["work", "low", "out"]) put(join(HOME, `.claude-${a}/.claude.json`), "{}");
  usage("work", 12, 40);
  usage("low", 90, 20);
  usage("out", 100, 20);
  mkdirSync(FLAGS, { recursive: true });
  // The fake herdr logs every command. A flag file makes one command fail (fail-workspace, fail-agent, fail-prompt, fail-stop),
  // never-ready keeps the agent starting, slow-prompt holds the brief for a second.
  put(join(TMP, "bin/herdr"), `#!/bin/sh
F='${FLAGS}'
printf '%s\\n' "$*" >> '${LOG}'
case "$*" in *"--machine "*) set -- $(echo "$*" | sed 's/--machine [a-z]* //') ;; esac
fail() { [ -e "$F/fail-$1" ] && { echo "boom in $1" >&2; exit 1; }; }
case "$1 $2" in
  "machine list") echo '[{"label":"other","target":"fake-target"}]' ;;
  "workspace create") fail workspace; echo '{"result":{"root_pane":{"pane_id":"w1:p1"}}}' ;;
  "agent start") fail agent; echo "$3" > "$F/started" ;;
  "agent list")
    if [ ! -e "$F/started" ]; then echo '{"result":{"agents":[]}}'
    elif [ -e "$F/never-ready" ]; then echo '{"result":{"agents":[{"name":"'$(cat "$F/started")'","agent_status":"unknown","pane_id":"w1:p1"}]}}'
    else echo '{"result":{"agents":[{"name":"'$(cat "$F/started")'","agent":"claude","agent_status":"idle","interactive_ready":true,"pane_id":"w1:p1"}]}}'; fi ;;
  "agent prompt") fail prompt; [ -e "$F/slow-prompt" ] && sleep 1; printf '%s|%s\\n<<END>>\\n' "$3" "$4" >> '${PROMPTS}' ;;
  "agent stop"|"pane close") fail stop ;;
esac
exit 0
`, 0o755);
  // The guard: go, unless a flag says hold (exit 1) or stop (exit 2).
  put(join(TMP, "bin/guard"), `#!/bin/sh\n[ -e '${FLAGS}/guard-stop' ] && { echo "30 GiB free -> stop"; exit 2; }\n[ -e '${FLAGS}/guard-hold' ] && { echo "45 GiB free -> hold"; exit 1; }\necho "80 GiB free -> go"\n`, 0o755);
  // The fake ssh runs the remote command here, so the folder step's script is the one that would run there.
  put(join(TMP, "bin/ssh"), `#!/bin/sh\nfor a; do last="$a"; done\nprintf '%s\\n' "$last" >> '${SSH_LOG}'\nexec sh -c "$last"\n`, 0o755);
  mkdirSync(DATA, { recursive: true });
  await startServer();
  // Wait for the first account reading of both machines.
  for (let i = 0; i < 100; i++) {
    const views = (await (await fetch(`${BASE}/api/accounts`)).json()) as any[];
    if (views.length === 2 && views.every((v) => v.ok)) break;
    await Bun.sleep(100);
  }
});
afterAll(async () => {
  await server?.stop();
  rmSync(TMP, { recursive: true, force: true });
});
beforeEach(() => {
  for (const f of ["fail-workspace", "fail-agent", "fail-prompt", "fail-stop", "never-ready", "slow-prompt", "guard-hold", "guard-stop", "started"]) flag(f, false);
  rmSync(LOG, { force: true });
  rmSync(PROMPTS, { force: true });
});

const post = async (path: string, body: object) => {
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-hud": "1" }, body: JSON.stringify(body) });
  return { status: res.status, ...((await res.json()) as any) };
};
const state = async () => (await (await fetch(`${BASE}/api/state`)).json()) as any;
const recruitsOf = async (name: string) => (await state()).recruits.filter((r: any) => r.name === name);
const commands = () => (existsSync(LOG) ? readFileSync(LOG, "utf8").trim().split("\n").filter(Boolean) : []);
const prompts = () => (existsSync(PROMPTS) ? readFileSync(PROMPTS, "utf8").split("\n<<END>>\n").filter(Boolean) : []);
const ask = (name: string, over: object = {}) => post("/api/recruit", { name, floor: `Floor of ${name}`, machine: "local", brief: `Brief for ${name}.`, ...over });
const stepsOf = (r: any) => r.steps.map((s: any) => `${s.ok ? "" : "!"}${s.step}`);
async function until(name: string, states: string[]) {
  for (let i = 0; i < 200; i++) {
    const r = (await recruitsOf(name))[0];
    if (r && states.includes(r.state)) return r;
    await Bun.sleep(50);
  }
  throw new Error(`${name} never reached ${states.join("/")}: ${JSON.stringify(await recruitsOf(name))}`);
}
const sql = <T>(fn: (db: Database) => T) => {
  const db = new Database(join(DATA, "hud.db"));
  db.exec("PRAGMA busy_timeout = 5000;");
  try {
    return fn(db);
  } finally {
    db.close();
  }
};

test("a recruit comes up: folder and brief, agent, brief typed, a lane under HQ, a live floor with its head", async () => {
  const reply = await ask("orch-a", { brief: "Build the thing.", account: "work" });
  expect(reply).toMatchObject({ status: 200, state: "starting" });
  const r = await until("orch-a", ["up", "failed"]);
  expect(r.state).toBe("up");
  expect(stepsOf(r)).toEqual(["check", "folder", "workspace", "agent", "ready", "brief", "lane", "floor"]);
  expect(r).toMatchObject({ head: true, parent: null, asked_by: "owner", model: "sonnet", machine: "local", account: "work", pane: "w1:p1", cwd: join(START_ROOT, "orch-a") });
  expect(readFileSync(join(START_ROOT, "orch-a/brief.md"), "utf8").trim()).toBe("Build the thing.");

  // The agent starts in its folder on the account, and the first prompt is typed with a wait for it to start working.
  expect(commands().find((c) => c.startsWith("workspace create"))).toContain(`--cwd ${join(START_ROOT, "orch-a")}`);
  expect(commands().find((c) => c.startsWith("workspace create"))).toContain(`CLAUDE_CONFIG_DIR=${join(HOME, ".claude-work")}`);
  expect(commands().find((c) => c.startsWith("agent start"))).toContain("--model sonnet");
  expect(commands().find((c) => c.startsWith("agent prompt orch-a"))).toContain("--wait --until working");
  expect(prompts()[0]).toMatch(/^orch-a\|You are the Orchestrator of floor "Floor of orch-a"\..*brief\.md.*hud guide/);

  const s = await state();
  const lane = s.lanes.find((l: any) => l.name === "orch-a");
  expect(lane).toMatchObject({ parent: null, depth: 1, machine: "local", pane: "w1:p1", floor: "orch-a", heads: true });
  expect(s.floors.find((f: any) => f.id === "orch-a")).toMatchObject({ name: "Floor of orch-a", head: "orch-a", origin: "recruited", machine: "local", dir: join(START_ROOT, "orch-a") });
  expect(s.events.some((e: any) => e.who === "owner" && e.lane === "orch-a" && e.text.includes("Floor of orch-a") && e.text.includes("local") && e.text.includes("sonnet"))).toBe(true);
  expect(sql((db) => db.query("SELECT account FROM lane_accounts WHERE lane = 'orch-a'").get())).toEqual({ account: "work" });
});

test("the head of a floor may run on opus", async () => {
  await ask("orch-opus", { model: "Opus" });
  expect((await until("orch-opus", ["up", "failed"])).state).toBe("up");
  expect(commands().find((c) => c.startsWith("agent start"))).toContain("--model opus");
});

test("on the other machine the folder is made through ssh and every herdr command carries --machine", async () => {
  await ask("orch-far", { machine: "other" });
  const r = await until("orch-far", ["up", "failed"]);
  expect(r.state).toBe("up");
  expect(readFileSync(SSH_LOG, "utf8")).toContain("brief.md");
  expect(existsSync(join(START_ROOT, "orch-far/brief.md"))).toBe(true);
  expect(commands().filter((c) => /^(--machine other )?(workspace|agent start|agent prompt)/.test(c)).every((c) => c.startsWith("--machine other "))).toBe(true);
});

test("every refusal says why, and leaves no trace", async () => {
  await post("/api/lanes", { name: "busy-lane" });
  flag("guard-hold");
  await ask("held-one", { machine: "other" }); // a held recruit has no lane yet, only its row
  sql((db) => db.query("INSERT INTO floors (id, name, head, origin, color, created_at) VALUES ('ghost', 'Ghost', 'ghost', 'recruited', 9, 1)").run());
  const refused: [string, object, RegExp][] = [
    ["bad name: capitals", { name: "Orch" }, /lowercase/],
    ["bad name: spaces", { name: "an orch" }, /lowercase/],
    ["bad name: too long", { name: "a".repeat(33) }, /at most 32/],
    ["bad name: owner", { name: "owner" }, /owner or HQ/],
    ["bad name: hq", { name: "hq" }, /owner or HQ/],
    ["a lane has the name", { name: "busy-lane" }, /lane is already named/],
    ["a live recruit has the name", { name: "held-one" }, /already being recruited or is up/],
    ["a live floor has the name", { name: "ghost" }, /floor already has/],
    ["fable", { name: "wants-fable", model: "fable" }, /Fable runs only HQ itself; a recruit runs on Sonnet, or Opus for a judgment role/],
    ["fable by another name", { name: "wants-fable", model: "claude-fable-5" }, /Fable runs only HQ/],
    ["an unknown model", { name: "wants-gpt", model: "gpt-5" }, /unknown model/],
    ["an account that is OUT", { name: "wants-out", account: "out" }, /OUT/],
    ["an account that is low", { name: "wants-low", account: "low" }, /low.*10%/],
    ["an unknown account", { name: "wants-nope", account: "nope" }, /no Claude account named nope/],
    ["an unknown machine", { name: "wants-mars", machine: "mars" }, /no machine named mars/],
    ["no brief", { name: "wants-nothing", brief: "  " }, /brief is required/],
    ["no floor name", { name: "wants-floor", floor: "" }, /floor needs a name/],
  ];
  for (const [what, body, why] of refused) {
    const r = await ask("x", body);
    expect({ what, status: r.status, error: r.error }).toEqual({ what, status: 400, error: expect.stringMatching(why) });
  }
  flag("guard-stop");
  const stopped = await ask("wants-room", { machine: "other" });
  expect(stopped).toMatchObject({ status: 400, error: expect.stringMatching(/other cannot take another agent: .*stop/) });
  const names = (await state()).recruits.map((r: any) => r.name);
  for (const n of ["wants-fable", "wants-gpt", "wants-out", "wants-low", "wants-nope", "wants-mars", "wants-nothing", "wants-floor", "wants-room", "ghost", "busy-lane"]) expect(names).not.toContain(n);
  expect(existsSync(join(START_ROOT, "wants-room"))).toBe(false);
  await post("/api/recruit/stop", { name: "held-one" });
  expect(commands().some((c) => c.includes("workspace create"))).toBe(false);
});

test("a held recruit goes on once the guard says go", async () => {
  flag("guard-hold");
  const reply = await ask("orch-held", { machine: "other" });
  expect(reply).toMatchObject({ status: 200, state: "held" });
  await Bun.sleep(500);
  const held = (await recruitsOf("orch-held"))[0];
  expect(held.state).toBe("held");
  expect(stepsOf(held)).toEqual(["check", "!capacity"]);
  expect(commands().some((c) => c.includes("workspace create"))).toBe(false);
  flag("guard-hold", false);
  const up = await until("orch-held", ["up", "failed"]);
  expect(up.state).toBe("up");
  expect(stepsOf(up)).toEqual(["check", "!capacity", "capacity", "folder", "workspace", "agent", "ready", "brief", "lane", "floor"]);
});

test("a held recruit can be withdrawn, and then nothing starts", async () => {
  flag("guard-hold");
  await ask("orch-withdrawn", { machine: "other" });
  expect((await post("/api/recruit/stop", { name: "orch-withdrawn" })).status).toBe(200);
  flag("guard-hold", false);
  await Bun.sleep(500);
  expect((await recruitsOf("orch-withdrawn"))[0]).toMatchObject({ state: "withdrawn", stopped_at: expect.any(Number) });
  expect(commands().some((c) => c.includes("workspace create"))).toBe(false);
  expect(existsSync(join(START_ROOT, "orch-withdrawn"))).toBe(false);
  expect((await post("/api/recruit/stop", { name: "orch-withdrawn" })).error).toMatch(/no live recruit/);
});

// Each failure undoes what came before: no lane, no live floor, the agent stopped and the pane closed (where they exist).
const FAILURES: [string, string, string[], boolean, boolean][] = [
  // [flag, failing step, steps logged, agent stop expected, pane close expected]
  ["fail-workspace", "workspace", ["check", "folder", "!workspace"], false, false],
  ["fail-agent", "agent", ["check", "folder", "workspace", "!agent", "undo pane"], false, true],
  ["never-ready", "ready", ["check", "folder", "workspace", "agent", "!ready", "undo agent", "undo pane"], true, true],
  ["fail-prompt", "brief", ["check", "folder", "workspace", "agent", "ready", "!brief", "undo agent", "undo pane"], true, true],
];
for (const [name, step, steps, stopsAgent, closesPane] of FAILURES) {
  test(`a failure at ${step} is undone`, async () => {
    flag(name);
    const id = `orch-fail-${step}`;
    await ask(id);
    const r = await until(id, ["up", "failed"]);
    expect(r.state).toBe("failed");
    expect(r.error).toMatch(new RegExp(`^${step}: `));
    expect(stepsOf(r)).toEqual(steps);
    const s = await state();
    expect(s.lanes.some((l: any) => l.name === id)).toBe(false);
    expect(s.floors.some((f: any) => f.id === id && !f.stopped_at)).toBe(false);
    expect(commands().includes(`agent stop ${id}`)).toBe(stopsAgent);
    expect(commands().includes("pane close w1:p1")).toBe(closesPane);
    // The folder stays: it holds the brief, for a retry.
    expect(readFileSync(join(START_ROOT, id, "brief.md"), "utf8")).toContain(`Brief for ${id}`);
    expect(s.events.some((e: any) => e.lane === id && e.text.includes(`failed at ${step}`))).toBe(true);
  });
}

test("an undo step that fails is logged and the rest of the undo goes on", async () => {
  flag("fail-prompt");
  flag("fail-stop");
  await ask("orch-fail-undo");
  const r = await until("orch-fail-undo", ["up", "failed"]);
  expect(stepsOf(r).slice(-3)).toEqual(["!brief", "!undo agent", "!undo pane"]);
  expect(commands()).toContain("pane close w1:p1");
});

test("a failure after the lane is made (the floor step) removes the lane too", async () => {
  flag("slow-prompt");
  await ask("orch-fail-floor");
  await until("orch-fail-floor", ["starting"]);
  // While the brief is typed, a live floor takes the head's name.
  for (let i = 0; i < 100 && !commands().some((c) => c.startsWith("agent prompt")); i++) await Bun.sleep(20);
  sql((db) => db.query("INSERT INTO floors (id, name, head, origin, color, created_at) VALUES ('squatter', 'Squatter', 'orch-fail-floor', 'recruited', 8, 1)").run());
  const r = await until("orch-fail-floor", ["up", "failed"]);
  expect(r.state).toBe("failed");
  expect(stepsOf(r)).toEqual(["check", "folder", "workspace", "agent", "ready", "brief", "lane", "!floor", "undo lane", "undo agent", "undo pane"]);
  expect((await state()).lanes.some((l: any) => l.name === "orch-fail-floor")).toBe(false);
  expect(commands()).toContain("agent stop orch-fail-floor");
});

test("two recruits of one name at once: one is refused", async () => {
  const [a, b] = await Promise.all([ask("orch-twin"), ask("orch-twin")]);
  expect([a.status, b.status].sort()).toEqual([200, 400]);
  expect([a, b].find((x) => x.status === 400).error).toMatch(/already being recruited/);
  await until("orch-twin", ["up", "failed"]);
  expect(await recruitsOf("orch-twin")).toHaveLength(1);
});

test("stop: the agent stops, the pane closes, the floor row stops and the lane goes", async () => {
  await ask("orch-stop");
  await until("orch-stop", ["up"]);
  rmSync(LOG);
  expect((await post("/api/recruit/stop", { name: "orch-stop" })).status).toBe(200);
  expect(commands()).toEqual(["agent stop orch-stop", "pane close w1:p1"]);
  const r = (await recruitsOf("orch-stop"))[0];
  expect(r).toMatchObject({ state: "stopped", error: null, stopped_at: expect.any(Number) });
  const s = await state();
  expect(s.lanes.some((l: any) => l.name === "orch-stop")).toBe(false);
  expect(s.floors.some((f: any) => f.id === "orch-stop")).toBe(false);
  expect(s.events.some((e: any) => e.lane === "orch-stop" && e.text.startsWith("stopped orch-stop"))).toBe(true);
  // Its name is free again, and its folder is kept.
  await ask("orch-stop");
  expect((await until("orch-stop", ["up", "failed"])).state).toBe("up");
});

test("a stop whose agent is already gone still ends the recruit, and says what failed", async () => {
  await ask("orch-gone");
  await until("orch-gone", ["up"]);
  flag("fail-stop");
  expect((await post("/api/recruit/stop", { name: "orch-gone" })).status).toBe(200);
  const r = (await recruitsOf("orch-gone"))[0];
  expect(r.state).toBe("stopped");
  expect(r.error).toMatch(/stop agent: boom in stop; close pane: boom in stop/);
  expect((await state()).lanes.some((l: any) => l.name === "orch-gone")).toBe(false);
});

// ---- hud recruit ----

async function hud(...args: string[]) {
  const proc = Bun.spawn([process.execPath, join(ROOT, "hud.ts"), ...args], { env: { ...process.env, HUD_URL: BASE, HUD_RECRUIT_POLL_MS: "50" }, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { out, err, code };
}

test("hud recruit --wait prints each step until the recruit is up, then hud recruit stop ends it", async () => {
  put(join(TMP, "brief-file.md"), "From a file.\n");
  const r = await hud("recruit", "orch-cli", "--floor", "CLI floor", "--machine", "local", "--brief-file", join(TMP, "brief-file.md"), "--wait");
  expect(r.code).toBe(0);
  expect(r.out).toContain("recruit orch-cli");
  for (const step of ["check", "folder", "workspace", "agent", "ready", "brief", "lane", "floor"]) expect(r.out).toContain(`ok     ${step}`);
  expect(r.out).toContain('orch-cli is up on floor "CLI floor"');
  expect(readFileSync(join(START_ROOT, "orch-cli/brief.md"), "utf8")).toBe("From a file.\n");
  expect((await recruitsOf("orch-cli"))[0].asked_by).toBe("hq");
  const stop = await hud("recruit", "stop", "orch-cli");
  expect(stop).toMatchObject({ code: 0, out: "stopped orch-cli\n" });
  expect((await recruitsOf("orch-cli"))[0].state).toBe("stopped");
});

test("hud recruit --wait on a failed start prints the failed step, exits 1; a refusal exits 1 with its reason", async () => {
  flag("fail-prompt");
  const failed = await hud("recruit", "orch-cli-fail", "--floor", "F", "--machine", "local", "--brief", "x", "--wait");
  expect(failed.code).toBe(1);
  expect(failed.out).toContain("FAILED brief");
  expect(failed.err).toContain("orch-cli-fail failed: brief:");
  const refused = await hud("recruit", "orch-cli-fable", "--floor", "F", "--machine", "local", "--brief", "x", "--model", "fable");
  expect(refused).toMatchObject({ code: 1, err: expect.stringContaining("Fable runs only HQ itself") });
});

// ---- a restart ----

test("after a restart a start the server did not see through reads failed, and a held recruit goes on", async () => {
  const row = (name: string, machine: string, state: string) => sql((db) => db.query("INSERT INTO recruits (name, floor, asked_by, model, machine, brief, state, created_at) VALUES (?, 'Restart floor', 'owner', 'sonnet', ?, 'Brief.', ?, ?)").run(name, machine, state, Date.now()));
  row("orch-mid-start", "local", "starting");
  row("orch-was-held", "other", "held");
  await server.stop();
  await startServer();
  expect(await until("orch-mid-start", ["failed"])).toMatchObject({ error: expect.stringContaining("restart") });
  expect((await until("orch-was-held", ["up", "failed"])).state).toBe("up");
});
