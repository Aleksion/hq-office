// Accounts: account-stats.py reads a fake home (Claude homes found by name and keychain exit code, two Codex homes,
// credentials planted with fake values) and prints names and percentages only; a new home links no login and starts
// from an allow-list of .claude.json keys; and a throwaway server moves a Claude lane through a fake herdr and a
// fake `security` that answers with exit codes only.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnServer } from "../../scripts/room-hash.ts";

const ROOT = join(import.meta.dir, "..", "..");
const TMP = realpathOf(mkdtempSync(join(tmpdir(), "hq-office-accounts-")));
const HOME = join(TMP, "home");
const DATA = join(TMP, "data");
const SECRETS = ["FAKE-EMAIL-1@example.invalid", "FAKE-CLAUDE-KEY-1", "FAKE-CODEX-TOKEN-1", "FAKE-CODEX-TOKEN-2", "FAKE-PLAN-1", "FAKE-LOGIN-FILE-1", "FAKE-USER-ID-1", "FAKE-MCP-TOKEN-1"];
const hour = 3600_000;
const iso = (ms: number) => new Date(ms).toISOString();

function realpathOf(p: string) {
  return Bun.spawnSync(["realpath", p]).stdout.toString().trim();
}
function write(path: string, text: string) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
}
const service = (dir: string) => `Claude Code-credentials-${createHash("sha256").update(dir).digest("hex").slice(0, 8)}`;

// The default ~/.claude.json: identity next to the things a new home should start with.
const CLAUDE_JSON = {
  oauthAccount: { accountUuid: "FAKE-ACCOUNT-UUID-1", emailAddress: SECRETS[0] },
  userID: SECRETS[6],
  anonymousId: "FAKE-ANON-1",
  primaryApiKey: SECRETS[1],
  customApiKeyResponses: { approved: [SECRETS[1]] },
  hasAvailableSubscription: true,
  machineID: "FAKE-MACHINE-1",
  mcpServers: { files: { command: "files-mcp", env: { TOKEN: SECRETS[7] } } },
  hasCompletedOnboarding: true,
  lastOnboardingVersion: "2.1.0",
  theme: "dark",
  shiftEnterKeyBindingInstalled: true,
  hasCompletedClaudeInChromeOnboarding: true,
  installMethod: "native",
  numStartups: 99,
  projects: {
    "/work/app": { hasTrustDialogAccepted: true, allowedTools: ["Bash(ls)"], enabledMcpjsonServers: ["files"], lastSessionId: "FAKE-SESSION-1", lastCost: 4.2 },
  },
};
const SEEDED = ["hasCompletedClaudeInChromeOnboarding", "hasCompletedOnboarding", "lastOnboardingVersion", "mcpServers", "projects", "shiftEnterKeyBindingInstalled", "theme"];
const IDENTITY = ["oauthAccount", "userID", "anonymousId", "primaryApiKey", "customApiKeyResponses", "hasAvailableSubscription", "machineID"];

