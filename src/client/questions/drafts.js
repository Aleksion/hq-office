// Unsent answers and notes, kept across the page's own reloads.
import { $ } from "../core/dom.js";
import { renderLog } from "../feed/feed.js";
import { renderMachines, renderStats } from "../topbar/topbar.js";
import { renderHud } from "./questions.js";
import { renderCard } from "../card/card.js";
import { renderMsgs, renderQTabs } from "../messages/messages.js";
import { renderWork } from "../work-board/work-board.js";

export const drafts = new Map();
// Secret values typed into a question card, by ask id. Memory only: never in drafts, sessionStorage or the DOM's markup.
export const secretDrafts = new Map();

// Autoreload: the server stamps index.html's mtime into every state. A new stamp means the file changed.
// Unsent text is parked in sessionStorage so the reload does not eat it.
export function keepDrafts() {
  try { sessionStorage.setItem("hq-drafts", JSON.stringify({ drafts: [...drafts], note: $("noteText").value })); } catch {}
}
function restoreDrafts() {
  try {
    const d = JSON.parse(sessionStorage.getItem("hq-drafts") || "null");
    sessionStorage.removeItem("hq-drafts");
    if (!d) return;
    for (const [k, v] of d.drafts) drafts.set(k, v);
    $("noteText").value = d.note || "";
  } catch {}
}
restoreDrafts();


// The stream's first message is the whole state; after that each message holds only the parts of the state that
// changed, and only the panels showing one of those parts are built again.
export const PANELS = [
  [["open", "lanes", "score", "updatesUnread"], () => renderStats()],
  [["machines"], () => renderMachines()],
  [["open"], () => renderHud()],
  [["lanes", "open", "config"], () => renderCard()],
  [["notes", "answered", "updates", "updatesUnread", "secrets"], () => renderLog()],
  [["open", "updatesUnread", "board"], () => renderQTabs()],
  [["board", "open"], () => renderWork()],
  [["updates", "notes"], () => renderMsgs()],
];
