// Splits the page's one <style> block into a stylesheet per area. Each rule keeps its text and the comment above
// it; a rule goes to the area its selector names. The server links every stylesheet under src/client, core/ first,
// then the rest by path, so the order below only decides where a rule lives, not when it loads.
import { slug } from "./split.ts";

// The comment headers the style block had when this plan was written. A rule under a header not listed here is
// new work from another lane: it gets a stylesheet of its own, named from the header.
const KNOWN_HEADERS = [
  "One deliberate look", "the handheld dialog box", "Layout: two zones", "top bar:", "HERO and SOUND stacked",
  "the one number that matters", "everything else about the office", "the room", "desktop: the page never scrolls",
  "\"more below\" pill", "Tell HQ, docked", "FROM HQ and your sent log", "questions", "QUESTIONS / MESSAGES",
  "the message thread", "worker card",
];

// First match wins; tested against the rule's text from its selector on.
const RULES: [RegExp, string][] = [
  [/^:root\s*\{\s*--qcol/, "core/layout.css"],
  [/^(:root|\*|body|a|button|\.wrap|\.box|\.px)\s*\{/, "core/base.css"],
  [/^@media \((min-width: 1151px|max-width: 800px)\)/, "core/layout.css"],
  [/^\.qwrap \{ position/, "core/layout.css"],
  [/^\.(top|main|desk|under)\b/, "core/layout.css"],
  [/^\.(settings|shead|srow|opts2|sfoot)\b|^\.btn-s\.on\b/, "settings/settings.css"],
  [/^\.(stat|title|btns|urgent|strip|fromhq|health)\b/, "topbar/topbar.css"],
  [/^\.(room|legend)\b|^canvas\b/, "room/room.css"],
  [/^\.(below|hud|ask|timer|due|menu|opt|qtabs|qwrap)\b|^\.tag\.(count|lane|decision|action|info)\b/, "questions/questions.css"],
  [/^\.(tell|compose)\b/, "tell/tell.css"],
  [/^\.(feed|updates|upd|log)\b/, "feed/feed.css"],
  [/^\.(msgs|msg|quote|thread|rbox)\b/, "messages/messages.css"],
  [/^\.(card|status)\b/, "card/card.css"],
  [/^\.(spacer|btn|btn-s|tag|tab|more|codebox|copy|reply|send|empty|toast|thumb)\b|^textarea\.dropping|^@keyframes/, "core/controls.css"],
];

const DOCS: Record<string, string> = {
  "core/base.css": "Colour and font tokens, the reset, the page wrapper and the handheld dialog box (.box). Light only.",
  "core/controls.css": "Shared controls: buttons, tags, tabs, the reply box and SEND, code boxes, MORE, thumbs, toasts, keyframes.",
  "core/layout.css": "The page grid: the top bar's columns, the desk and the stage, and on desktop a page that never scrolls.",
  "topbar/topbar.css": "The top bar: the waiting count, the office strip, FROM HQ, machines, the SETTINGS and SOUND buttons.",
  "settings/settings.css": "The SETTINGS panel.",
  "room/room.css": "The room's frame, its canvas and the legend under it.",
  "questions/questions.css": "The question panel: the QUESTIONS / MESSAGES tabs, each ask, its timer, options and the out-of-view pill.",
  "tell/tell.css": "Tell HQ, docked under the questions.",
  "feed/feed.css": "The box under the room: FROM HQ updates and the sent log.",
  "messages/messages.css": "The MESSAGES thread.",
  "card/card.css": "The worker card.",
};

type Block = { comment: string; rule: string };

// Top-level comments and rules, in order. A comment is kept with the rule that follows it.
function blocks(css: string): Block[] {
  const out: Block[] = [];
  let i = 0, comment = "";
  while (i < css.length) {
    if (/\s/.test(css[i])) { i++; continue; }
    if (css.startsWith("/*", i)) {
      const e = css.indexOf("*/", i) + 2;
      comment += css.slice(i, e) + "\n";
      i = e;
      continue;
    }
    let depth = 0, j = i;
    for (; j < css.length; j++) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}" && --depth === 0) break;
      else if (css.startsWith("/*", j)) j = css.indexOf("*/", j) + 1;
    }
    out.push({ comment, rule: css.slice(i, j + 1) });
    comment = "";
    i = j + 1;
  }
  if (comment) out.push({ comment, rule: "" });
  return out;
}

export function splitCss(css: string) {
  const files = new Map<string, string[]>();
  const placed: string[] = [];
  let file = "core/base.css";
  let header: string | null = null; // the unknown header we are under, if any
  for (const b of blocks(css)) {
    const heads = [...b.comment.matchAll(/\/\*\s*([\s\S]*?)\*\//g)].map((m) => m[1].replace(/^[-\s]+|[-\s]+$/g, "").trim());
    if (heads.length) {
      const known = heads.every((h) => KNOWN_HEADERS.some((k) => h.startsWith(k)));
      header = known ? null : heads[heads.length - 1];
    }
    if (header) {
      const s = slug(header);
      file = `${s}/${s}.css`;
    } else {
      const hit = RULES.find(([re]) => re.test(b.rule));
      if (hit) file = hit[1];
      else if (b.rule) placed.push(`${b.rule.split("{")[0].trim()} -> ${file} (no selector rule; kept with the rule above)`);
    }
    const list = files.get(file) ?? files.set(file, []).get(file)!;
    list.push(b.comment + b.rule);
  }
  const out = new Map<string, string>();
  for (const [f, list] of files) out.set(f, `/* ${DOCS[f] ?? "Moved here from the page's single <style> block."} */\n` + list.join("\n") + "\n");
  return { files: out, notes: placed };
}