beforeAll(() => {
  // The default home: a login file, a backup of the config, and what a new home should share.
  write(join(HOME, ".claude/.credentials.json"), JSON.stringify({ claudeAiOauth: { accessToken: SECRETS[5] } }));
  write(join(HOME, ".claude/.claude.json.backup"), JSON.stringify(CLAUDE_JSON));
  write(join(HOME, ".claude/settings.json"), "{}");
  write(join(HOME, ".claude/projects/-work-app/sess-1.jsonl"), "{}\n");
  write(join(HOME, ".claude/skills/one/SKILL.md"), "# one\n");
  write(join(HOME, ".claude.json"), JSON.stringify(CLAUDE_JSON));
  // Two more homes: work (its login is a keychain item) and spare (never logged in). ~/.claude-code-router is not a home.
  write(join(HOME, ".claude-work/.claude.json"), "{}");
  write(join(HOME, ".claude-spare/.claude.json"), "{}");
  write(join(HOME, ".claude-code-router/config.json"), "{}");
  // work's week is 40% used, as its lane's status line recorded.
  write(join(HOME, ".local/state/hq-office/claude-usage/work.json"), JSON.stringify({ rate_limits: { five_hour: { used_percentage: 12, resets_at: Math.floor((Date.now() + 2 * hour) / 1000) }, seven_day: { used_percentage: 40, resets_at: Math.floor((Date.now() + 50 * hour) / 1000) } } }));
  // The fake `security` answers with an exit code only, and logs how it was called (to prove it never asks for a secret).
  write(join(TMP, "keychain"), `${service(join(HOME, ".claude-work"))}\n`);
  write(join(TMP, "bin/security"), `#!/bin/sh\necho "$@" >> "${TMP}/security-calls"\n[ "$1" = "find-generic-password" ] && [ "$2" = "-s" ] && grep -qxF "$3" "${TMP}/keychain"\n`);
  chmodSync(join(TMP, "bin/security"), 0o755);
  // Codex: two homes, the second linking to the first one's sessions. ~/.codex-cli is an npm install, not a home.
  write(join(HOME, ".codex/auth.json"), JSON.stringify({ tokens: { access_token: SECRETS[2] } }));
  const limits = { limit_id: "codex", plan_type: SECRETS[4], primary: { used_percent: 92, window_minutes: 10080, resets_at: Math.floor((Date.now() + 30 * hour) / 1000) }, secondary: null };
  write(join(HOME, ".codex/sessions/2026/10/25/rollout-2026-10-25T09-00-00-aaaa.jsonl"), [
    JSON.stringify({ timestamp: iso(Date.now() - 2 * hour), type: "session_meta", payload: { id: "aaaa" } }),
    JSON.stringify({ timestamp: iso(Date.now() - hour), type: "event_msg", payload: { type: "token_count", rate_limits: limits } }),
  ].join("\n") + "\n");
  write(join(HOME, ".codex-spare/auth.json"), JSON.stringify({ tokens: { access_token: SECRETS[3] } }));
  symlinkSync(join(HOME, ".codex/sessions"), join(HOME, ".codex-spare/sessions"));
  write(join(HOME, ".codex-cli/package.json"), "{}");
});
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

function readStats() {
  const proc = Bun.spawnSync(["python3", "-I", join(ROOT, "src/server/account-stats.py")], { env: { HOME, PATH: process.env.PATH, HQ_SECURITY_BIN: join(TMP, "bin/security") } });
  expect(proc.exitCode).toBe(0);
  return proc.stdout.toString();
}

test("the reader prints names and percentages, and no credential, email or account id", () => {
  const out = readStats();
  for (const s of SECRETS) expect(out).not.toContain(s);
  const { claude, codex } = JSON.parse(out);
  // default: its credentials file exists. work: its keychain item answers with exit 0. spare: neither.
  expect(claude.homes.map((h: any) => [h.name, h.logged_in])).toEqual([["default", true], ["spare", false], ["work", true]]);
  expect(claude.homes.find((h: any) => h.name === "work").windows.weekly.left).toBe(60);
  expect(claude.homes.find((h: any) => h.name === "work").windows.session.left).toBe(88);
  // The keychain is asked about an item's existence, never for its attributes or its secret.
  const calls = readFileSync(join(TMP, "security-calls"), "utf8").trim().split("\n");
  expect(calls.length).toBeGreaterThan(0);
  for (const c of calls) expect(c).toMatch(/^find-generic-password -s Claude Code-credentials(-[0-9a-f]{8})?$/);
  expect(codex.map((h: any) => h.name)).toEqual(["codex", "spare"]);
  expect(codex[0].reading.windows).toEqual([{ minutes: 10080, used: 92, resets_at: expect.any(Number) }]);
  // A session log does not say which account wrote it, so the linked home shows no reading of its own.
  expect(codex[1]).toEqual({ name: "spare", logged_in: true, reading: null, shares_sessions_with: ["codex"] });
});

