// Moved here from the page's single script.
import { $, toast } from "../core/dom.js";
import { S } from "../core/state.js";
import { clock, dur, esc } from "../core/format.js";
import { post } from "../core/net.js";

// The owner pastes a value, names it and gives it minutes. HQ reads it with  hud secret get NAME | <command>  until then.
// The page only ever sees names and times; a value goes out in one request and is never kept here.
export const liveSecrets = () => (S?.secrets ?? []).filter((x) => x.expiresAt > Date.now());
export function renderSecrets() {
  const rows = liveSecrets().map((x) => `<div class="sitem" data-secret-row="${esc(x.name)}">
      <b>${esc(x.name)}</b><span class="tag">${esc(x.by.toUpperCase())}</span><span class="sk">SET ${clock(x.setAt)}</span>
      <span class="left" data-exp="${x.expiresAt}"></span>
      <button class="btn-s" type="button" data-secret-rm="${esc(x.name)}">DELETE</button>
    </div>`).join("");
  $("secretList").innerHTML = rows || `<div class="hint">No secrets. Name one, give it minutes and paste the value. HQ reads it with <code>hud secret get NAME | &lt;command&gt;</code> until it expires; a restart clears it.</div>`;
  renderSecretTimes();
}
export function renderSecretTimes() {
  const now = Date.now();
  for (const el of document.querySelectorAll("#secretList [data-exp]")) {
    const left = Number(el.dataset.exp) - now;
    if (left <= 0) { el.closest(".sitem").remove(); continue; }
    el.textContent = dur(left);
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
