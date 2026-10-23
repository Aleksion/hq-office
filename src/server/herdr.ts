// herdr: which lanes are live, idle or gone, polled every 20 s, and typing answers and notes into HQ.
import { HERDR, LOCAL, MACHINES } from "./config.ts";
import { db } from "./db.ts";
import type { Lane } from "./types.ts";
import { bump } from "./push.ts";
import { event } from "./events.ts";

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
      db.query("UPDATE lanes SET herdr_seen = ? WHERE name = ?").run(now, lane.name);
    }
  })();
  untracked = [...seen.entries()]
    .filter(([name]) => !known.has(name))
    .map(([name, { machine, agent }]) => ({ name, machine, status: agent.agent_status }));
  lastSync = { at: now, errors };
  if (changed) bump();
}

// The owner's answers reach HQ the moment they are sent: typed into HQ's session.
const HQ_AGENT = process.env.HUD_HQ_AGENT ?? "hq";
export function notifyHq(text: string) {
  // The answer is already saved; a herdr that cannot even start must not turn it into an error for the page.
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn([HERDR, "agent", "prompt", HQ_AGENT, text], { stdout: "ignore", stderr: "pipe" });
  } catch (e) {
    event("hud", `could not reach HQ: ${(e as Error).message}`);
    return;
  }
  proc.exited.then(async (code) => {
    if (code !== 0) event("hud", `could not reach HQ: ${(await new Response(proc.stderr).text()).trim() || `exit ${code}`}`);
  });
}