test("the lane status line keeps the rate limits and nothing else from Claude's payload", () => {
  const run = (payload: object) => Bun.spawnSync(["python3", "-I", join(ROOT, "src/server/claude-statusline.py"), "spare"], { env: { HOME, PATH: process.env.PATH }, stdin: new TextEncoder().encode(JSON.stringify(payload)) });
  const proc = run({ session_id: "FAKE-SESSION-2", cwd: "/work/app", rate_limits: { five_hour: { used_percentage: 30, resets_at: 1 }, seven_day: { used_percentage: 70, resets_at: 2 } } });
  expect(proc.stdout.toString().trim()).toBe("account spare · week 30% left");
  const kept = readFileSync(join(HOME, ".local/state/hq-office/claude-usage/spare.json"), "utf8");
  expect(JSON.parse(kept)).toEqual({ rate_limits: { five_hour: { used_percentage: 30, resets_at: 1 }, seven_day: { used_percentage: 70, resets_at: 2 } } });
  expect(kept).not.toContain("FAKE-SESSION-2");
  expect(JSON.parse(readStats()).claude.homes.find((h: any) => h.name === "spare").windows.weekly.left).toBe(30);
});

// ---- homes: in this process, with HOME pointed at the fake one ----

test("a new home links everything but a login file, and its .claude.json starts from the allow-list", async () => {
  const realHome = process.env.HOME;
  process.env.HOME = HOME;
  try {
    const { homeDir, makeHome, showsDialog, relaunchCommand, SEED_KEYS } = await import("../../src/server/claude-home.ts");
    // Never make a home outside the fake one: check the path before anything is written.
    expect(homeDir("fresh")).toBe(join(HOME, ".claude-fresh"));
    expect(() => makeHome("Bad Name")).toThrow();
    expect(() => makeHome("default")).toThrow();
    const dir = makeHome("fresh");
    expect(dir).toBe(join(HOME, ".claude-fresh"));
    // Settings, skills and session transcripts are shared, so --resume finds the same session from either home.
    expect(readdirSync(dir).sort()).toEqual([".claude.json", "projects", "settings.json", "skills"]);
    for (const entry of ["projects", "settings.json", "skills"]) {
      expect(lstatSync(join(dir, entry)).isSymbolicLink()).toBe(true);
      expect(readlinkSync(join(dir, entry))).toBe(join(HOME, ".claude", entry));
    }
    expect(existsSync(join(dir, "projects/-work-app/sess-1.jsonl"))).toBe(true);
    // No login file crosses, not as a link and not as a copy: the credentials file, nor the config's backup.
    expect(existsSync(join(dir, ".credentials.json"))).toBe(false);
    expect(existsSync(join(dir, ".claude.json.backup"))).toBe(false);
    expect(lstatSync(join(dir, ".claude.json")).isSymbolicLink()).toBe(false);

    const seeded = JSON.parse(readFileSync(join(dir, ".claude.json"), "utf8"));
    expect(Object.keys(seeded).sort()).toEqual(SEEDED);
    expect(SEED_KEYS.slice().sort()).toEqual(SEEDED);
    for (const key of IDENTITY) expect(seeded).not.toHaveProperty(key);
    // Of a project only its trust and approvals cross, not its last session or cost.
    expect(seeded.projects["/work/app"]).toEqual({ hasTrustDialogAccepted: true, allowedTools: ["Bash(ls)"], enabledMcpjsonServers: ["files"] });
    expect(seeded.mcpServers.files.command).toBe("files-mcp");
    for (const s of [SECRETS[0], SECRETS[1], SECRETS[5], SECRETS[6], "FAKE-ACCOUNT-UUID-1", "FAKE-SESSION-1"]) expect(readFileSync(join(dir, ".claude.json"), "utf8")).not.toContain(s);
    expect(statSync(join(dir, ".claude.json")).mode & 0o777).toBe(0o600);
    expect(() => makeHome("fresh")).toThrow(/already exists/);

    // The relaunch: the lane's own home through the environment, the same session, and its own status line.
    expect(relaunchCommand("work", "sess-1", "/d/s.json")).toBe(`CLAUDE_CONFIG_DIR='${HOME}/.claude-work' claude --resume 'sess-1' --settings '/d/s.json'`);
    expect(relaunchCommand("default", "sess-1", "/d/s.json")).toBe("env -u CLAUDE_CONFIG_DIR claude --resume 'sess-1' --settings '/d/s.json'");
    expect(relaunchCommand("work", "it's", "/d/s.json")).toContain(`--resume 'it'\\''s'`);

    // A lane at a prompt is not showing a dialog; one at its limit, or at a credits offer, is.
    expect(showsDialog(PROMPT)).toBe(false);
    expect(showsDialog(WORKING)).toBe(false);
    expect(showsDialog(LIMIT)).toBe(true);
    expect(showsDialog(CREDITS)).toBe(true);
    expect(showsDialog(EXTRA)).toBe(true);
    // Only the bottom of the screen counts: an old mention far up the scrollback is not a dialog.
    expect(showsDialog(`You've hit your session limit\n${"\n.".repeat(60)}\n${PROMPT}`)).toBe(false);
  } finally {
    process.env.HOME = realHome;
  }
});

