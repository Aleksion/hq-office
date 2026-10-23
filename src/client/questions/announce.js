// Notices new questions: the chime, and switching back to QUESTIONS.
import { S } from "../core/state.js";
import { chime } from "../sound/sound.js";
import { qTab, replyText, setQTab } from "../messages/messages.js";

let seenAsks = null;

export function announce() {
  const ids = new Set(S.open.map((a) => a.id));
  if (seenAsks) {
    const fresh = S.open.filter((a) => !seenAsks.has(a.id));
    if (fresh.length) { chime(); if ((qTab === "messages" && !replyText.trim()) || qTab === "work") setQTab("questions"); }
  }
  seenAsks = ids;
}
