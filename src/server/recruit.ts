// Recruit: starts an agent as the Orchestrator of a floor of its own, and undoes it if a step fails. recruit() checks, then
// answers at once; the start (folder, agent, brief, lane, floor) runs on in the background, because it can take 3 minutes.
// Every step lands in the recruit's `steps`, which the page draws as the new floor's log. A recruit here is always the head
// of a new floor reporting to HQ: recruiting onto an existing floor is a later addition (see the `judgment` check below).
import { closePane, promptAgent, startAgent, stopAgent } from "./herdr.ts"; // first: state.ts and herdr.ts import each other
import { LOCAL, MACHINES } from "./config.ts";
import { db } from "./db.ts";
import { bump } from "./push.ts";
import { event } from "./events.ts";
import { addStatePart } from "./state.ts";
import { removeLane, upsertLane } from "./lanes.ts";
import { addFloor, stopFloor } from "./floors.ts";
import { capacity } from "./capacity.ts";
import { accountsView } from "./accounts.ts";
import { SSH_REUSE, sshTarget } from "./machines.ts";
import { DEFAULT, quote } from "./claude-home.ts";

type State = "held" | "starting" | "up" | "failed" | "stopped" | "withdrawn";
type Step = { step: string; ok: boolean; at: number; note?: string };
type Row = { id: number; name: string; floor: string; asked_by: string; model: string; machine: string; account: string | null; cwd: string | null; brief: string; state: State; steps: string; pane: string | null; error: string | null; created_at: number; up_at: number | null; stopped_at: number | null; parent: string | null; head: number };

const LIVE = "('held', 'starting', 'up')";
const NAME = /^[a-z0-9][a-z0-9-]{0,31}$/;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const row = (id: number) => db.query("SELECT * FROM recruits WHERE id = ?").get(id) as Row | null;
const holdMs = () => Number(process.env.HUD_RECRUIT_HOLD_MS ?? 20_000);

function note(id: number, step: string, ok: boolean, text?: string) {
  const steps: Step[] = JSON.parse(row(id)!.steps);
  steps.push({ step, ok, at: Date.now(), ...(text ? { note: text } : {}) });
  db.query("UPDATE recruits SET steps = ? WHERE id = ?").run(JSON.stringify(steps), id);
  bump();
}

function settle(id: number, state: State, error?: string) {
  const now = Date.now();
  db.query("UPDATE recruits SET state = ?, error = ?, up_at = CASE WHEN ? = 'up' THEN ? ELSE up_at END, stopped_at = CASE WHEN ? IN ('stopped', 'withdrawn') THEN ? ELSE stopped_at END WHERE id = ?")
    .run(state, error ?? null, state, now, state, now, id);
  bump();
}

// ---- the checks ----

function checkName(name: string) {
  if (!NAME.test(name)) throw new Error(`the name must be lowercase letters, digits and dashes, at most 32 characters, got "${name}"`);
  if (["owner", "hq"].includes(name)) throw new Error(`"${name}" stands for the owner or HQ in questions and rooms, so pick another name`);
}

// Only HQ runs on Fable. Opus is for a judgment role: the head of a floor is its Orchestrator, which is one. A recruit
// onto an existing floor (a builder) is not, and will pass `false`.
function checkModel(raw: string | undefined, judgment: boolean): string {
  const model = (raw ?? "sonnet").trim().toLowerCase();
  if (model.includes("fable")) throw new Error("Fable runs only HQ itself; a recruit runs on Sonnet, or Opus for a judgment role");
  if (model === "sonnet") return model;
  if (model === "opus") {
    if (!judgment) throw new Error("Opus is for a judgment role; this recruit runs on Sonnet");
    return model;
  }
  throw new Error(`unknown model "${raw}": a recruit runs on sonnet, or opus for a judgment role`);
}

