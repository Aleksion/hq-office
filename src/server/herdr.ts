// herdr: which lanes are live, idle or gone, polled every 20 s, and typing answers and notes into HQ.
import { HERDR, LOCAL, MACHINES } from "./config.ts";
import { db } from "./db.ts";
import type { Lane } from "./types.ts";
import { bump } from "./push.ts";
import { event } from "./events.ts";
import { withHint } from "../hq-guide.ts";

export let untracked: { name: string; machine: string; status: string }[] = [];
export let lastSync: { at: number; errors: string[] } = { at: 0, errors: [] };

async function herdrList(machine: string): Promise<any[]> {
  const args = machine === LOCAL ? [HERDR, "agent", "list"] : [HERDR, "--machine", machine, "agent", "list"];
  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => proc.kill(), 15_000);
  const out = await new Response(proc.stdout).text();
  clearTimeout(timer);
  await proc.exited;
  return JSON.parse(out).result.agents;
}

// An idle agent can still be working. Its pane's tail says so: "· 2 shells still running", "monitor still running",
// a status bar with "← 1 agent" or "1 shell, 1 monitor", or a running subagent listed as "◯ general-purpose  <task>  34m 0s".
const BG = /(←\s*\d+\s+agents?|\d+\s+shells?(?:,\s*\d+\s+monitors?)?(?:\s+still running)?|\d+\s+monitors?|monitors?\s+still running)/i;
const SUBAGENT = /^\s*◯\s+([\w.-]+)\s/m;
async function backgroundWork(machine: string, pane: string): Promise<string | null> {
  const args = machine === LOCAL ? [HERDR, "pane", "read", pane, "--lines", "10"] : [HERDR, "--machine", machine, "pane", "read", pane, "--lines", "10"];
  try {
    const proc = Bun.spawn(args, { stdout: "pipe", stderr: "ignore" });
    const timer = setTimeout(() => proc.kill(), 8_000);
    const out = await new Response(proc.stdout).text();
    clearTimeout(timer);
    await proc.exited;
    const sub = out.match(SUBAGENT)?.[1];
    return out.match(BG)?.[1].replace(/\s+/g, " ") ?? (sub ? `subagent ${sub} running` : null);
  } catch {
    return null;
  }
}

