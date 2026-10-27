// The box under the room: FROM HQ updates and the SENT & ANSWERED log, and the note under Tell HQ.
import { $, keepScroll, phone, showEdges } from "../core/dom.js";
import { S } from "../core/state.js";
import { messageChime } from "../sound/sound.js";
import { clock, esc, setHTML } from "../core/format.js";
import { clipText, linkify, renderBody } from "../core/text.js";
import { scheduleTick } from "../questions/questions.js";
import { liveSecrets, lostSecrets, renderSecrets } from "../secrets/secrets.js";
import { on } from "../core/bus.js";
import { counts, inScope, othersLine } from "../core/floors.js";
import { scope, toggleAll, view } from "../core/scope.js";

let seenUpdates = null, shownTab = null;

// FROM HQ: information, not questions. Newest first; unread ones are tinted. Nothing here waits, times or scores.
// It shares the box under the room with your sent log; the MESSAGES tab carries the unread count.
export let feedTab = "updates";
// Scoped (core/scope.js), the list holds the updates in scope, and its first line says how many are left out.
function updateRows() {
  const all = S.updates ?? [], shown = all.filter((u) => inScope(S, u, view()));
  const line = othersLine(S, scope(), all.length - shown.length);
  const rows = shown.map((u) => `<article class="upd ${u.read_at ? "" : "unread"}" data-upd="${u.id}">
      <div class="meta"><span class="tag">${clock(u.at)}</span>${u.lane ? `<span class="tag lane">${esc(u.lane)}</span>` : ""}${u.read_at ? "" : `<span class="tag new">NEW</span>`}</div>
      <h3>${linkify(u.title)}</h3>
      ${u.body ? `<div class="text">${u.body.includes("```") ? renderBody(u.body) : clipText(u.body, `u${u.id}`)}</div>` : ""}
    </article>`).join("");
  return (line ? `<button class="scopeline" type="button" data-showall>${esc(line)}</button>` : "") + (rows || `<div class="empty">Nothing from HQ yet.</div>`);
}
// The SECRETS pane is built once and only its list is redrawn, so a value being pasted survives every refresh.
export function renderFeed() {
  const unread = counts(S, view()).unread;
  const live = liveSecrets().length, lost = lostSecrets().length;
  const tab = (id, label, extra = "") => `<button class="tab ${feedTab === id ? "on" : ""}" type="button" data-tab="${id}">${label}${extra}</button>`;
  setHTML($("feedTabs"), `
      ${tab("updates", "FROM HQ", unread ? ` <span class="tag new">${unread} NEW</span>` : "")}
      ${tab("log", "SENT &amp; ANSWERED")}
      ${tab("secrets", "SECRETS", (live ? ` <span class="tag secret">${live}</span>` : "") + (lost ? ` <span class="tag secret lost">${lost} LOST</span>` : ""))}
      <span class="spacer"></span>
      ${feedTab === "updates" ? `<button class="btn-s" type="button" data-readall ${unread ? "" : "disabled"}>MARK ALL READ</button>` : ""}`);
  const secretsOn = feedTab === "secrets";
  $("feedBody").hidden = secretsOn;
  $("secretsPane").hidden = !secretsOn;
  if (!secretsOn) {
    const body = $("feedBody"), html = feedTab === "updates" ? updateRows() : `<div class="log" style="margin:0;max-height:none">${logRows()}</div>`;
    if (phone()) {
      // The list scrolls itself (core/layout.css), newest first: a tab opens at its top; at the top, a new update
      // shows there; reading older ones further down, what you read stays where it is.
      const opened = shownTab !== feedTab, place = !opened && body.scrollTop > 2 ? keepScroll(body, "data-upd") : null;
      setHTML(body, html);
      if (opened) body.scrollTop = 0; else place?.();
      showEdges(body);
    } else setHTML(body, html);
  }
  shownTab = feedTab;
  renderSecrets();
  scheduleTick(); // the SECRETS pane's countdown needs the page clock while it shows
}

export function announceUpdates() {
  const unread = new Set((S.updates ?? []).filter((u) => !u.read_at).map((u) => u.id));
  if (seenUpdates && [...unread].some((id) => !seenUpdates.has(id))) messageChime();
  seenUpdates = unread;
}

// Under Tell HQ: only your last note and whether HQ has it. The full log is the SENT & ANSWERED tab.
export function renderLog() {
  renderFeed();
  const n = S.notes[0];
  setHTML($("lastNote"), n
    ? `<b>LAST ${clock(n.at)}</b>${esc(n.text)} ${noteMark(n)}`
    : `<span style="color:var(--muted)">Nothing sent yet today.</span>`);
}
// Something HQ could not take yet (S.hq.held, see hq-link): said in red, not as "not picked up yet".
const held = (ref) => (S.hq?.held ?? []).some((h) => h.ref === ref);
const HELD = `<span style="color:var(--red)">· HELD: HQ isn't receiving</span>`;
function noteMark(n) {
  if (!n.acked_at && held(`note:${n.id}`)) return HELD;
  return `<span style="color:${n.acked_at ? "var(--green)" : "var(--amber)"}">${n.acked_at ? "· HQ has it" : "· not picked up yet"}</span>`;
}
function logRows() {
  // One list, newest first: your notes and HQ's answers interleaved by time.
  const notes = S.notes.slice(0, 5).map((n) => ({ at: n.at, html: `<div><b>${clock(n.at)} YOU</b>${clipText(n.text, `n${n.id}`)} ${noteMark(n)}</div>` }));
  const answered = S.answered.slice(0, 8).map((a) => ({ at: a.answered_at, html: `<div><b>${clock(a.answered_at)} ${a.status === "withdrawn" ? "WITHDRAWN" : "ANSWERED"}</b>${esc(a.lane ? a.lane + ": " : "")}${linkify(a.title)} → <strong>${clipText(a.answer, `a${a.id}`)}</strong> ${held(`ask:${a.id}`) && !a.acked_at ? HELD : `<span style="color:${a.acked_at ? "var(--green)" : "var(--amber)"}">${a.status === "withdrawn" ? "" : a.acked_at ? "· HQ acted" : "· HQ to act"}</span>`}</div>` }));
  const rows = [...notes, ...answered].sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  return rows.map((r) => r.html).join("") || `<div style="color:var(--muted)">Nothing yet today.</div>`;
}
$("feedBody").addEventListener("click", (e) => { if (e.target.closest("[data-showall]")) toggleAll(); });
on("scope", () => S && renderFeed());
$("feedBody").addEventListener("scroll", () => showEdges($("feedBody")), { passive: true });
export function setFeedTab(v) { return (feedTab = v); }
