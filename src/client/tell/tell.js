// Tell HQ: the free-text note box, with its attached images and files. With floors it goes to the floor you are in;
// in the building or SHOW ALL, to the floor picked beside SEND (the last one used, at first). Its placeholder names
// that floor's HQ, or says when that HQ isn't receiving.
import { $, toast } from "../core/dom.js";
import { post } from "../core/net.js";
import { attachButton, chipsHTML, clearImages, hasImages, notReady, withImages } from "../images/images.js";
import { esc, setHTML } from "../core/format.js";
import { S } from "../core/state.js";
import { on } from "../core/bus.js";
import { firstFloor, floorById, floorsOf, linkOf, multi } from "../core/floors.js";
import { scope } from "../core/scope.js";

const PLACEHOLDER = $("noteText").placeholder;
const LAST = "hq-tell-floor";
let picked = (() => { try { return localStorage.getItem(LAST); } catch { return null; } })();
// The floor a note goes to; null with one floor (the server's first floor, as before floors).
function tellFloor() {
  if (!S || !multi(S)) return null;
  const s = scope();
  if (s.floor && !s.all) return s.floor;
  return floorById(S, picked)?.id ?? s.floor ?? firstFloor(S);
}
function remember(floor) {
  picked = floor;
  try { localStorage.setItem(LAST, floor); } catch {}
}

$("compose").addEventListener("submit", async (e) => {
  e.preventDefault();
  const typed = $("noteText").value.trim();
  if (!typed && !hasImages("note")) return;
  const wait = notReady("note");
  if (wait) { toast(wait); return; }
  const floor = tellFloor();
  try {
    await post("/api/notes", { text: withImages("note", typed), ...(floor ? { floor } : {}) });
    if (floor) remember(floor);
    $("noteText").value = ""; $("noteText").style.height = ""; clearImages("note");
    toast(linkOf(S, floor)?.ok === false ? "KEPT. HQ ISN'T RECEIVING; IT GOES WHEN HQ IS BACK." : "SENT TO HQ.");
    renderTell();
  } catch (err) { toast(err.message); }
});
$("noteText").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) $("compose").requestSubmit(); });
// The attach button, the same on every send box, and what was attached before a reload. The whole TELL HQ panel
// takes a drop for its box.
document.querySelector("#compose .acts").insertAdjacentHTML("afterbegin", attachButton("note"));
setHTML(document.querySelector('[data-chips="note"]'), chipsHTML("note"));
$("compose").closest(".box").setAttribute("data-drop", "");

// The FLOOR select beside SEND: made the first time the building or SHOW ALL shows, so one floor's page is unchanged.
function renderTell() {
  if (!S) return;
  const s = scope(), choose = multi(S) && (!s.floor || s.all);
  let sel = $("tellFloor");
  if (choose && !sel) {
    sel = document.createElement("select");
    sel.id = "tellFloor";
    sel.className = "tfloor";
    sel.setAttribute("aria-label", "The floor whose HQ gets this");
    sel.addEventListener("change", () => { remember(sel.value); renderTell(); });
    document.querySelector("#compose .acts .send").before(sel);
  }
  if (sel) {
    sel.hidden = !choose;
    if (choose) {
      setHTML(sel, floorsOf(S).map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join(""));
      sel.value = tellFloor();
    }
  }
  const floor = tellFloor(), f = floorById(S, floor);
  const text = linkOf(S, floor)?.ok === false ? "HQ isn't receiving: this is kept and sent when HQ is back." : f ? `Tell HQ (${f.name})…` : PLACEHOLDER;
  if ($("noteText").placeholder !== text) $("noteText").placeholder = text;
}
on("state", renderTell);
on("scope", renderTell);