// What accounts.ts last read. A machine not read yet, or an account with no usage recorded, says nothing against it.
function checkAccount(machine: string, account: string | undefined) {
  const reading = accountsView().find((m) => m.machine === machine);
  if (!reading?.ok || !reading.claude) return;
  const home = reading.claude.accounts.find((a) => a.name === (account ?? DEFAULT));
  if (!home) {
    if (account) throw new Error(`no Claude account named ${account} on ${machine}`);
    return;
  }
  const left = `${home.session?.left ?? "?"}% of its 5-hour window and ${home.weekly?.left ?? "?"}% of its week`;
  if (home.out) throw new Error(`the ${home.name} account on ${machine} is OUT (${left} left): pick another account, or wait for its reset`);
  if (home.low) throw new Error(`the ${home.name} account on ${machine} is low (${left} left): pick another account, or wait`);
}

// The clash check and the insert are one transaction, so two recruits of one name cannot both pass. The row is `starting`
// from here on: it holds the name while the capacity guard is asked.
const reserve = db.transaction((r: { name: string; floor: string; asked_by: string; model: string; machine: string; account: string | null; brief: string }): number => {
  if (db.query("SELECT 1 FROM lanes WHERE name = ?").get(r.name)) throw new Error(`a lane is already named ${r.name}`);
  if (db.query(`SELECT 1 FROM recruits WHERE name = ? AND state IN ${LIVE}`).get(r.name)) throw new Error(`${r.name} is already being recruited or is up`);
  if (db.query("SELECT 1 FROM floors WHERE stopped_at IS NULL AND (id = ? OR head = ?)").get(r.name, r.name)) throw new Error(`a floor already has the id or head ${r.name}`);
  return Number(db.query("INSERT INTO recruits (name, floor, asked_by, model, machine, account, brief, state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'starting', ?)")
    .run(r.name, r.floor, r.asked_by, r.model, r.machine, r.account, r.brief, Date.now()).lastInsertRowid);
});

export async function recruit(o: { name: string; floor: string; machine: string; account?: string; model?: string; brief: string; asked_by: string }): Promise<{ id: number; state: State }> {
  const name = String(o.name ?? "").trim();
  const floor = String(o.floor ?? "").trim();
  const machine = String(o.machine ?? "").trim();
  const brief = String(o.brief ?? "").trim();
  const account = o.account?.trim() || undefined;
  checkName(name);
  if (!floor) throw new Error("the floor needs a name");
  if (!brief) throw new Error("a brief is required: it is the first thing the Orchestrator reads");
  if (!(machine === LOCAL || MACHINES.includes(machine))) throw new Error(`no machine named ${machine || "(none)"}; the machines are ${MACHINES.join(", ")}`);
  const model = checkModel(o.model, true);
  checkAccount(machine, account);
  const id = reserve({ name, floor, asked_by: o.asked_by, model, machine, account: account ?? null, brief });

  const room = await capacity(machine);
  if (room.state === "stop") {
    db.query("DELETE FROM recruits WHERE id = ?").run(id);
    throw new Error(`${machine} cannot take another agent: ${room.reason}`);
  }
  note(id, "check", true, `${model} on ${machine}${account ? `, account ${account}` : ""}; ${room.reason}`);
  if (room.state === "hold") {
    settle(id, "held");
    note(id, "capacity", false, `held until ${machine} has room: ${room.reason}`);
    waitForRoom(id);
    return { id, state: "held" };
  }
  start(id);
  return { id, state: "starting" };
}

// A held recruit asks the guard again every 20 s and goes on when it says go. The owner can withdraw it meanwhile.
function waitForRoom(id: number) {
  setTimeout(async () => {
    const held = row(id);
    if (held?.state !== "held") return;
    const room = await capacity(held.machine);
    if (row(id)?.state !== "held") return; // withdrawn while the guard was asked
    if (room.state !== "go") return waitForRoom(id);
    settle(id, "starting");
    note(id, "capacity", true, room.reason);
    start(id);
  }, holdMs());
}

