// A lane whose agent waits at a permission prompt or a question picker in herdr reads "blocked", with a short excerpt
// of what it asks; the excerpt clears when the lane moves on; HQ hears of each block once; the board puts it first.
// A stub herdr reads its agent list and panes from files the test rewrites between syncs, and logs what it is typed.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnServer } from "../../scripts/room-hash.ts";
import { promptIn } from "../../src/server/prompt.ts";

const CLAUDE_PERMISSION = `⏺ Bash(git push origin main)
╭──────────────────────────────────────────────────────────────╮
│ Bash command                                                  │
│                                                               │
│   git push origin main                                        │
│   Push the branch to origin                                   │
│                                                               │
│ Do you want to proceed?                                       │
│ ❯ 1. Yes                                                      │
│   2. Yes, and don't ask again for git push commands in /repo  │
│   3. No, and tell Claude what to do differently (esc)         │
╰───────────────────────────────────────────────────────────────╯
`;
const CODEX_QUESTION = `• I need one decision before I go on.

  Question 1/1 (1 unanswered)
  Which approach should I take for the migration?

  › 1. Add a column (Recommended)  Keeps old rows readable.
    2. New table                   Cleaner, but needs a backfill.
    3. None of the above           Optionally, add details in notes (tab).

  tab to add notes | enter to submit answer | esc to interrupt
`;
// An agent that finished and asked in prose, with a numbered list: waiting on HQ, not blocked.
const PROSE = `  Do you want me to create a GitHub repo and push it?
  1. Create it and push
  2. Leave it local

❯
  ⏵⏵ auto mode on (shift+tab to cycle)
`;
const IDLE = `❯
  ⏵⏵ bypass permissions on (shift+tab to cycle)
`;

const ROOT = join(import.meta.dir, "..", "..");
const data = mkdtempSync(join(tmpdir(), "hq-blocked-test-"));
const herdr = join(data, "herdr");
const log = join(data, "typed.log");
writeFileSync(herdr, `#!/bin/sh
D="${data}"
case "$*" in
  *"agent list"*) cat "$D/agents.json" ;;
  *"pane read "*) for a in "$@"; do [ -f "$D/pane-$a.txt" ] && cat "$D/pane-$a.txt"; done ;;
  *"agent prompt"*) printf '%s\\n---\\n' "$*" >> "$D/typed.log" ;;
esac
exit 0
`);
chmodSync(herdr, 0o755);
const agents = (list: Record<string, string>) =>
  writeFileSync(join(data, "agents.json"), JSON.stringify({ result: { agents: Object.entries(list).map(([name, agent_status], i) => ({ name, agent_status, pane_id: `p${i + 1}`, agent: "claude" })) } }));
const pane = (id: string, text: string) => writeFileSync(join(data, `pane-${id}.txt`), text);
const typed = () => (existsSync(log) ? readFileSync(log, "utf8").split("\n---\n").filter((s) => s.trim()) : []);

