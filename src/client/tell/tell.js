// Tell HQ: the free-text note box, with its attached images.
import { $, toast } from "../core/dom.js";
import { post } from "../core/net.js";
import { chipsHTML, clearImages, hasImages, notReady, withImages } from "../images/images.js";
import { setHTML } from "../core/format.js";

$("compose").addEventListener("submit", async (e) => {
  e.preventDefault();
  const typed = $("noteText").value.trim();
  if (!typed && !hasImages("note")) return;
  const wait = notReady("note");
  if (wait) { toast(wait); return; }
  try { await post("/api/notes", { text: withImages("note", typed) }); $("noteText").value = ""; clearImages("note"); toast("SENT TO HQ."); } catch (err) { toast(err.message); }
});
$("noteText").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) $("compose").requestSubmit(); });
// Images kept from before a reload.
setHTML(document.querySelector('[data-chips="note"]'), chipsHTML("note"));