// Screens as the pane shows them (the wording is the one Claude Code 2.1.310 ships).
const PROMPT = "● Done. The tests pass.\n\n╭────────────────────────────╮\n│ ❯                          │\n╰────────────────────────────╯\n  ? for shortcuts";
const WORKING = "✻ Thinking… (12s · esc to interrupt)\n\n╭────────────────────────────╮\n│ ❯                          │\n╰────────────────────────────╯";
const LIMIT = "  You've hit your weekly limit · resets Mon 9:00\n\n  What do you want to do?\n\n  ❯ 1. Stop and wait for limit to reset\n    2. Upgrade your plan\n\n  Enter to confirm · Esc to cancel";
const CREDITS = "  You've hit your session limit.\n\n  ❯ 1. Add funds to continue with usage credits\n    2. Stop and wait for limit to reset";
const EXTRA = "  Request extra usage from your admin\n  ❯ 1. /extra-usage\n    2. Wait";

// ---- the server: a fake herdr and the fake security ----

let server: Awaited<ReturnType<typeof spawnServer>>;
const HERDR = join(TMP, "bin/herdr");
const agent = (over: object) => JSON.stringify({ result: { agents: [{ agent: "claude", agent_status: "idle", name: "lane-a", pane_id: "w1:p1", agent_session: { kind: "id", value: "sess-1" }, ...over }] } });
const calls = () => (existsSync(join(TMP, "herdr-calls")) ? readFileSync(join(TMP, "herdr-calls"), "utf8").trim().split("\n") : []);
function scene(agentJson: string, screen = PROMPT) {
  write(join(TMP, "agents.json"), agentJson);
  write(join(TMP, "screen.txt"), screen);
  rmSync(join(TMP, "herdr-calls"), { force: true });
  rmSync(join(TMP, "exited"), { force: true });
}
const api = (path: string, body: object) => fetch(`${server.base}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-hud": "1" }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
const move = (lane: string, account: string) => api("/api/accounts/move", { lane, account });
const state = async (): Promise<any> => (await fetch(`${server.base}/api/state`)).json();

test("the server moves an idle lane to a logged-in account, and refuses the rest", async () => {
  // The fake herdr: lists agents from agents.json, shows screen.txt, and reports the pane's agent gone once it is
  // told /exit. It logs every call.
  write(HERDR, `#!/bin/sh
echo "$@" >> "${TMP}/herdr-calls"
case "$1 $2" in
  "agent list") cat "${TMP}/agents.json" ;;
  "pane read") cat "${TMP}/screen.txt" ;;
  "pane get") if [ -e "${TMP}/exited" ]; then echo '{"result":{"pane":{"pane_id":"w1:p1"}}}'; else echo '{"result":{"pane":{"pane_id":"w1:p1","agent":"claude"}}}'; fi ;;
  "agent prompt") [ "$4" = "/exit" ] && touch "${TMP}/exited" ;;
