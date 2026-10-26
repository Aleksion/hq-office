// Asks: HQ's questions, and answering them.
import { checkMinutes, checkName, checkValue } from "./secrets.ts";
import { OWNER } from "./config.ts";
import { db } from "./db.ts";
import type { Ask } from "./types.ts";
import { secrets } from "./push.ts";
import { event } from "./events.ts";
import { notifyHq } from "./herdr.ts";

// The options as given: one or many, never empty strings. createAsk and updateAsk read them the same way.
export const optionsOf = (raw: unknown): string[] => (raw == null ? [] : Array.isArray(raw) ? raw : [raw]).map(String).filter(Boolean);

// --rec names one of the options, and is stored as the full option, which is what the page marks HQ PICK:
// - the option itself, in any case;
// - its letter: "A" for "A: Allow the two". When the options are not all lettered, an option's letter is its place,
//   so A is the first;
// - its text without the letter ("Allow the two"), or its head before a colon ("Yes" for "Yes: do it").
// Anything else is refused, never guessed: a --rec that names no option or several, and a --rec whose own letter
// disagrees with the option its text names ("B: Allow the two" when that is A).
// A letter is one letter, or one or two digits, then ":", "." or ")": "No:", "A-B" and "Re-run" are words, not letters.
const LETTER = /^([A-Za-z]|\d{1,2})\s*[:.)]\s*/;
export function resolveRec(rec: unknown, options: string[]): string | null {
  const r = String(rec ?? "").trim();
  if (!r) return null;
  if (!options.length) throw new Error(`--rec "${r}" has no options to pick from: give them with --opt`);
  const low = (s: string) => s.trim().toLowerCase();
  const lettered = options.every((o) => LETTER.test(o));
  const letterOf = (o: string, i: number) => low(lettered ? o.match(LETTER)![1] : String.fromCharCode(65 + i));
  const textOf = (o: string) => low(lettered ? o.replace(LETTER, "") : o);
  const bare = /^([A-Za-z]|\d{1,2})$/.test(r);
  const recLetter = bare ? r : (r.match(LETTER)?.[1] ?? null);
  const recText = bare ? "" : low(r.replace(LETTER, ""));
  const one = (hits: number[]) => (hits.length === 1 ? hits[0] : -1);
  const each = (pick: (o: string, i: number) => boolean) => one(options.flatMap((o, i) => (pick(o, i) ? [i] : [])));
  let i = each((o) => o === r);
  if (i < 0) i = each((o) => low(o) === low(r));
  if (i < 0 && recLetter && !recText) i = each((o, k) => letterOf(o, k) === low(recLetter));
  if (i < 0 && recText) {
    i = each((o) => textOf(o) === recText);
    if (i < 0) i = each((o) => o.includes(":") && low(o.slice(0, o.indexOf(":"))) === recText);
    if (i >= 0 && recLetter && low(recLetter) !== letterOf(options[i], i))
      throw new Error(`--rec "${r}" says ${recLetter.toUpperCase()}, but its text is option ${letterOf(options[i], i).toUpperCase()}, "${options[i]}": give one or the other`);
  }
  if (i < 0) throw new Error(`--rec "${r}" is not one of the options (${options.map((o) => `"${o}"`).join(", ")}): give its letter or its text`);
  return options[i];
}

export function createAsk(body: any) {
  if (!body.title) throw new Error("title is required");
  const options = optionsOf(body.options);
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
