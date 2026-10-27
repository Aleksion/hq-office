// Asks: HQ's questions, and answering them.
import { checkMinutes, checkName, checkValue } from "./secrets.ts";
import { expiresText } from "../client/secrets/expiry.js";
import { OWNER } from "./config.ts";
import { db } from "./db.ts";
import type { Ask } from "./types.ts";
import { bump, secrets } from "./push.ts";
import { event } from "./events.ts";
import { notifyHq } from "./hq-link.ts";
import { underHq } from "../lane-tree.ts";

// The owner's rule (#242): every ask carries the agent's pick and why. A decision with options and no --rec, or a --rec
// that is not one of its options, is refused (either way the owner would see no HQ PICK), with the command to send
// instead. The why has no field of its own: it goes in the body, and is not checked. The rule is for what agents file,
// so the routes behind hud ask and hud update apply it; the server's own questions (claude-accounts.ts) have no agent to
// pick.
// Shell-quoted, so a line copied from a refusal passes each value as it was: single quotes keep newlines, $ and backticks
// literal (double quotes would expand $HOME and run a backticked command); a ' inside is closed, escaped and reopened.
const q = (v: string) => `'${v.replace(/'/g, `'\\''`)}'`;
const listOf = (v: unknown) => (v == null ? [] : Array.isArray(v) ? v : [v]).map((o) => String(o).trim()).filter(Boolean);
const hhmm = (at: number) => { const d = new Date(at); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
type Fix = { how: string; example: string };

function refuse(kind: unknown, options: string[], recommended: unknown, fix: (pick: string) => Fix) {
  if ((kind ?? "decision") !== "decision" || !options.length) return;
  const rec = String(recommended ?? "").trim();
  if (rec && options.includes(rec)) return;
  const { how, example } = fix(options[0]);
  throw new Error(
    `${rec ? `This decision's --rec ${q(rec)} is not one of its options.` : "This decision has options but no recommendation."} Every question to the owner carries your pick and why: ${how}. Example:\n` +
      `  ${example}\n` +
      `A question with no options (--kind action or info) needs no --rec.`,
  );
}

// hud ask: the same command back, with --rec and a why in --body, keeping where it goes and when it is due.
export function refuseMissingPick(body: any) {
  const options = listOf(body.options);
  refuse(body.kind, options, body.recommended, (pick) => ({
    how: "add --rec with the option you recommend, and say why in --body",
    example: [
      `hud ask --title ${q(String(body.title ?? ""))}`,
      body.lane ? `--lane ${q(String(body.lane))}` : "",
      body.kind ? `--kind ${q(String(body.kind))}` : "",
      ...options.map((o) => `--opt ${q(o)}`),
      `--rec ${q(pick)}`,
      `--body ${q(String(body.body ?? "").trim() || `I recommend ${pick} because ...`)}`,
      body.link ? `--link ${q(String(body.link))}` : "",
      Number(body.due) ? `--due ${hhmm(Number(body.due))}` : "",
    ].filter(Boolean).join(" "),
  }));
}

// hud update ID --opt / --rec: the same rule, on the question as the edit would leave it. The fix is an update of the
// same question (a new hud ask would file it twice), and the why goes in a comment, which leaves its body alone.
export function refuseMissingPickAfter(id: number, body: any) {
  if (body.options === undefined && body.recommended === undefined) return;
  const ask = db.query("SELECT kind, options, recommended FROM asks WHERE id = ?").get(id) as { kind: string; options: string | null; recommended: string | null } | null;
  if (!ask) return; // updateAsk says there is no such ask
  const options = listOf(body.options !== undefined ? body.options : JSON.parse(ask.options ?? "[]"));
  refuse(ask.kind, options, body.recommended !== undefined ? body.recommended : ask.recommended, (pick) => ({
    how: `set --rec on question ${id} to the option you recommend, and say why with hud comment`,
    // Nothing of the refused edit was applied, so the example carries all of it again, with the pick added.
    example: [
      `hud update ${id}`,
      body.title !== undefined ? `--title ${q(String(body.title))}` : "",
      body.body !== undefined ? `--body ${q(String(body.body))}` : "",
      ...(body.options !== undefined ? options.map((o) => `--opt ${q(o)}`) : []),
      `--rec ${q(pick)}`,
      body.link !== undefined ? `--link ${q(String(body.link))}` : "",
      body.lane !== undefined ? `--lane ${q(String(body.lane))}` : "",
      `&& hud comment ${id} ${q(`I recommend ${pick} because ...`)}`,
    ].filter(Boolean).join(" "),
  }));
}

// hud ask --from LANE: the lane that handed the question in must be one HQ knows, as --as is for a comment. HQ files its
// own questions, so --from hq is no handoff.
function handedBy(from: unknown) {
  if (underHq(from)) return null;
  const lane = String(from).trim();
  if (!db.query("SELECT 1 FROM lanes WHERE name = ?").get(lane)) throw new Error(`no lane named ${lane}: --from names the lane that handed the question in`);
  return lane;
}

// A question's link opens from the page, so it must be a web address. Empty means none.
export function checkLink(v: unknown) {
  const s = String(v ?? "").trim();
  if (s && !/^https?:\/\/\S+$/i.test(s)) throw new Error("the link must start with http:// or https://");
  return s || null;
}

export function createAsk(body: any) {
  if (!body.title) throw new Error("title is required");
  const link = checkLink(body.link);
  const wanted = [...new Set<string>((body.secrets ?? []).map(checkName))];
  const from = handedBy(body.from);
  const res = db
    .query("INSERT INTO asks (lane, kind, title, body, options, recommended, link, due, created_at, secrets, handed_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(
      body.lane ?? null,
      body.kind ?? "decision",
      body.title,
      body.body ?? null,
      listOf(body.options).length ? JSON.stringify(listOf(body.options)) : null, // stored as compared: trimmed
      String(body.recommended ?? "").trim() || null,
      link,
      body.due ?? null,
      body.created_at ?? Date.now(),
      wanted.length ? JSON.stringify(wanted) : null,
      from,
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
