// HQ's link: whether HQ can take what the server types into it, and the outbox that holds what it could not take.
// Every sync checks that an agent named HQ_AGENT is in herdr on this machine and ready for input, so the page says
// "HQ isn't receiving" before the owner writes into the void. Everything for HQ goes through the outbox: typed in at
// once when it can be, held when it cannot, and sent in order on the first sync that finds HQ again.
import { HERDR } from "./config.ts";
import { db } from "./db.ts";
import { bump } from "./push.ts";
import { event } from "./events.ts";
import { addStatePart } from "./state.ts";
import { withHint } from "../hq-guide.ts";
import { HQ_AGENT, promptAgent } from "./herdr.ts";

type Held = { id: number; at: number; text: string; ref: string | null; error: string | null; tries: number };
// seen: what the last sync found (null: fine, or not checked yet). sent: why the last delivery failed (null once one
// succeeds). The page shows the first of the two.
let seen: string | null = null;
let sent: string | null = null;
let since = 0;
let candidate: { pane: string; agent: string } | null = null;
let checked = false;

// herdr's errors are JSON on stderr: {"error":{"code":"agent_not_found","message":"..."}}. Said for the owner.
function reasonOf(error: string): string {
  let code = "", message = error;
  try {
    const e = JSON.parse(error).error;
    code = e?.code ?? "";
    message = e?.message ?? error;
  } catch {}
  if (code === "agent_not_found") return `no agent in herdr is named "${HQ_AGENT}"`;
  if (code === "agent_blocked") return "HQ is stopped at a prompt (a permission or a question) in its pane";
  return `herdr could not type into HQ: ${message}`.slice(0, 300);
}

function setReason(next: { seen?: string | null; sent?: string | null }) {
  const was = seen ?? sent;
  if ("seen" in next) seen = next.seen ?? null;
  if ("sent" in next) sent = next.sent ?? null;
  const now = seen ?? sent;
  if (now === was) return;
  if (now && !was) since = Date.now();
  event("hud", now ? `HQ isn't receiving: ${now}` : "HQ is receiving again");
  bump();
}

// After each sync: `agents` is this machine's `herdr agent list`, or null with `error` when herdr did not answer.
export function checkHq(agents: any[] | null, error?: string) {
  checked = true;
  if (!agents) {
    candidate = null;
    setReason({ seen: `herdr did not answer on this machine${error ? `: ${error}` : ""}`.slice(0, 300) });
    return;
  }
  const hq = agents.find((a) => a.name === HQ_AGENT);
  if (hq) {
    candidate = null;
    db.query("INSERT INTO hq_link (id, pane, seen_at) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET pane = excluded.pane, seen_at = excluded.seen_at").run(hq.pane_id, Date.now());
    if (hq.agent_status === "blocked") setReason({ seen: "HQ is stopped at a prompt (a permission or a question) in its pane" });
    else if (hq.interactive_ready === false) setReason({ seen: "HQ's agent is starting and cannot take input yet" });
    else setReason({ seen: null, sent: null }); // the flush below finds out if typing in still fails
  } else {
    // The pane HQ was last seen in, if it still holds an agent without a name: most likely HQ, restarted or resumed.
    const last = db.query("SELECT pane FROM hq_link WHERE id = 1").get() as { pane: string } | null;
    const there = last && agents.find((a) => a.pane_id === last.pane && !a.name);
    candidate = there ? { pane: there.pane_id, agent: there.agent } : null;
    setReason({ seen: `no agent in herdr is named "${HQ_AGENT}"` });
  }
  if (!seen) flush();
}

// The one way to tell HQ something. `ref` ties it to what it carries ("note:12", "ask:5") so the page can mark it held.
export function notifyHq(text: string, ref?: string) {
  db.query("INSERT INTO hq_outbox (at, text, ref) VALUES (?, ?, ?)").run(Date.now(), text, ref ?? null);
  if (ref) bump();
  flush();
}

const held = () => db.query("SELECT * FROM hq_outbox WHERE sent_at IS NULL ORDER BY id").all() as Held[];

// Sends what is held, oldest first, and stops at the first failure so HQ reads things in the order they were written.
// One flush at a time; a call during one runs another when it ends.
let flushing: Promise<void> | null = null;
let again = false;
function flush(): Promise<void> {
  if (flushing) {
    again = true;
    return flushing;
  }
  flushing = (async () => {
    do {
      again = false;
      for (const row of held()) {
        // HQ already read it from its inbox (`hud inbox`): nothing to type in.
        if (alreadyRead(row.ref)) {
          db.query("UPDATE hq_outbox SET sent_at = ?, error = NULL WHERE id = ?").run(Date.now(), row.id);
          continue;
        }
        const late = Date.now() - row.at > 60_000 ? `(held while HQ was not receiving; written at ${clock(row.at)}) ` : "";
        const r = await promptAgent(HQ_AGENT, withHint(late + row.text));
        if (r.ok) {
          db.query("UPDATE hq_outbox SET sent_at = ?, error = NULL, tries = tries + 1 WHERE id = ?").run(Date.now(), row.id);
          setReason({ sent: null });
          if (row.ref || late) bump();
        } else {
          db.query("UPDATE hq_outbox SET error = ?, tries = tries + 1 WHERE id = ?").run(r.error.slice(0, 500), row.id);
          setReason({ sent: reasonOf(r.error) });
          bump();
          again = false;
          break;
        }
      }
    } while (again);
  })().finally(() => (flushing = null));
  return flushing;
}

// Resolves when the current flush, if any, is done: a route that checks HQ answers with what came of it.
export const flushed = () => flushing ?? Promise.resolve();

function alreadyRead(ref: string | null) {
  const [kind, id] = (ref ?? "").split(":");
  if (kind === "note") return !!(db.query("SELECT acked_at FROM notes WHERE id = ?").get(Number(id)) as { acked_at: number | null } | null)?.acked_at;
  if (kind === "ask") return !!(db.query("SELECT acked_at FROM asks WHERE id = ?").get(Number(id)) as { acked_at: number | null } | null)?.acked_at;
  return false;
}

const clock = (t: number) => new Date(t).toTimeString().slice(0, 5);

// Gives HQ's last pane its name back (`herdr agent rename`). Only the pane the server offered, never one the page names.
export async function nameHq(): Promise<void> {
  if (!candidate) throw new Error(`no pane to name: start HQ in herdr with the name ${HQ_AGENT}`);
  const proc = Bun.spawn([HERDR, "agent", "rename", candidate.pane, HQ_AGENT], { stdout: "ignore", stderr: "pipe" });
  if ((await proc.exited) !== 0) throw new Error(reasonOf((await new Response(proc.stderr).text()).trim()));
  event("hud", `named pane ${candidate.pane} ${HQ_AGENT}`);
}

export function hqLink() {
  const rows = held();
  const reason = seen ?? sent;
  return {
    agent: HQ_AGENT,
    ok: checked ? !reason : null,
    reason,
    since: reason ? since : null,
    candidate,
    // While HQ is not receiving, all of it; otherwise only what failed (the rest is on its way).
    held: rows.filter((r) => reason || r.error).map((r) => ({ id: r.id, at: r.at, ref: r.ref, text: r.text.length > 240 ? r.text.slice(0, 239) + "…" : r.text })),
  };
}
addStatePart("hq", hqLink);
