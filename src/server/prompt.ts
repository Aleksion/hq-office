// Blocked on a prompt: an agent waiting at a permission prompt or a question picker in its pane, and the short plain
// excerpt of what it asks (the question and its options, at most four lines) that the HUD shows and HQ is told.
//
// What the panes look like (herdr pane read, plain text):
//   Claude:  "Do you want to proceed?" (or "Do you want to make this edit to x?"), then "❯ 1. Yes", "  2. Yes, and
//            don't ask again ...", "  3. No, and tell Claude what to do differently (esc)", often inside a box (│ ╭ ╰).
//   Codex:   "Would you like to run the following command?" with "› 1. Yes, proceed (y)" ..., and its question picker:
//            "Question 1/1 (1 unanswered)", the question, "› 1. Option  description", "None of the above", and
//            "tab to add notes | enter to submit answer | esc to interrupt".
// herdr itself reports such an agent as agent_status "blocked" ("Herdr recognized an approval or question UI").

export const MAX_LINES = 4;
const MAX_CHARS = 100;
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-_]/g;
// Box borders and the cursor in front of the chosen option.
const EDGE = /^[\s│┃|╭╮╰╯─━┌┐└┘]+|[\s│┃|╭╮╰╯─━┌┐└┘]+$/g;
const OPTION = /^(?:[❯›>▶]\s*)?\d+[.)]\s+\S/;
const CHOSEN = /^[❯›>▶]\s*\d+[.)]\s+\S/;
// Words only a prompt shows: they keep an agent's own reply that happens to hold a numbered list from counting.
const ASKING = /\b(?:do you want to|would you like to)\b.*\?|\bquestion \d+\/\d+|\b\d+ unanswered\b|enter to (?:select|submit|confirm)|\besc to cancel\b/i;
const GENERIC = /^(?:do you want to|would you like to)\b/i;

const clean = (s: string) => s.replace(ANSI, "").replace(/\r/g, "").replace(EDGE, "").replace(/\s+/g, " ").trim();
const short = (s: string) => (s.length > MAX_CHARS ? s.slice(0, MAX_CHARS - 1) + "…" : s);
const bare = (s: string) => s.replace(/^[❯›>▶]\s*/, "");

// The excerpt of the prompt at the bottom of a pane tail, or null when there is none. `known`: herdr already says the
// agent is blocked, so any numbered choice or trailing question will do; otherwise the tail must also show words only
// a prompt shows, and the chosen option must sit near the bottom (an answered prompt scrolls away).
export function promptIn(tail: string, known = false): string | null {
  const lines = tail.split("\n").map(clean);
  const filled = lines.map((l, i) => [l, i] as const).filter(([l]) => l);
  if (!known && !ASKING.test(lines.join("\n"))) return null;
  // The last block of options: the chosen one (or, when herdr says blocked, any option) nearest the bottom.
  const near = known ? filled : filled.slice(-14);
  const pick = [...near].reverse().find(([l]) => CHOSEN.test(l)) ?? (known ? [...near].reverse().find(([l]) => OPTION.test(l)) : undefined);
  if (!pick) return known ? trailingQuestion(filled) : null;
  // Walk up to the first option of the block, then down to its last.
  let first = pick[1];
  for (let i = first - 1; i >= 0; i--) {
    if (OPTION.test(lines[i])) first = i;
    else if (lines[i]) break;
  }
  const options: string[] = [];
  for (let i = first; i < lines.length && options.length < MAX_LINES; i++) {
    if (OPTION.test(lines[i])) options.push(bare(lines[i]));
    else if (lines[i]) break;
  }
  // The question: the nearest line above the options that is not blank.
  const above = filled.filter(([, i]) => i < first).map(([l]) => l);
  let question = above.at(-1) ?? "";
  // "Do you want to proceed?" says little alone: put what it is about (the line above it) in front.
  if (GENERIC.test(question) && above.length > 1 && !ASKING.test(above.at(-2)!)) question = `${above.at(-2)} · ${question}`;
  const out = [question, ...options].filter(Boolean).slice(0, MAX_LINES).map(short);
  return out.length ? out.join("\n") : null;
}

function trailingQuestion(filled: (readonly [string, number])[]) {
  const q = [...filled].reverse().find(([l]) => l.endsWith("?"));
  return q ? short(q[0]) : null;
}

// What a lane blocked by herdr shows when its pane gives no readable prompt.
export const UNREAD = "a prompt is open in its pane";
