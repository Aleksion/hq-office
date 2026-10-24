// REQUESTS: what a lane needs from HQ, as a record (READY, BLOCK, QUESTION or DONE, with the lane's own words).
// A request stays open until HQ's answer has reached the lane's pane, so waiting is a row to drain, not a guess
// from pane state. Answering delivers and closes in one step: if the pane cannot be reached the row stays open.
// A BLOCK or QUESTION may carry the lane's own default and a time; when the time comes the row is marked
// defaulted and drops out of the open queue, because the lane goes ahead on its own.
import { HERDR, LOCAL } from "./config.ts";
import { db } from "./db.ts";
import { event } from "./events.ts";

export const KINDS = ["READY", "BLOCK", "QUESTION", "DONE"] as const;
// A default is what a lane does when nobody answers; READY and DONE ask for nothing to default.
const DEFAULTABLE = ["BLOCK", "QUESTION"];
const DELIVER_TIMEOUT_MS = 20_000;

export type RequestRow = {
  id: number;
  kind: string;
  lane: string;
  pr: string | null;
  text: string;
  default_action: string | null;
  default_by: number | null;
  created_at: number;
  status: "open" | "defaulted" | "closed";
  defaulted_at: number | null;
  answer: string | null;
  answered_at: number | null;
  last_error: string | null;
};

// Sends text into a lane's pane. Injected in tests; the real one is herdr.
export type Deliver = (lane: string, text: string) => Promise<{ ok: true } | { ok: false; error: string }>;

export function fileRequest(body: any, now = Date.now()) {
  const kind = String(body.kind ?? "").toUpperCase();
  if (!(KINDS as readonly string[]).includes(kind)) throw new Error(`kind must be one of ${KINDS.join(", ")}`);
  const lane = String(body.lane ?? "").trim();
  if (!lane) throw new Error("lane is required: your herdr agent name");
  const text = String(body.text ?? "").trim();
  if (!text) throw new Error("the request text is required");
  const action = body.default ? String(body.default).trim() : null;
  const by = body.by === undefined || body.by === null ? null : Number(body.by);
  if (!!action !== (by !== null)) throw new Error("--default and --by go together");
  if (action) {
    if (!DEFAULTABLE.includes(kind)) throw new Error(`a ${kind} request has nothing to default`);
    if (!Number.isFinite(by) || by! <= now) throw new Error("--by must be a time in the future");
  }
  const pr = body.pr === undefined || body.pr === null || body.pr === "" ? null : String(body.pr).replace(/^#/, "");
  const id = Number(
    db
      .query("INSERT INTO requests (kind, lane, pr, text, default_action, default_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(kind, lane, pr, text, action, by, now).lastInsertRowid,
  );
  event(lane, `request #${id} ${kind}${pr ? ` PR #${pr}` : ""}: ${text.slice(0, 120)}`, lane);
  // A lane HQ cannot type into could never be answered; say so while the lane can still fix the name.
  const known = db.query("SELECT 1 FROM agents WHERE name = ?").get(lane);
  return { id, warning: known ? undefined : `no live herdr agent is named ${lane}: HQ's answer cannot reach you until the name matches` };
}

// Marks every default that has come due. Returns whether anything changed.
export function expireDefaults(now = Date.now()): boolean {
  const due = db.query("SELECT * FROM requests WHERE status = 'open' AND default_by IS NOT NULL AND default_by <= ?").all(now) as RequestRow[];
  for (const r of due) {
    db.query("UPDATE requests SET status = 'defaulted', defaulted_at = ? WHERE id = ?").run(r.default_by, r.id);
    event("hq", `request #${r.id} defaulted: ${r.lane} goes ahead with: ${r.default_action}`, r.lane);
  }
  return due.length > 0;
}

// Open requests, oldest first: what HQ still has to answer.
export function openRequests(now = Date.now()): RequestRow[] {
  expireDefaults(now);
  return db.query("SELECT * FROM requests WHERE status = 'open' ORDER BY created_at, id").all() as RequestRow[];
}

// Everything, newest first, capped: for `hud req list --all`.
export function allRequests(now = Date.now()): RequestRow[] {
  expireDefaults(now);
  return db.query("SELECT * FROM requests ORDER BY id DESC LIMIT 200").all() as RequestRow[];
}

export const nextRequest = (now = Date.now()) => openRequests(now)[0] ?? null;

export const herdrDeliver: Deliver = async (lane, text) => {
  const a = db.query("SELECT machine FROM agents WHERE name = ?").get(lane) as { machine: string } | null;
  if (!a) return { ok: false, error: `no live herdr agent is named ${lane}` };
  const args = a.machine === LOCAL ? [HERDR, "agent", "prompt", lane, text] : [HERDR, "--machine", a.machine, "agent", "prompt", lane, text];
  try {
    const proc = Bun.spawn(args, { stdout: "ignore", stderr: "pipe" });
    const timer = setTimeout(() => proc.kill(), DELIVER_TIMEOUT_MS);
    const [err, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
    clearTimeout(timer);
    return code === 0 ? { ok: true } : { ok: false, error: err.trim().split("\n")[0] || `herdr exit ${code}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
};

// Answers can overlap (two HQ turns, a retry): one delivery per request at a time.
const delivering = new Set<number>();

// Delivers the answer to the lane's pane and closes the row in the same step. A defaulted request can still be
// answered: HQ may correct a lane that has gone ahead. Throws, leaving the row open, when the pane is not reached.
export async function answerRequest(id: number, answer: string, deliver: Deliver = herdrDeliver, now = Date.now()) {
  const text = answer.trim();
  if (!text) throw new Error("the answer text is required");
  const r = db.query("SELECT * FROM requests WHERE id = ?").get(id) as RequestRow | null;
  if (!r) throw new Error(`no request #${id}`);
  if (r.status === "closed") throw new Error(`request #${id} is already closed`);
  if (delivering.has(id)) throw new Error(`request #${id} is being answered right now`);
  delivering.add(id);
  try {
    const sent = await deliver(r.lane, `HQ answer to your request #${id} (${r.kind}): ${text}`);
    if (!sent.ok) {
      db.query("UPDATE requests SET last_error = ? WHERE id = ?").run(sent.error, id);
      throw new Error(`not delivered to ${r.lane}: ${sent.error}. Request #${id} stays open`);
    }
    db.query("UPDATE requests SET status = 'closed', answer = ?, answered_at = ?, last_error = NULL WHERE id = ?").run(text, now, id);
    event("hq", `answered request #${id} from ${r.lane}: ${text.slice(0, 120)}`, r.lane);
    return { id, lane: r.lane };
  } finally {
    delivering.delete(id);
  }
}
