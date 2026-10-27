// Tell HQ: the free-text note box, with its attached images.
import { $, toast } from "../core/dom.js";
import { post } from "../core/net.js";
import { attachButton, chipsHTML, clearImages, hasImages, notReady, withImages } from "../images/images.js";
import { setHTML } from "../core/format.js";
import { S } from "../core/state.js";
import { on } from "../core/bus.js";
import { tellRecipient } from "../core/floors.js";
import { view } from "../core/scope.js";

$("compose").addEventListener("submit", async (e) => {
  e.preventDefault();
  const typed = $("noteText").value.trim();
  if (!typed && !hasImages("note")) return;
  const wait = notReady("note");
  if (wait) { toast(wait); return; }
  try { await post("/api/notes", { text: withImages("note", typed) }); $("noteText").value = ""; $("noteText").style.height = ""; clearImages("note"); toast(S.hq?.ok === false ? "KEPT. HQ ISN'T RECEIVING; IT GOES WHEN HQ IS BACK." : "SENT TO HQ."); } catch (err) { toast(err.message); }
});
$("noteText").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) $("compose").requestSubmit(); });
// The photo button, the same on every send box, and the images kept from before a reload.
document.querySelector("#compose .acts").insertAdjacentHTML("afterbegin", attachButton("note"));
setHTML(document.querySelector('[data-chips="note"]'), chipsHTML("note"));
// The heading names who the note goes to: HQ in every scope.
const heading = $("below").closest(".head").querySelector("h2");
const renderTo = () => { const text = `TELL ${tellRecipient(S, view())}`; if (heading.textContent !== text) heading.textContent = text; };
on("state", renderTo);
on("scope", () => S && renderTo());