let server: Awaited<ReturnType<typeof spawnServer>>;
const post = (path: string, body: unknown) => fetch(`${server.base}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-hud": "1" }, body: JSON.stringify(body) }).then((r) => r.json());
const lanes = async () => Object.fromEntries((await (await fetch(`${server.base}/api/state`)).json()).lanes.map((l: any) => [l.name, l]));
const sync = async () => {
  await post("/api/sync", {});
  await Bun.sleep(150); // the message to HQ is typed in the background
};

beforeAll(async () => {
  agents({ "perm-lane": "blocked", "codex-lane": "idle", "prose-lane": "idle", "asked-lane": "blocked" });
  pane("p1", CLAUDE_PERMISSION);
  pane("p2", CODEX_QUESTION);
  pane("p3", PROSE);
  pane("p4", CODEX_QUESTION);
  server = await spawnServer({
    cwd: ROOT,
    env: { ...process.env, HUD_HOST: "127.0.0.1", HUD_DATA_DIR: data, HERDR_BIN: herdr, HUD_MACHINES: "local", HUD_LOCAL_MACHINE: "local", HUD_HQ_AGENT: "hq", HUD_GH_BIN: "false" },
  });
  for (const name of ["perm-lane", "codex-lane", "prose-lane", "asked-lane"]) await post("/api/lanes", { name, machine: "local" });
  await post("/api/asks", { lane: "asked-lane", title: "Which region?" });
  await post("/api/board/track", { issue: "ABC-1", lane: "perm-lane" });
  await post("/api/board/track", { issue: "ABC-2", lane: "prose-lane" });
}, 30_000);
afterAll(async () => {
  await server?.stop();
  rmSync(data, { recursive: true, force: true });
});

test("the excerpt: the question and its options, plain, at most four lines", () => {
  expect(promptIn(CLAUDE_PERMISSION)).toBe(
    "Push the branch to origin · Do you want to proceed?\n1. Yes\n2. Yes, and don't ask again for git push commands in /repo\n3. No, and tell Claude what to do differently (esc)",
  );
  expect(promptIn(`\x1b[1m${CODEX_QUESTION}\x1b[0m`)).toBe(
    "Which approach should I take for the migration?\n1. Add a column (Recommended) Keeps old rows readable.\n2. New table Cleaner, but needs a backfill.\n3. None of the above Optionally, add details in notes (tab).",
  );
  expect(promptIn(PROSE)).toBeNull();
  expect(promptIn(IDLE)).toBeNull();
});

test("herdr blocked with a Claude permission prompt, or a Codex question picker in the pane: the lane reads blocked", async () => {
  await sync();
  const l = await lanes();
  expect(l["perm-lane"].status).toBe("blocked");
  expect(l["perm-lane"].prompt).toBe(promptIn(CLAUDE_PERMISSION));
  expect(l["perm-lane"].pane).toBe("p1");
  expect(l["codex-lane"].status).toBe("blocked");
  expect(l["codex-lane"].prompt).toStartWith("Which approach should I take for the migration?\n1. Add a column");
  expect(l["prose-lane"].status).toBe("hq_turn");
  expect(l["prose-lane"].prompt).toBeNull();
  // An open ask still counts, but a blocked lane is blocked first.
  expect(l["asked-lane"]).toMatchObject({ status: "blocked", asks: 1 });
});

test("the board puts a blocked item first with the excerpt as its why; hud board lists BLOCKED ON A PROMPT first", async () => {
  const b = await (await fetch(`${server.base}/api/board`)).json();
  expect(b.items[0]).toMatchObject({ issue: "ABC-1", state: "blocked", why: promptIn(CLAUDE_PERMISSION)!.split("\n").join(" / "), where: { machine: "local", pane: "p1" } });
  expect(b.counts.blocked).toBe(1);
  // Blocked lanes no tracked item covers are listed too.
  expect(b.blockedLanes.map((x: any) => x.lane).sort()).toEqual(["asked-lane", "codex-lane"]);
  const text = await (await fetch(`${server.base}/api/board?format=text`)).text();
  expect(text.split("\n")[0]).toBe("BLOCKED ON A PROMPT (answer in the pane)");
  expect(text).toContain("lane codex-lane (local, p2)  Which approach should I take for the migration?");
  const board = text.slice(text.indexOf("WORK BOARD"));
  expect(board.split("\n")[0]).toStartWith("WORK BOARD: 1 blocked on a prompt");
  expect(board.indexOf("BLOCKED ON A PROMPT")).toBeLessThan(board.indexOf("ABC-2"));
  expect(board).toContain("ABC-1  lane perm-lane (local, p1)  PR -  Push the branch to origin · Do you want to proceed? / 1. Yes");
});

test("HQ is told once per block, with where to answer it and the reply hint", async () => {
  await sync();
  await sync();
  const perm = typed().filter((t) => t.includes("Lane perm-lane"));
  expect(perm.length).toBe(1);
  expect(perm[0]).toContain("agent prompt hq Lane perm-lane is blocked on a prompt in herdr (local, p1): Push the branch to origin · Do you want to proceed? / 1. Yes");
  expect(perm[0]).toContain("Reply through the HUD");
  expect(typed().filter((t) => t.includes("Lane codex-lane")).length).toBe(1);
  expect(typed().some((t) => t.includes("prose-lane"))).toBe(false);
});

test("the excerpt clears when the lane goes back to working, and a new block is told again", async () => {
  agents({ "perm-lane": "working", "codex-lane": "idle", "prose-lane": "idle", "asked-lane": "blocked" });
  pane("p2", IDLE);
  await sync();
  let l = await lanes();
  expect(l["perm-lane"]).toMatchObject({ status: "moving", prompt: null });
  expect(l["codex-lane"]).toMatchObject({ status: "hq_turn", prompt: null });
  const b = await (await fetch(`${server.base}/api/board`)).json();
  expect(b.items.find((i: any) => i.issue === "ABC-1").state).toBe("moving");
  agents({ "perm-lane": "blocked", "codex-lane": "idle", "prose-lane": "idle", "asked-lane": "blocked" });
  await sync();
  l = await lanes();
  expect(l["perm-lane"].status).toBe("blocked");
  expect(typed().filter((t) => t.includes("Lane perm-lane")).length).toBe(2);
});
