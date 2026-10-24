// Images attached to a send box: the ATTACH button, drop and paste, re-encoding, upload, the chips and their tokens.
import { $, toast } from "../core/dom.js";
import { emit } from "../core/bus.js";
import { esc, setHTML } from "../core/format.js";

// Every send box has a key: "note" (Tell HQ), "reply" (the open reply in MESSAGES) or an ask's id. Its images are
// uploaded as soon as they are picked and show as chips under the box; the text stays clean. On send, each image
// goes at the end of the text as "[image: /path/on/the/HUD]", which is how HQ opens it.
const attached = new Map();
let seq = 0;
const listOf = (key) => attached.get(String(key)) ?? [];
const SIDE = 2048, QUALITY = 0.85, MAX = 10 * 1024 * 1024, KEEP = 1024 * 1024;
const ACCEPTED = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const EXT_TYPE = { heic: "image/heic", heif: "image/heif", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", bmp: "image/bmp", tif: "image/tiff", tiff: "image/tiff" };
const typeOf = (file) => file.type || EXT_TYPE[(file.name || "").split(".").pop().toLowerCase()] || "";
const stemOf = (name) => (name || "image").replace(/\.[^.]*$/, "") || "image";
const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

class Refused extends Error { constructor(label, message) { super(message); this.label = label; } }

async function decode(file) {
  try { return await createImageBitmap(file); } catch {}
  const url = URL.createObjectURL(file), img = new Image();
  try { img.src = url; await img.decode(); return img; } finally { URL.revokeObjectURL(url); }
}
const encode = (canvas, type) => new Promise((res) => canvas.toBlob(res, type, QUALITY));

// What is uploaded: a GIF, or an accepted image already small, as it is; anything else the browser can read
// (an iPhone's HEIC, a big PNG) scaled to at most 2048 px on its longest side, as JPEG, or WebP where that is smaller.
export async function prepare(file) {
  const type = typeOf(file), name = file.name || "image";
  if (!type.startsWith("image/")) throw new Refused("NOT AN IMAGE", `${name} is not an image.`);
  if (type === "image/gif") {
    if (file.size > MAX) throw new Refused("OVER 10 MB", `${name} is ${mb(file.size)}; a GIF is sent as it is and the limit is 10 MB.`);
    return file;
  }
  let pic;
  try { pic = await decode(file); } catch {
    if (ACCEPTED.has(type) && file.size <= MAX) return file;
    const ext = type.split("/")[1].toUpperCase();
    throw new Refused(`CAN'T READ ${ext}`, `This browser cannot read ${ext} images (${name}). Send it as PNG, JPEG, GIF or WebP.`);
  }
  const w = pic.width, h = pic.height;
  if (ACCEPTED.has(type) && file.size <= KEEP && Math.max(w, h) <= SIDE) { pic.close?.(); return file; }
  const s = Math.min(1, SIDE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * s));
  canvas.height = Math.max(1, Math.round(h * s));
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(pic, 0, 0, canvas.width, canvas.height);
  pic.close?.();
  // WebP keeps transparency; JPEG has none, so it gets white behind the picture.
  const webp = await encode(canvas, "image/webp");
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const jpeg = await encode(canvas, "image/jpeg");
  let best = jpeg;
  if (webp?.type === "image/webp" && (!best || webp.size < best.size)) best = webp;
  if (!best) throw new Refused("CAN'T READ", `${name} could not be converted.`);
  if (ACCEPTED.has(type) && s === 1 && file.size <= best.size && file.size <= MAX) return file;
  if (best.size > MAX) throw new Refused("OVER 10 MB", `${name} is still ${mb(best.size)} after shrinking; the limit is 10 MB.`);
  return new File([best], `${stemOf(name)}.${best.type === "image/webp" ? "webp" : "jpg"}`, { type: best.type });
}

// Chips: a thumbnail each, a remove button, and the state while it is not uploaded yet.
export function chipsHTML(key) {
  return listOf(key).map((a) => {
    const src = a.preview || a.url;
    const note = a.state === "err" ? a.label : a.state === "done" ? "" : "UPLOADING";
    return `<span class="chip ${a.state}" data-chip="${a.id}" title="${esc(a.error || a.name)}">${src ? `<img src="${esc(src)}" alt="">` : `<span class="noimg">IMG</span>`}${note ? `<span class="cs">${esc(note)}</span>` : ""}${a.state === "err" && a.blob ? `<button type="button" class="cbtn" data-chip-retry="${a.id}">RETRY</button>` : ""}<button type="button" class="cbtn cx" data-chip-rm="${a.id}" aria-label="Remove ${esc(a.name)}">×</button></span>`;
  }).join("");
}
export const chipsBox = (key) => `<div class="chips" data-chips="${esc(key)}">${chipsHTML(key)}</div>`;
// A label around the file input: a tap opens the phone's own menu (photo library, camera, files) with no script.
export const attachButton = (key) => `<label class="attach" title="Attach images"><input type="file" accept="image/*" multiple data-attach="${esc(key)}" aria-label="Attach images"><svg viewBox="0 0 12 10" aria-hidden="true" shape-rendering="crispEdges"><path d="M0 0h12v10H0zM1 1v8h10V1z"/><path d="M8 2h2v2H8zM2 8l3-4 2 2 1-1 3 3z"/></svg></label>`;

