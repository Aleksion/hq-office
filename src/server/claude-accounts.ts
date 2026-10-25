// Moving a Claude lane to another account (see claude-home.ts for what an account is). A working lane is refused, so
// no turn is cut off; an idle one exits Claude and starts it again on the other home with --resume, so the
// conversation carries on. A lane showing a limit or credits dialog is never typed into: a question is filed.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA, DIR, HERDR, LOCAL } from "./config.ts";
import { db } from "./db.ts";
import { createAsk } from "./asks.ts";
import { readMachine } from "./accounts.ts";
import { bump } from "./push.ts";
import { DEFAULT, NAME, homeDir, quote, relaunchCommand, showsDialog } from "./claude-home.ts";

// The settings file that gives this process (and no other) a status line recording its account's rate limits.
export function laneSettings(account: string): string {
  const file = join(DATA, `claude-lane-${account}.settings.json`);
  const command = `python3 -I ${quote(join(DIR, "src/server/claude-statusline.py"))} ${quote(account)}`;
  writeFileSync(file, JSON.stringify({ statusLine: { type: "command", command } }));
  return file;
}

async function herdr(...args: string[]): Promise<string> {
  const proc = Bun.spawn([HERDR, ...args], { stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => proc.kill(), 15_000);
  const out = await new Response(proc.stdout).text();
  const code = await proc.exited;
  clearTimeout(timer);
  if (code !== 0) throw new Error((await new Response(proc.stderr).text()).trim().split("\n").pop() || `herdr ${args[0]} ${args[1]} failed`);
  return out;
}

export const laneAccount = (lane: string) => (db.query("SELECT account FROM lane_accounts WHERE lane = ?").get(lane) as { account: string } | null)?.account ?? DEFAULT;

function fileDialogQuestion(lane: string, account: string) {
  const title = `${lane} shows a limit or credits dialog`;
  const open = db.query("SELECT 1 FROM asks WHERE lane = ? AND title = ? AND status = 'open'").get(lane, title);
  if (!open) {
    createAsk({
      lane,
      title,
      body: `The move to ${account} was not made. HQ Office never types into a limit, extra-usage or credits dialog: it is the owner's to answer in the lane's pane. Then move the lane again.`,
      options: ["Answered in the pane", "Leave the lane where it is"],
    });
  }
}

const exited = async (pane: string) => JSON.parse(await herdr("pane", "get", pane)).result?.pane?.agent == null;

export async function moveLane(lane: string, account: string): Promise<string> {
  const row = db.query("SELECT * FROM lanes WHERE name = ?").get(lane) as { machine: string | null; agent: string | null } | null;
  if (!row) throw new Error(`no lane named ${lane}`);
  if (row.machine !== LOCAL) throw new Error("only this machine's lanes can be moved so far");
  if (row.agent !== "claude") throw new Error(`${lane} is not a Claude lane`);
  if (!NAME.test(account)) throw new Error("no such account");

  const stats = await readMachine(LOCAL);
  const target = stats.claude.homes.find((h) => h.name === account);
  if (!target) throw new Error(`no Claude home named ${account}`);
  if (!target.logged_in) throw new Error(`${account} is not logged in. The owner logs in once: CLAUDE_CONFIG_DIR=${homeDir(account)} claude auth login`);
  if (laneAccount(lane) === account) throw new Error(`${lane} already runs on ${account}`);

  const agent = JSON.parse(await herdr("agent", "list")).result.agents.find((a: any) => a.name === lane);
  if (!agent) throw new Error(`herdr has no pane for ${lane}`);
  const session = agent.agent_session?.value;
  if (typeof session !== "string" || !session) throw new Error(`${lane}'s session id is unknown, so it could not be resumed`);
  // A working turn is never cut off. Idle and done are at a prompt; blocked is a dialog of some kind.
  if (agent.agent_status === "working") throw new Error(`${lane} is working. Move it when it is idle`);
  if (!["idle", "done"].includes(agent.agent_status) && agent.agent_status !== "blocked") throw new Error(`${lane} is ${agent.agent_status}, not idle`);

  const screen = await herdr("pane", "read", agent.pane_id, "--source", "visible");
  if (agent.agent_status === "blocked" || showsDialog(screen)) {
    fileDialogQuestion(lane, account);
    throw new Error(`${lane} shows a dialog that is the owner's to answer. A question is filed`);
  }

  await herdr("agent", "prompt", lane, "/exit");
  const deadline = Date.now() + Number(process.env.HUD_MOVE_EXIT_WAIT_MS ?? 30_000);
  while (!(await exited(agent.pane_id))) {
    if (Date.now() > deadline) throw new Error(`${lane} did not exit, so nothing was relaunched`);
    await Bun.sleep(500);
  }
  await herdr("pane", "run", agent.pane_id, relaunchCommand(account, session, laneSettings(account)));
  db.query("INSERT INTO lane_accounts (lane, account, moved_at) VALUES (?, ?, ?) ON CONFLICT(lane) DO UPDATE SET account = excluded.account, moved_at = excluded.moved_at").run(lane, account, Date.now());
  bump();
  return `${lane} moved to ${account}`;
}