function start(id: number) {
  const undo: Undo[] = [];
  runSteps(id, undo).catch((e) => fail(id, undo, "start", message(e))); // anything unforeseen undoes what was made so far
}

// ---- the steps ----

type Undo = [label: string, run: () => unknown];

async function fail(id: number, undo: Undo[], step: string, error: string) {
  note(id, step, false, error);
  for (const [label, run] of [...undo].reverse()) {
    try {
      await run();
      note(id, `undo ${label}`, true);
    } catch (e) {
      note(id, `undo ${label}`, false, message(e)); // the rest of the undo goes on
    }
  }
  const r = row(id)!;
  settle(id, "failed", `${step}: ${error}`);
  event(r.asked_by, `recruit of ${r.name} failed at ${step}: ${error}`, r.name);
}

// The start folder on the machine, with the brief in it. One shell script, run here or over the machine's ssh connection.
// A retry finds the folder and the brief where they were left. Prints the folder's absolute path.
const START_ROOT = () => process.env.HUD_START_ROOT ?? "~/hq-office/floors";
const inShell = (p: string) => (p === "~" ? '"$HOME"' : p.startsWith("~/") ? `"$HOME"${quote(p.slice(1))}` : quote(p));

async function makeFolder(machine: string, name: string, brief: string): Promise<string> {
  const script = `d=${inShell(START_ROOT().replace(/\/+$/, ""))}/${name} && mkdir -p "$d" && cat > "$d/brief.md" && printf '%s' "$d"`;
  const args = machine === LOCAL ? ["sh", "-c", script] : ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=5", ...SSH_REUSE, await sshTarget(machine), `sh -c ${quote(script)}`];
  const proc = Bun.spawn(args, { stdin: new Blob([brief + "\n"]), stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => proc.kill(), 30_000);
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  clearTimeout(timer);
  if (code !== 0 || !out.trim()) throw new Error(err.trim().split("\n").pop() || `the folder could not be made (exit ${code})`);
  return out.trim();
}

// The steps herdr's start went through before the one that failed (it reports only the last).
const START_STEPS = ["workspace", "agent", "ready"];
const before = (step: string) => START_STEPS.slice(0, step === "trust" ? 2 : Math.max(0, START_STEPS.indexOf(step)));

async function runSteps(id: number, undo: Undo[]) {
  const r = row(id)!;
  const give = (step: string, error: string) => fail(id, undo, step, error);

  let dir: string;
  try {
    dir = await makeFolder(r.machine, r.name, r.brief);
  } catch (e) {
    return give("folder", message(e));
  }
  db.query("UPDATE recruits SET cwd = ? WHERE id = ?").run(dir, id);
  note(id, "folder", true, dir);

  const started = await startAgent({ name: r.name, machine: r.machine, cwd: dir, model: r.model, account: r.account ?? undefined }).catch((e) => ({ ok: false as const, step: "workspace" as const, error: message(e), pane: undefined }));
  if (started.pane) {
    db.query("UPDATE recruits SET pane = ? WHERE id = ?").run(started.pane, id);
    undo.push(["pane", () => closePane(started.pane!, r.machine)]);
  }
  if (!started.ok) {
    // The agent is running once its start got as far as waiting for ready.
    if (started.step === "ready" || started.step === "trust") undo.push(["agent", () => stopAgent(r.name, r.machine)]);
    for (const s of before(started.step)) note(id, s, true);
    return give(started.step, started.error);
  }
  for (const s of START_STEPS) note(id, s, true, s === "ready" ? started.pane : undefined);
  undo.push(["agent", () => stopAgent(r.name, r.machine)]);

  const told = await promptAgent(r.name, `You are the Orchestrator of floor "${r.floor}". Your folder is this directory: read brief.md in it, then run \`hud guide\`.`, r.machine, { confirm: true });
  if (!told.ok) return give("brief", told.error);
  note(id, "brief", true);

  try {
    upsertLane({ name: r.name, machine: r.machine, pane: started.pane, parent: "" });
    undo.push(["lane", () => dropLane(r.name)]);
    if (r.account) db.query("INSERT INTO lane_accounts (lane, account, moved_at) VALUES (?, ?, ?) ON CONFLICT(lane) DO UPDATE SET account = excluded.account, moved_at = excluded.moved_at").run(r.name, r.account, Date.now());
    note(id, "lane", true);
  } catch (e) {
    return give("lane", message(e));
  }

  try {
    addFloor({ id: r.name, name: r.floor, head: r.name, origin: "recruited", machine: r.machine, dir });
    undo.push(["floor", () => stopFloor(r.name)]);
    note(id, "floor", true, r.floor);
  } catch (e) {
    return give("floor", message(e));
  }

  event(r.asked_by, `recruited ${r.name} as the Orchestrator of floor "${r.floor}" on ${r.machine} (${r.model})`, r.name);
  settle(id, "up");
}

function dropLane(name: string) {
  removeLane(name);
  db.query("DELETE FROM lane_accounts WHERE lane = ?").run(name);
}

// ---- stopping ----

const stopping = new Set<string>();

// An up recruit: its agent and pane stop, its floor row stops and its lane goes. A step that fails is logged and the rest
// goes on, so a recruit whose agent is already gone can still be stopped; what failed is said in `error`.
// A held recruit is withdrawn. One that is still starting is not stopped midway.
export async function stopRecruit(name: string, by: string) {
  const r = db.query(`SELECT * FROM recruits WHERE name = ? AND state IN ${LIVE} ORDER BY id DESC`).get(name) as Row | null;
  if (!r) throw new Error(`no live recruit named ${name}`);
  if (r.state === "starting") throw new Error(`${name} is still starting; stop it once it is up or has failed`);
  if (r.state === "held") {
    settle(r.id, "withdrawn");
    event(by, `withdrew the held recruit of ${name}`, name);
    return;
  }
  if (stopping.has(name)) throw new Error(`${name} is already being stopped`);
  stopping.add(name);
  try {
    const problems: string[] = [];
    const attempt = async (label: string, run: () => unknown) => {
      try {
        await run();
        note(r.id, label, true);
      } catch (e) {
        problems.push(`${label}: ${message(e)}`);
        note(r.id, label, false, message(e));
      }
    };
    await attempt("stop agent", () => stopAgent(name, r.machine));
    if (r.pane) await attempt("close pane", () => closePane(r.pane!, r.machine));
    await attempt("stop floor", () => stopFloor(name));
    await attempt("remove lane", () => dropLane(name));
    settle(r.id, "stopped", problems.join("; ") || undefined);
    event(by, `stopped ${name}, the Orchestrator of floor "${r.floor}"${problems.length ? ` (${problems.join("; ")})` : ""}`, name);
  } finally {
    stopping.delete(name);
  }
}

// ---- the page, and a restart ----

// Recruits of the last 24 hours and every live one, newest first.
addStatePart("recruits", () =>
  (db.query(`SELECT * FROM recruits WHERE state IN ${LIVE} OR created_at > ? ORDER BY created_at DESC, id DESC`).all(Date.now() - 86_400_000) as Row[])
    .map((r) => ({ ...r, head: !!r.head, steps: JSON.parse(r.steps) as Step[] })));

// A start the server did not see through reads failed (its agent may be up: the log says to read its pane); a held recruit goes on waiting.
for (const r of db.query("SELECT id FROM recruits WHERE state = 'starting'").all() as { id: number }[]) {
  note(r.id, "restart", false, "HQ Office restarted during the start; read the agent's pane, then recruit again");
  settle(r.id, "failed", "restart: HQ Office restarted during the start");
}
for (const r of db.query("SELECT id FROM recruits WHERE state = 'held'").all() as { id: number }[]) waitForRoom(r.id);
