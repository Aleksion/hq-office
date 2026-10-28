// startAgent, stopAgent and closePane against a fake herdr (HERDR_BIN). Each call runs in its own bun process, as
// the server would see it, with a throwaway data dir; the fake logs every command and is steered by files in a dir.
import { afterAll, beforeEach, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const DIR = mkdtempSync(join(tmpdir(), "hq-start-agent-"));
const LOG = join(DIR, "commands.log");
const FAKE = join(DIR, "fake-herdr");
afterAll(() => rmSync(DIR, { recursive: true, force: true }));

// Files in DIR steer the fake: fail-<verb> makes that command exit 1 saying so; dialog shows the folder-trust menu
// until Enter is sent; never-ready lists the agent as starting for ever; other-dialog blocks it on another menu.
writeFileSync(
  FAKE,
  `#!/bin/sh
D='${DIR}'
printf '%s\\n' "$*" >> "$D/commands.log"
case "$*" in *"--machine "*) set -- $(echo "$*" | sed 's/--machine [a-z]* //') ;; esac
verb="$1 $2"
fail() { [ -e "$D/fail-$1" ] && { echo "boom in $1" >&2; echo "noise" >&2; exit 1; }; }
case "$verb" in
  "workspace create") fail workspace; echo '{"result":{"root_pane":{"pane_id":"w1:p1"}}}' ;;
  "agent start") fail agent; touch "$D/started" ;;
  "agent list")
    fail list
    if [ ! -e "$D/started" ] || [ -e "$D/never-ready" ]; then echo '{"result":{"agents":[{"name":"a1","agent_status":"unknown","pane_id":"w1:p1"}]}}'
    elif { [ -e "$D/dialog" ] || [ -e "$D/other-dialog" ]; } && [ ! -e "$D/entered" ]; then echo '{"result":{"agents":[{"name":"a1","agent_status":"blocked","pane_id":"w1:p1"}]}}'
    else echo '{"result":{"agents":[{"name":"a1","agent_status":"idle","interactive_ready":true,"pane_id":"w1:p1"}]}}'; fi ;;
  "pane read")
    if [ -e "$D/other-dialog" ]; then printf 'Allow this tool?\\n❯ 1. Yes\\n  2. No\\nEsc to cancel\\n'
    else printf 'Do you trust the files in this folder?\\n❯ 1. No, exit\\n  2. Yes, I trust this folder\\nEnter to confirm · Esc to cancel\\n'; fi ;;
  "pane send-keys") fail trust; [ "$4" = "enter" ] && touch "$D/entered" ;;
  "agent stop"|"pane close") fail stop ;;
esac
exit 0
`,
);
chmodSync(FAKE, 0o755);

const DRIVER = join(DIR, "driver.ts");
writeFileSync(
  DRIVER,
  `import { startAgent, stopAgent, closePane } from ${JSON.stringify(join(ROOT, "src/server/herdr.ts"))};
const [call, ...rest] = process.argv.slice(2);
const arg = JSON.parse(rest[0] ?? "{}");
try {
  const out = call === "start" ? await startAgent(arg) : call === "stop" ? await stopAgent(arg.name, arg.machine) : await closePane(arg.pane, arg.machine);
  console.log(JSON.stringify({ out: out ?? null }));
} catch (e) { console.log(JSON.stringify({ threw: (e as Error).message })); }
process.exit(0);
`,
);

async function call(what: "start" | "stop" | "close", arg: object, env: Record<string, string> = {}): Promise<any> {
  const proc = Bun.spawn(["bun", DRIVER, what, JSON.stringify(arg)], {
    cwd: DIR,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, HERDR_BIN: FAKE, HUD_DATA_DIR: DIR, HUD_LOCAL_MACHINE: "local", HUD_START_POLL_MS: "20", HUD_START_AGENT_WAIT_MS: "150", HUD_START_READY_WAIT_MS: "600", ...env },
  });
  const [out] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  const result = JSON.parse(out.trim().split("\n").pop()!);
  return result.threw !== undefined ? result : result.out;
}

const START = { name: "a1", machine: "local", cwd: "/work/tree", model: "sonnet" };
const commands = () => (existsSync(LOG) ? readFileSync(LOG, "utf8").trim().split("\n").filter(Boolean) : []);

beforeEach(() => {
  for (const f of ["fail-workspace", "fail-agent", "fail-list", "fail-trust", "fail-stop", "dialog", "other-dialog", "never-ready", "started", "entered", "commands.log"]) rmSync(join(DIR, f), { force: true });
});

