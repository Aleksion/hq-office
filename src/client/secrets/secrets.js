// The SECRETS pane: paste a value, see names and deadlines (with the date), and the names a restart lost.
import { $, toast } from "../core/dom.js";
import { S } from "../core/state.js";
import { clock, esc, setHTML } from "../core/format.js";
import { post } from "../core/net.js";
import { atText, expiresText } from "./expiry.js";

// The owner pastes a value, names it and gives it minutes. HQ reads it with  hud secret get NAME | <command>  until then.
// The page only ever sees names and times; a value goes out in one request and is never kept here.
export const liveSecrets = () => (S?.secrets ?? []).filter((x) => x.expiresAt > Date.now());
// Names the server lost in a restart (crash or kill) before their deadline: said in red until set again or dismissed.
export const lostSecrets = () => (S?.secretsLost ?? []).filter((x) => x.expiresAt > Date.now());
export function renderSecrets() {
  const lost = lostSecrets().map((x) => `<div class="sitem lost" data-secret-row="${esc(x.name)}">
      <b>${esc(x.name)}</b><span class="tag lost">LOST</span>
      <span class="why">lost in a restart at ${esc(restartAt(x.lostAt))}, set it again</span>
      <button class="btn-s" type="button" data-secret-rm="${esc(x.name)}">DISMISS</button>
    </div>`).join("");
  const rows = liveSecrets().map((x) => `<div class="sitem" data-secret-row="${esc(x.name)}">
      <b>${esc(x.name)}</b><span class="tag">${esc(x.by.toUpperCase())}</span><span class="sk">SET ${clock(x.setAt)}</span>
      <span class="left" data-exp="${x.expiresAt}"></span>
      <button class="btn-s" type="button" data-secret-rm="${esc(x.name)}">DELETE</button>
    </div>`).join("");
  setHTML($("secretList"), lost + rows || `<div class="hint">No secrets. Name one, give it minutes and paste the value. HQ reads it with <code>hud secret get NAME | &lt;command&gt;</code> until it expires. A restart of the plugin hands them over; a crash loses them, and they show here as lost.</div>`);
  renderSecretTimes();
}
// "13:45" today, else "yesterday 13:45" or "Mon 2 Nov, 13:45".
const restartAt = (t) => { const s = atText(t); return s.startsWith("today ") ? s.slice(6) : s; };
export function renderSecretTimes() {
  const now = Date.now();
  for (const el of document.querySelectorAll("#secretList [data-exp]")) {
    const left = Number(el.dataset.exp) - now;
    if (left <= 0) { el.closest(".sitem").remove(); continue; }
    el.textContent = expiresText(Number(el.dataset.exp), now);
    el.classList.toggle("soon", left < 60000);
  }
}
$("secretForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const value = $("secValue").value;
  // Cleared at once, whatever the server says.
  $("secValue").value = "";
  const name = $("secName").value.trim();
  if (!value) { toast("PASTE A VALUE FIRST"); return; }
  try {
    await post("/api/secrets", { name, minutes: Number($("secMin").value), value, by: "owner" });
    $("secName").value = "";
    toast(`SAVED ${name}. HQ CAN READ IT.`);
  } catch (err) { toast(err.message); }
});