function changed(key) {
  const row = document.querySelector(`[data-chips="${CSS.escape(String(key))}"]`);
  if (row) setHTML(row, chipsHTML(key));
  emit("attach", String(key));
}

async function upload(key, a) {
  a.state = "up";
  changed(key);
  try {
    const res = await fetch(`/api/uploads?name=${encodeURIComponent(a.blob.name || "image")}`, { method: "POST", headers: { "content-type": typeOf(a.blob), "x-hud": "1" }, body: a.blob });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    Object.assign(a, { state: "done", path: data.path, url: data.url, blob: null, error: "" });
  } catch (err) {
    Object.assign(a, { state: "err", label: "FAILED", error: `Upload failed: ${err.message}` });
    if (listOf(key).includes(a)) toast(`${a.name}: UPLOAD FAILED. TAP RETRY.`);
  }
  if (listOf(key).includes(a)) changed(key);
}

export async function addFiles(files, key) {
  key = String(key);
  const items = [...files].map((file) => ({ file, a: { id: `i${++seq}`, name: file.name || "image", state: "prep" } }));
  if (!items.length) return;
  attached.set(key, [...listOf(key), ...items.map((x) => x.a)]);
  changed(key);
  await Promise.all(items.map(async ({ file, a }) => {
    try {
      a.blob = await prepare(file);
      a.preview = URL.createObjectURL(a.blob);
    } catch (err) {
      Object.assign(a, { state: "err", label: err.label || "CAN'T READ", error: err.message });
      if (listOf(key).includes(a)) { toast(err.message); changed(key); }
      return;
    }
    if (listOf(key).includes(a)) await upload(key, a);
  }));
}

export function removeImage(key, id) {
  const list = listOf(key), a = list.find((x) => x.id === id);
  if (!a) return;
  if (a.preview) URL.revokeObjectURL(a.preview);
  attached.set(String(key), list.filter((x) => x !== a));
  changed(key);
}
export function clearImages(key) {
  const list = listOf(key);
  attached.delete(String(key));
  if (!list.length) return;
  for (const a of list) if (a.preview) URL.revokeObjectURL(a.preview);
  changed(key);
}
export const imageKeys = () => [...attached.keys()].filter((k) => listOf(k).length);
export const hasImages = (key) => listOf(key).length > 0;
// Why the box cannot send yet, or "" when every image is uploaded.
export function notReady(key) {
  const list = listOf(key);
  if (list.some((a) => a.state === "prep" || a.state === "up")) return "AN IMAGE IS STILL UPLOADING.";
  if (list.some((a) => a.state === "err")) return "AN IMAGE DID NOT UPLOAD. RETRY OR REMOVE IT.";
  return "";
}
// The text HQ receives: what was typed, then one token per image, exactly as a drop used to put them in the text.
export const withImages = (key, text) => [text, ...listOf(key).filter((a) => a.state === "done").map((a) => `[image: ${a.path}]`)].filter(Boolean).join(" ");

// Kept with the drafts across a reload: only uploaded images, as their paths. The bytes are on the HUD's disk.
export const savedImages = () => imageKeys().map((k) => [k, listOf(k).filter((a) => a.state === "done").map(({ name, path, url }) => ({ name, path, url }))]).filter(([, l]) => l.length);
export function restoreImages(saved) {
  for (const [k, list] of saved ?? []) attached.set(String(k), list.map((a) => ({ ...a, id: `i${++seq}`, state: "done" })));
}

// The picker. The box may be built again while the phone's menu is open, so the input that opened it is listened
// to directly as well as through the document; the first to read the files empties the input.
function picked(input) {
  const files = [...(input.files ?? [])];
  input.value = "";
  if (files.length) addFiles(files, input.dataset.attach);
}
document.addEventListener("click", (e) => {
  const input = e.target.closest?.("input[data-attach]");
  if (input) input.onchange = () => picked(input);
}, true);
document.addEventListener("change", (e) => { if (e.target.matches?.("input[data-attach]")) picked(e.target); });
document.addEventListener("click", (e) => {
  const rm = e.target.closest("[data-chip-rm], [data-chip-retry]");
  if (!rm) return;
  const id = rm.dataset.chipRm || rm.dataset.chipRetry, key = rm.closest("[data-chips]").dataset.chips;
  if (rm.dataset.chipRm) { removeImage(key, id); return; }
  const a = listOf(key).find((x) => x.id === id);
  if (a?.blob) upload(key, a);
});

// Drop or paste an image into any text box: it joins that box's chips.
const imageFiles = (dt) => [...(dt?.files ?? [])].filter((f) => typeOf(f).startsWith("image/"));
const boxKey = (el) => (el.closest?.("[data-rbox]") ? "reply" : el.closest?.("[data-ask]")?.dataset.ask ?? "note");
const boxOf = (key) => (key === "note" ? $("noteText") : key === "reply" ? document.querySelector("[data-rbox] textarea") : document.querySelector(`[data-ask="${key}"] textarea`));
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
  addFiles(files, boxKey(e.target));
});
document.addEventListener("paste", (e) => {
  const files = imageFiles(e.clipboardData);
  if (!files.length) return;
  e.preventDefault();
  addFiles(files, document.activeElement?.tagName === "TEXTAREA" ? boxKey(document.activeElement) : "note");
});
