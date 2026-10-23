// Dropping or pasting images into any text box: upload, then insert the path.
import { $, toast } from "../core/dom.js";

// Drop or paste an image into any text box. The image is saved on the HUD's disk and the box gets its path,
// which is how HQ opens it.
const imageFiles = (dt) => [...(dt?.files ?? [])].filter((f) => f.type.startsWith("image/"));
const boxKey = (el) => (el.closest?.("[data-rbox]") ? "reply" : el.closest?.("[data-ask]")?.dataset.ask ?? "note");
const boxOf = (key) => (key === "note" ? $("noteText") : key === "reply" ? document.querySelector("[data-rbox] textarea") : document.querySelector(`[data-ask="${key}"] textarea`));
function insertAtCaret(ta, text) {
  const s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? s;
  ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
  ta.setSelectionRange(s + text.length, s + text.length);
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}
async function attachImages(files, key) {
  for (const file of files) {
    try {
      const res = await fetch(`/api/uploads?name=${encodeURIComponent(file.name || "image")}`, { method: "POST", headers: { "content-type": file.type, "x-hud": "1" }, body: file });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      // The box may have been redrawn while the upload ran, so find it again.
      const box = boxOf(key);
      if (box) insertAtCaret(box, `[image: ${data.path}] `);
      else toast("ASK CLOSED. IMAGE SAVED.");
    } catch (err) { toast(err.message); }
  }
}
const clearDropping = () => document.querySelectorAll(".dropping").forEach((el) => el.classList.remove("dropping"));
document.addEventListener("dragover", (e) => {
  if (!imageFiles(e.dataTransfer).length) return;
  e.preventDefault();
  clearDropping();
  boxOf(boxKey(e.target))?.classList.add("dropping");
});
document.addEventListener("dragleave", (e) => { if (!e.relatedTarget) clearDropping(); });
document.addEventListener("drop", (e) => {
  clearDropping();
  const files = imageFiles(e.dataTransfer);
  if (!files.length) return;
  e.preventDefault();
  attachImages(files, boxKey(e.target));
});
document.addEventListener("paste", (e) => {
  const files = imageFiles(e.clipboardData);
  if (!files.length) return;
  e.preventDefault();
  attachImages(files, document.activeElement?.tagName === "TEXTAREA" ? boxKey(document.activeElement) : "note");
});