export async function syncHerdr() {
  const errors: string[] = [];
  const seen = new Map<string, { machine: string; agent: any }>();
  await Promise.all(
    MACHINES.map(async (machine) => {
      try {
        for (const agent of await herdrList(machine)) {
          if (agent.name) seen.set(agent.name, { machine, agent });
        }
      } catch (e) {
        errors.push(`${machine}: ${(e as Error).message}`);
      }
    }),
  );
  const now = Date.now();
  const lanes = db.query("SELECT * FROM lanes").all() as Lane[];
  const known = new Set(lanes.map((l) => l.name));
  // Only lanes that would otherwise read as HQ's turn or stale: any phase but done, parked or waiting (a phase HQ set
  // that the status does not know, such as "paused", also falls through to HQ's turn), agent not working, and no
  // open question waiting on the owner.
  const asking = new Set((db.query("SELECT DISTINCT lane FROM asks WHERE status = 'open' AND recipient = 'owner' AND lane IS NOT NULL").all() as { lane: string }[]).map((r) => r.lane));
  const bg = new Map<string, string | null>();
  await Promise.all(
    lanes.map(async (lane) => {
      const hit = seen.get(lane.name);
      if (!hit || hit.agent.agent_status === "working" || ["done", "parked", "waiting"].includes(lane.phase) || asking.has(lane.name)) return;
      bg.set(lane.name, await backgroundWork(hit.machine, hit.agent.pane_id));
    }),
  );
  let changed = false;
  // One transaction for the whole sync: one write to disk instead of one per lane, three times a minute.
  db.transaction(() => {
    for (const lane of lanes) {
      const hit = seen.get(lane.name);
      if (!hit) {
        // Only call a lane gone when its machine answered.
        const machineAnswered = !errors.some((e) => e.startsWith(`${lane.machine}:`));
        if (machineAnswered && lane.herdr !== "gone") {
          db.query("UPDATE lanes SET herdr = 'gone', herdr_since = ? WHERE name = ?").run(now, lane.name);
          changed = true;
        }
        continue;
      }
      const status = hit.agent.agent_status as string;
      if (status !== lane.herdr || hit.agent.pane_id !== lane.pane || hit.machine !== lane.machine) {
        db.query(
          "UPDATE lanes SET herdr = ?, herdr_since = CASE WHEN herdr = ? THEN herdr_since ELSE ? END, pane = ?, machine = ?, agent = ? WHERE name = ?",
        ).run(status, status, now, hit.agent.pane_id, hit.machine, hit.agent.agent, lane.name);
        changed = true;
      }
      const work = bg.get(lane.name) ?? null;
      if (work !== (lane.bg ?? null)) {
        db.query("UPDATE lanes SET bg = ? WHERE name = ?").run(work, lane.name);
        changed = true;
      }
      db.query("UPDATE lanes SET herdr_seen = ? WHERE name = ?").run(now, lane.name);
    }
    // Every named agent, with when its status began: the real stop time of a lane that is in no list.
    for (const [name, { machine, agent }] of seen) {
      db.query(
        `INSERT INTO agents (name, machine, pane, agent, status, since, seen) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET machine = excluded.machine, pane = excluded.pane, agent = excluded.agent,
           since = CASE WHEN agents.status = excluded.status THEN agents.since ELSE excluded.since END,
           status = excluded.status, seen = excluded.seen`,
      ).run(name, machine, agent.pane_id, agent.agent, agent.agent_status, now, now);
    }
    // An agent that left, on a machine that answered, is no longer a live agent.
    for (const machine of MACHINES) if (!errors.some((e) => e.startsWith(`${machine}:`))) db.query("DELETE FROM agents WHERE machine = ? AND seen < ?").run(machine, now);
  })();
  untracked = [...seen.entries()]
    .filter(([name]) => !known.has(name))
    .map(([name, { machine, agent }]) => ({ name, machine, status: agent.agent_status }));
  lastSync = { at: now, errors };
  if (changed) bump();
}

// Where a named agent lives, from the last sync (the agents table). Undefined when no sync has seen it.
export const agentWhere = (name: string) => db.query("SELECT machine, pane FROM agents WHERE name = ?").get(name) as { machine: string; pane: string } | null;

// Types one message into an agent's session through herdr, on the machine the agent lives on. Fire and forget: the
// caller has already saved what the message is about, so a herdr that cannot even start is logged, not thrown.
export function promptAgent(agent: string, text: string) {
  const who = agent === HQ_AGENT ? "HQ" : agent;
  const machine = agentWhere(agent)?.machine ?? LOCAL;
  const args = machine === LOCAL ? [HERDR, "agent", "prompt", agent, text] : [HERDR, "--machine", machine, "agent", "prompt", agent, text];
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn(args, { stdout: "ignore", stderr: "pipe" });
  } catch (e) {
    event("hud", `could not reach ${who}: ${(e as Error).message}`);
    return;
  }
  proc.exited.then(async (code) => {
    if (code !== 0) event("hud", `could not reach ${who}: ${(await new Response(proc.stderr).text()).trim() || `exit ${code}`}`);
  });
}

// The owner's answers reach HQ the moment they are sent: typed into HQ's session, with a one-line reminder to reply
// through the HUD (the owner does not read HQ's terminal; HUD_HQ_HINT=0 leaves it out).
export const HQ_AGENT = process.env.HUD_HQ_AGENT || "hq";
export const notifyHq = (text: string) => promptAgent(HQ_AGENT, withHint(text));
