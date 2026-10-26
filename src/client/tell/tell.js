// Tell HQ: the free-text note box, with its attached images.
import { $, toast } from "../core/dom.js";
import { post } from "../core/net.js";
import { attachButton, chipsHTML, clearImages, hasImages, notReady, withImages } from "../images/images.js";
import { setHTML } from "../core/format.js";

$("compose").addEventListener("submit", async (e) => {
  e.preventDefault();
  const typed = $("noteText").value.trim();
  if (!typed && !hasImages("note")) return;
  const wait = notReady("note");
  if (wait) { toast(wait); return; }
  try { await post("/api/notes", { text: withImages("note", typed), urgent: urgent.getAttribute("aria-pressed") === "true" }); urgent.setAttribute("aria-pressed", "false"); $("noteText").value = ""; $("noteText").style.height = ""; clearImages("note"); toast("SENT TO HQ."); } catch (err) { toast(err.message); }
});
// URGENT: this one is not for the queue. It goes to the top, and one line is typed into HQ's pane (see TELL_GOES_TO_QUEUE).
const urgent = document.createElement("button");
urgent.type = "button";
urgent.className = "btn urgent-toggle";
urgent.textContent = "URGENT";
urgent.title = "HQ reads a plain note from its queue; an urgent one reaches HQ at once";
urgent.setAttribute("aria-pressed", "false");
urgent.addEventListener("click", () => urgent.setAttribute("aria-pressed", String(urgent.getAttribute("aria-pressed") !== "true")));
document.querySelector("#compose .acts").prepend(urgent);
$("noteText").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) $("compose").requestSubmit(); });
// The photo button, the same on every send box, and the images kept from before a reload.
document.querySelector("#compose .acts").insertAdjacentHTML("afterbegin", attachButton("note"));
setHTML(document.querySelector('[data-chips="note"]'), chipsHTML("note"));
