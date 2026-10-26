// "HQ isn't receiving": a red banner above everything while the server finds no agent it can type into as HQ (S.hq,
// see src/server/hq-link.ts). It says why and since when, lists what is held for HQ, and offers the fix: give HQ's
// last pane its name back, or check again. Made the first time it is needed, so a page whose HQ is fine is unchanged.
import { on } from "../core/bus.js";
import { $, toast } from "../core/dom.js";
import { post } from "../core/net.js";
import { clock, esc, setHTML } from "../core/format.js";

const PLACEHOLDER = $("noteText")?.placeholder ?? "";
let box = null, was = null;
on("state", (S) => {
  const hq = S.hq;
  const down = hq?.ok === false;
  if ($("noteText")) $("noteText").placeholder = down ? "HQ isn't receiving: this is kept and sent when HQ is back." : PLACEHOLDER;
  if (down && was === true) toast("HQ ISN'T RECEIVING.");
  if (hq?.ok != null) was = hq.ok;
  if (!down && !box) return;
  if (!box) {
    box = document.createElement("section");
    box.className = "box hqdown";
    box.setAttribute("role", "alert");
    document.querySelector(".wrap")?.prepend(box);
  }
  box.hidden = !down;
  if (!down) return;
  const fix = hq.candidate
    ? `<button class="btn hqfix" type="button" data-hq="name">NAME ${esc(hq.candidate.pane)} "${esc(hq.agent)}"</button>`
    : "";
  const how = hq.candidate
    ? `HQ's last pane, ${esc(hq.candidate.pane)}, holds a ${esc(hq.candidate.agent)} agent without a name: most likely HQ, restarted.`
    : `Start HQ in herdr with the name <code>${esc(hq.agent)}</code>, or in HQ's pane run <code>herdr agent rename "$HERDR_PANE_ID" ${esc(hq.agent)}</code>.`;
  const held = hq.held ?? [];
  // One short strip, so the questions under it keep their room: what and why on the first line, the fix beside it,
  // and what is held folded under it.
  setHTML(box, `
    <div class="head"><b>HQ ISN'T RECEIVING</b><span class="why">${esc(hq.reason)}${hq.since ? ` · since ${clock(hq.since)}` : ""}</span><span class="acts">${fix}<button class="btn" type="button" data-hq="check">CHECK NOW</button></span></div>
    <p>What you send is kept and goes to HQ, in order, once it can take it. ${how}</p>
    ${held.length ? `<details class="held"><summary>HELD FOR HQ (${held.length})</summary>${held.map((h) => `<div><b>${clock(h.at)}</b>${esc(h.text.replace(/^HUD note from [^:]+: /, ""))}</div>`).join("")}</details>` : ""}`);
});

document.addEventListener("click", async (e) => {
  const b = e.target.closest?.("[data-hq]");
  if (!b) return;
  b.disabled = true;
  try {
    const link = await post(`/api/hq/${b.dataset.hq}`, {});
    toast(link?.ok ? "HQ IS RECEIVING. HELD MESSAGES SENT." : "HQ STILL ISN'T RECEIVING.");
  } catch (err) {
    toast(err.message);
  } finally {
    b.disabled = false;
  }
});
