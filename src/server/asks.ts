// Asks: HQ's questions, and answering them.
import { checkMinutes, checkName, checkValue } from "./secrets.ts";
import { expiresText } from "../client/secrets/expiry.js";
import { OWNER } from "./config.ts";
import { db } from "./db.ts";
import type { Ask } from "./types.ts";
import { bump, secrets } from "./push.ts";
import { event } from "./events.ts";
import { notifyHq } from "./hq-link.ts";

export function createAsk(body: any) {
  if (!body.title) throw new Error("title is required");
  const wanted = [...new Set<string>((body.secrets ?? []).map(checkName))];
  const res = db
    .query("INSERT INTO asks (lane, kind, title, body, options, recommended, link, due, created_at, secrets) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(
      body.lane ?? null,
      body.kind ?? "decision",
      body.title,
      body.body ?? null,
      body.options?.length ? JSON.stringify(body.options) : null,
      body.recommended ?? null,
      body.link ?? null,
      body.due ?? null,
      body.created_at ?? Date.now(),
      wanted.length ? JSON.stringify(wanted) : null,
    );
  event("hq", `asked: ${body.title}`, body.lane);
  return Number(res.lastInsertRowid);
}

export function answerAsk(id: number, answer: string) {
  const ask = db.query("SELECT * FROM asks WHERE id = ?").get(id) as Ask | null;
  if (!ask) throw new Error(`no ask ${id}`);
  if (ask.status !== "open") throw new Error(`ask ${id} is already ${ask.status}`);
  db.query("UPDATE asks SET status = 'answered', answer = ?, answered_at = ? WHERE id = ?").run(answer, Date.now(), id);
  event(OWNER, `answered "${ask.title}": ${answer}`, ask.lane);
  notifyHq(`HUD answer #${id}${ask.lane ? ` (${ask.lane})` : ""}: "${ask.title}" -> ${answer}`, `ask:${id}`);
}

// An ask that requests secrets is answered with their values: each one goes to the secret store, and the
// answer HQ gets (and the database keeps) names them only.
export function answerWithSecrets(id: number, body: any) {
  const ask = db.query("SELECT * FROM asks WHERE id = ?").get(id) as Ask | null;
  if (!ask) throw new Error(`no ask ${id}`);
  if (ask.status !== "open") throw new Error(`ask ${id} is already ${ask.status}`);
  const wanted: string[] = ask.secrets ? JSON.parse(ask.secrets) : [];
  if (!wanted.length) throw new Error(`ask ${id} requests no secrets`);
  const minutes = checkMinutes(body.minutes);
  const values = wanted.map((name) => {
    try {
      return checkValue(body.values?.[name]);
    } catch (e) {
      throw new Error(`${name}: ${(e as Error).message}`);
    }
  });
  const set = wanted.map((name, i) => secrets.set(name, values[i], minutes, "owner"));
  const note = String(body.note ?? "").trim();
  answerAsk(id, `secrets set: ${wanted.join(", ")}, ${expiresText(set[0].expiresAt)}; read with: hud secret get NAME | <command>${note ? `. ${note}` : ""}`);
}

// ---- defer ----

// The owner puts an open question off until a time (ms since the epoch; null brings it back now). It leaves the open list
// until then and is back at the top at its time, whether or not anyone is looking: the server bumps the page then, and a
// restart re-arms the timer from the column, so a deferred question cannot be lost. HQ is told when, so it does not chase.
export function deferAsk(id: number, until: unknown) {
  const ask = db.query("SELECT * FROM asks WHERE id = ?").get(id) as Ask | null;
  if (!ask) throw new Error(`no ask ${id}`);
  if (ask.status !== "open") throw new Error(`ask ${id} is already ${ask.status}`);
  const now = Date.now();
  if (until !== null && (typeof until !== "number" || !Number.isFinite(until) || until <= now)) throw new Error("until is a time in the future, in milliseconds since the epoch, or null to bring the question back now");
  const at = until === null ? now : (until as number);
  db.query("UPDATE asks SET defer_until = ? WHERE id = ?").run(at, id);
  const from = ask.lane ? ` (${ask.lane})` : "";
  if (until === null) {
    event(OWNER, `brought back "${ask.title}"`, ask.lane);
    notifyHq(`HUD defer #${id}${from}: "${ask.title}" -- ${OWNER} brought it back; it is open again.`);
  } else {
    const when = new Date(at).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    event(OWNER, `deferred "${ask.title}" until ${when}`, ask.lane);
    notifyHq(`HUD defer #${id}${from}: "${ask.title}" -- ${OWNER} deferred it until ${when}; it is still open and comes back to the top then. Do not chase it before.`);
  }
  armReturn();
}

// One timer, set for the soonest time a deferred question comes back (setTimeout cannot wait more than ~24 days: it re-arms).
let wake: ReturnType<typeof setTimeout> | undefined;
export function armReturn() {
  clearTimeout(wake);
  const next = db.query("SELECT MIN(defer_until) AS t FROM asks WHERE status = 'open' AND defer_until > ?").get(Date.now()) as { t: number | null };
  if (!next.t) return;
  wake = setTimeout(() => {
    bump();
    armReturn();
  }, Math.min(next.t - Date.now() + 5, 2 ** 31 - 1));
}
armReturn();
