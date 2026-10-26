// Asks: HQ's questions, and answering them.
import { checkMinutes, checkName, checkValue } from "./secrets.ts";
import { OWNER } from "./config.ts";
import { db } from "./db.ts";
import type { Ask } from "./types.ts";
import { secrets } from "./push.ts";
import { event } from "./events.ts";
import { notifyHq } from "./herdr.ts";

// --rec names one of the options: the option itself, its letter ("A" for "A: Allow the two"; for options with no
// letters, A is the first), or its text without the letter. It is stored as the full option, which is what the page
// marks HQ PICK; a --rec that names no option, or more than one, is refused.
const LABEL = /^([A-Za-z0-9]{1,2})\s*[:.)\-–]\s*/;
export function resolveRec(rec: unknown, options: string[]): string | null {
  const r = String(rec ?? "").trim();
  if (!r) return null;
  if (!options.length) throw new Error(`--rec "${r}" has no options to pick from: give them with --opt`);
  const low = (s: string) => s.trim().toLowerCase();
  const ways = [
    (o: string) => o === r,
    (o: string) => low(o) === low(r),
    (o: string) => low(o.match(LABEL)?.[1] ?? "") === low(r),
    (o: string) => low(o.replace(LABEL, "")) === low(r.replace(LABEL, "")),
  ];
  for (const way of ways) {
    const hits = options.filter(way);
    if (hits.length === 1) return hits[0];
  }
  if (/^[A-Za-z]$/.test(r) && !options.some((o) => LABEL.test(o))) {
    const i = r.toUpperCase().charCodeAt(0) - 65;
    if (i < options.length) return options[i];
  }
  throw new Error(`--rec "${r}" is not one of the options (${options.map((o) => `"${o}"`).join(", ")}): give its letter or its text`);
}

export function createAsk(body: any) {
  if (!body.title) throw new Error("title is required");
  const options = (body.options ?? []).map(String);
  const recommended = resolveRec(body.recommended, options);
  const wanted = [...new Set<string>((body.secrets ?? []).map(checkName))];
  const res = db
    .query("INSERT INTO asks (lane, kind, title, body, options, recommended, link, due, created_at, secrets) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(
      body.lane ?? null,
      body.kind ?? "decision",
      body.title,
      body.body ?? null,
      options.length ? JSON.stringify(options) : null,
      recommended,
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
  notifyHq(`HUD answer #${id}${ask.lane ? ` (${ask.lane})` : ""}: "${ask.title}" -> ${answer}`);
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
  wanted.forEach((name, i) => secrets.set(name, values[i], minutes, "owner"));
  const note = String(body.note ?? "").trim();
  answerAsk(id, `secrets set: ${wanted.join(", ")}, readable for ${minutes} min with: hud secret get NAME | <command>${note ? `. ${note}` : ""}`);
}