esac
exit 0
`);
  chmodSync(HERDR, 0o755);
  scene(agent({}));
  server = await spawnServer({ cwd: ROOT, env: { ...process.env, HOME, HUD_HOST: "127.0.0.1", HUD_DATA_DIR: DATA, HERDR_BIN: HERDR, HQ_SECURITY_BIN: join(TMP, "bin/security"), HUD_LOCAL_MACHINE: "local", HUD_MACHINES: "local" } });
  try {
    await api("/api/lanes", { name: "lane-a", machine: "local" });
    await api("/api/lanes", { name: "lane-b", machine: "local" });
    // The lane's herdr sync fills in its agent; the accounts are read once at start.
    for (let i = 0; i < 100; i++) {
      const s = await state();
      if (s.lanes.find((l: any) => l.name === "lane-a")?.agent === "claude" && s.accounts[0]?.ok) break;
      await Bun.sleep(100);
    }
    const view = (await state()).accounts[0].claude;
    expect(view.accounts.map((a: any) => [a.name, a.loggedIn, a.lanes])).toEqual([["default", true, ["lane-a"]], ["fresh", false, []], ["spare", false, []], ["work", true, []]]);
    expect(view.accounts.find((a: any) => a.name === "work").weekly.left).toBe(60);
    expect(view.lanes).toEqual([{ name: "lane-a", status: expect.any(String), account: "default" }]);
    const page = JSON.stringify(await state());
    for (const s of SECRETS) expect(page).not.toContain(s);

    // Refused: the target is not logged in, or does not exist; nothing is sent to the lane.
    expect((await move("lane-a", "spare")).error).toMatch(/spare is not logged in.*claude auth login/);
    expect((await move("lane-a", "nobody")).error).toMatch(/no Claude home named nobody/);
    expect((await move("nolane", "work")).error).toMatch(/no lane named/);
    expect((await move("lane-a", "default")).error).toMatch(/already runs on default/);
    expect(calls().filter((c) => c.startsWith("agent prompt") || c.startsWith("pane run"))).toEqual([]);

    // Refused: the lane is working, or its session id is unknown.
    scene(agent({ agent_status: "working" }));
    expect((await move("lane-a", "work")).error).toMatch(/lane-a is working/);
    scene(agent({ agent_session: undefined }));
    expect((await move("lane-a", "work")).error).toMatch(/session id is unknown/);
    scene(agent({ agent_session: { kind: "id", value: "" } }));
    expect((await move("lane-a", "work")).error).toMatch(/session id is unknown/);
    expect(calls().filter((c) => c.startsWith("agent prompt") || c.startsWith("pane run"))).toEqual([]);

    // Refused: a dialog is showing. Nothing is typed, and a question is filed once, however often it is tapped.
    for (const [status, screen] of [["idle", LIMIT], ["done", CREDITS], ["blocked", PROMPT]] as const) {
      scene(agent({ agent_status: status }), screen);
      expect((await move("lane-a", "work")).error).toMatch(/shows a dialog.*question is filed/);
      expect(calls().filter((c) => c.startsWith("agent prompt") || c.startsWith("pane run"))).toEqual([]);
    }
    const open = (await state()).open.filter((a: any) => a.lane === "lane-a");
    expect(open.map((a: any) => a.title)).toEqual(["lane-a shows a limit or credits dialog"]);
    expect(open[0].body).toContain("never types into");

    // Moved: /exit, then the lane's own home, the same session and its status line, through herdr.
    scene(agent({}));
    const ok = await move("lane-a", "work");
    expect(ok).toMatchObject({ status: 200, said: "lane-a moved to work" });
    const sent = calls().filter((c) => c.startsWith("agent prompt") || c.startsWith("pane run"));
    expect(sent).toEqual([
      "agent prompt lane-a /exit",
      `pane run w1:p1 CLAUDE_CONFIG_DIR='${HOME}/.claude-work' claude --resume 'sess-1' --settings '${DATA}/claude-lane-work.settings.json'`,
    ]);
    expect(JSON.parse(readFileSync(join(DATA, "claude-lane-work.settings.json"), "utf8")).statusLine.command).toContain("claude-statusline.py' 'work'");
    const after = (await state()).accounts[0].claude;
    expect(after.accounts.map((a: any) => [a.name, a.lanes])).toEqual([["default", []], ["fresh", []], ["spare", []], ["work", ["lane-a"]]]);
    // Moving back is the same act.
    scene(agent({}));
    expect((await move("lane-a", "default")).said).toBe("lane-a moved to default");
    expect(calls().pop()).toBe("pane run w1:p1 env -u CLAUDE_CONFIG_DIR claude --resume 'sess-1' --settings '" + DATA + "/claude-lane-default.settings.json'");
    // The default keychain item and the planted login files were never written: the fake keychain is as it was.
    expect(readFileSync(join(TMP, "keychain"), "utf8")).toBe(`${service(join(HOME, ".claude-work"))}\n`);
    for (const c of readFileSync(join(TMP, "security-calls"), "utf8").trim().split("\n")) expect(c.startsWith("find-generic-password -s ")).toBe(true);

    // A home is made through the panel's route: no login in it, and it shows up not logged in.
    const made = await api("/api/accounts/home", { name: "third" });
    expect(made.said).toContain("CLAUDE_CONFIG_DIR=~/.claude-third claude auth login");
    expect(existsSync(join(HOME, ".claude-third/.credentials.json"))).toBe(false);
    expect((await api("/api/accounts/home", { name: "../x" })).error).toBeTruthy();
    expect((await state()).accounts[0].claude.accounts.find((a: any) => a.name === "third").loggedIn).toBe(false);
  } finally {
    await server.stop();
  }
});

test("a lane that never exits is not relaunched or recorded", async () => {
  write(HERDR, `#!/bin/sh\necho "$@" >> "${TMP}/herdr-calls"\ncase "$1 $2" in\n  "agent list") cat "${TMP}/agents.json" ;;\n  "pane read") cat "${TMP}/screen.txt" ;;\n  "pane get") echo '{"result":{"pane":{"agent":"claude"}}}' ;;\nesac\nexit 0\n`);
  scene(agent({}));
  server = await spawnServer({ cwd: ROOT, env: { ...process.env, HOME, HUD_HOST: "127.0.0.1", HUD_DATA_DIR: DATA, HERDR_BIN: HERDR, HQ_SECURITY_BIN: join(TMP, "bin/security"), HUD_LOCAL_MACHINE: "local", HUD_MACHINES: "local", HUD_MOVE_EXIT_WAIT_MS: "1200" } });
  try {
    // lane-a is on default from the last test's move back.
    expect((await move("lane-a", "work")).error).toMatch(/did not exit, so nothing was relaunched/);
    expect(calls().filter((c) => c.startsWith("agent prompt") || c.startsWith("pane run"))).toEqual(["agent prompt lane-a /exit"]);
    for (let i = 0; i < 50 && !(await state()).accounts[0]?.ok; i++) await Bun.sleep(100);
    expect((await state()).accounts[0].claude.lanes.map((l: any) => [l.name, l.account])).toEqual([["lane-a", "default"]]);
  } finally {
    await server.stop();
  }
}, 60_000);
