// Tell HQ: the free-text note box, with its attached images and files.
import { $, toast } from "../core/dom.js";
import { post } from "../core/net.js";
import { attachButton, chipsHTML, clearImages, hasImages, notReady, withImages } from "../images/images.js";
import { setHTML } from "../core/format.js";
import { S } from "../core/state.js";

$("compose").addEventListener("submit", async (e) => {
  e.preventDefault();
  const typed = $("noteText").value.trim();
  if (!typed && !hasImages("note")) return;
  const wait = notReady("note");
  if (wait) { toast(wait); return; }
  try { await post("/api/notes", { text: withImages("note", typed) }); $("noteText").value = ""; $("noteText").style.height = ""; clearImages("note"); toast(S.hq?.ok === false ? "KEPT. HQ ISN'T RECEIVING; IT GOES WHEN HQ IS BACK." : "SENT TO HQ."); } catch (err) { toast(err.message); }
});
$("noteText").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) $("compose").requestSubmit(); });
// The attach button, the same on every send box, and what was attached before a reload. The whole TELL HQ panel
// takes a drop for its box.
document.querySelector("#compose .acts").insertAdjacentHTML("afterbegin", attachButton("note"));
setHTML(document.querySelector('[data-chips="note"]'), chipsHTML("note"));
$("compose").closest(".box").setAttribute("data-drop", "");
