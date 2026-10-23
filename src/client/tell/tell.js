// Tell HQ: the free-text note box.
import { $, toast } from "../core/dom.js";
import { post } from "../core/net.js";

$("compose").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("noteText").value.trim();
  if (!text) return;
  try { await post("/api/notes", { text }); $("noteText").value = ""; toast("SENT TO HQ."); } catch (err) { toast(err.message); }
});
$("noteText").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) $("compose").requestSubmit(); });