test("a start makes the workspace, starts the agent in its pane and returns once it is ready", async () => {
  expect(await call("start", START)).toEqual({ ok: true, pane: "w1:p1" });
  expect(commands().slice(0, 2)).toEqual([
    "workspace create --cwd /work/tree --label a1 --no-focus",
    "agent start a1 --kind claude --pane w1:p1 -- --model sonnet",
  ]);
});

test("env reaches the workspace", async () => {
  await call("start", { ...START, env: { OP_FLAG: "1" } });
  expect(commands()[0]).toBe("workspace create --cwd /work/tree --label a1 --no-focus --env OP_FLAG=1");
});

test("the other machine runs every step there", async () => {
  expect(await call("start", { ...START, machine: "other" })).toEqual({ ok: true, pane: "w1:p1" });
  const cmds = commands();
  expect(cmds.length).toBeGreaterThanOrEqual(3);
  expect(cmds.every((c) => c.startsWith("--machine other "))).toBe(true);
  expect(cmds[0]).toBe("--machine other workspace create --cwd /work/tree --label a1 --no-focus");
});

test("a failed workspace step is named, with herdr's last line, and has no pane to undo", async () => {
  writeFileSync(join(DIR, "fail-workspace"), "");
  expect(await call("start", START)).toEqual({ ok: false, step: "workspace", error: "noise" });
  expect(commands().some((c) => c.startsWith("agent start"))).toBe(false);
});

test("a failed agent step is named and carries the pane to close", async () => {
  writeFileSync(join(DIR, "fail-agent"), "");
  const r = await call("start", START);
  expect(r).toMatchObject({ ok: false, step: "agent", pane: "w1:p1" });
  // The new pane's shell may not take the command at once, so it was tried more than once.
  expect(commands().filter((c) => c.startsWith("agent start")).length).toBeGreaterThan(1);
});

test("the folder-trust dialog is answered with Down, Enter, then the start waits for ready", async () => {
  writeFileSync(join(DIR, "dialog"), "");
  expect(await call("start", START)).toEqual({ ok: true, pane: "w1:p1" });
  expect(commands().filter((c) => c.startsWith("pane send-keys"))).toEqual(["pane send-keys w1:p1 down", "pane send-keys w1:p1 enter"]);
});

test("a failure answering the dialog is the trust step", async () => {
  writeFileSync(join(DIR, "dialog"), "");
  writeFileSync(join(DIR, "fail-trust"), "");
  expect(await call("start", START)).toMatchObject({ ok: false, step: "trust", pane: "w1:p1" });
});

test("a dialog that is not the trust one is never answered; the wait ends as ready failed", async () => {
  writeFileSync(join(DIR, "other-dialog"), "");
  expect(await call("start", START)).toMatchObject({ ok: false, step: "ready", pane: "w1:p1" });
  expect(commands().some((c) => c.startsWith("pane send-keys"))).toBe(false);
});

test("an agent that never comes up reads failed at the deadline, saying what it was", async () => {
  writeFileSync(join(DIR, "never-ready"), "");
  const t = Date.now();
  const r = await call("start", START);
  expect(r).toMatchObject({ ok: false, step: "ready", pane: "w1:p1" });
  expect(r.error).toContain("unknown");
  expect(Date.now() - t).toBeLessThan(5000);
});

test("an account sets CLAUDE_CONFIG_DIR and a settings file, as a move does; the default account sets no home", async () => {
  await call("start", { ...START, account: "second" });
  const cmds = commands();
  expect(cmds[0]).toMatch(/--env CLAUDE_CONFIG_DIR=\S+\/\.claude-second$/);
  expect(cmds[1]).toMatch(/-- --model sonnet --settings \S+claude-lane-second\.settings\.json$/);
  rmSync(LOG);
  await call("start", { ...START, account: "default" });
  expect(commands()[0]).not.toContain("CLAUDE_CONFIG_DIR");
});

test("an account on the other machine is refused before anything runs", async () => {
  expect(await call("start", { ...START, machine: "other", account: "second" })).toMatchObject({ ok: false, step: "account" });
  expect(commands()).toEqual([]);
});

test("stopAgent and closePane run on the right machine, and throw herdr's message", async () => {
  await call("stop", { name: "a1" });
  await call("close", { pane: "w1:p1", machine: "other" });
  expect(commands()).toEqual(["agent stop a1", "--machine other pane close w1:p1"]);
  writeFileSync(join(DIR, "fail-stop"), "");
  expect(await call("stop", { name: "a1" })).toEqual({ threw: "noise" });
  expect(await call("close", { pane: "w1:p1" })).toEqual({ threw: "noise" });
});
