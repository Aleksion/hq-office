// Images attached to a send box: the composer, its photo button, drop and paste, re-encoding, upload, the tray of
// thumbnails, the preview and the tokens.
import { $ } from "../core/dom.js";
import { emit } from "../core/bus.js";
import { esc, setHTML } from "../core/format.js";

// Every send box has a key: "note" (Tell HQ), "reply" (the open reply in MESSAGES) or an ask's id. Its images are
// uploaded as soon as they are picked and show as thumbnails in the box's tray; the text stays clean. On send, each image
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
    if (file.size > MAX) throw new Refused("OVER 10 MB", `${name} is ${mb(file.size)}; the limit is 10 MB.`);
    return file;
  }
  let pic;
  try { pic = await decode(file); } catch {
    if (ACCEPTED.has(type) && file.size <= MAX) return file;
    const ext = type.split("/")[1].toUpperCase();
    throw new Refused(`CAN'T READ ${ext}`, `${name}: this browser cannot read ${ext} images.`);
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
  if (best.size > MAX) throw new Refused("OVER 10 MB", `${name} is ${mb(best.size)} even shrunk; the limit is 10 MB.`);
  return new File([best], `${stemOf(name)}.${best.type === "image/webp" ? "webp" : "jpg"}`, { type: best.type });
}

// Pixel icons, drawn on a grid and scaled by whole pixels.
const icon = (w, h, paths) => `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true" shape-rendering="crispEdges">${paths}</svg>`;
const PHOTO = icon(15, 13, `<path fill-rule="evenodd" d="M1 0h10v1h1v8h-1v1H1V9H0V1h1zM1 1v8h10V1z"/><path d="M7 2h2v2H7zM2 8l3-4 2 2 1-1 2 3z"/><path class="ring" d="M10 5h4v3h1v2h-1v3h-4v-3H9V8h1z"/><path class="plus" d="M11 6h2v6h-2zM10 8h4v2h-4z"/>`);
const CROSS = icon(6, 6, `<path d="M0 0h2v1H0zM4 0h2v1H4zM1 1h4v1H1zM2 2h2v2H2zM1 4h4v1H1zM0 5h2v1H0zM4 5h2v1H4z"/>`);
const RETRY = icon(8, 8, `<path d="M2 0h3v1H2zM6 0h1v1H6zM1 1h1v1H1zM5 1h2v1H5zM0 2h1v1H0zM4 2h3v1H4zM0 3h1v2H0zM7 4h1v2H7zM0 5h1v1H0zM1 6h1v1H1zM6 6h1v1H6zM2 7h4v1H2z"/>`);

// The tray: a thumbnail each, with a round remove badge on its corner. Tap a thumbnail to see it larger; while it
// uploads it is dimmed under a spinner; when the upload failed it has a red ring and is tapped to retry. Under the
// thumbnails, one line per image that did not make it says why.
export function chipsHTML(key) {
  const list = listOf(key);
  if (!list.length) return "";
  const chips = list.map((a) => {
    const src = a.preview || a.url, name = esc(a.name);
    const pic = src ? `<img src="${esc(src)}" alt="">` : `<span class="noimg">${esc(a.state === "err" ? a.label : "IMG")}</span>`;
    const face = a.state === "err" && a.blob ? `<button type="button" class="cimg" data-chip-retry="${a.id}" aria-label="Retry ${name}">${pic}<span class="cover">${RETRY}<b>RETRY</b></span></button>`
      : a.state === "err" ? `<span class="cimg">${pic}</span>`
      : `<button type="button" class="cimg" data-chip-open="${a.id}" aria-label="${a.state === "done" ? "Open" : "Uploading"} ${name}" ${src ? "" : "disabled"}>${pic}${a.state === "done" ? "" : `<span class="cover"><i class="spin"></i></span>`}</button>`;
    return `<div class="chip ${a.state}" data-chip="${a.id}" title="${esc(a.error || a.name)}">${face}<button type="button" class="cx" data-chip-rm="${a.id}" aria-label="Remove ${name}"><span>${CROSS}</span></button></div>`;
  }).join("");
  const why = list.filter((a) => a.state === "err").map((a) => `<div class="why">${esc(a.error)}</div>`).join("");
  return `<div class="tray">${chips}</div>${why}`;
}
const chipsBox = (key) => `<div class="chips" data-chips="${esc(key)}">${chipsHTML(key)}</div>`;
// A label around the file input: a tap opens the phone's own menu (photo library, camera, files) with no script.
export const attachButton = (key) => `<label class="attach" title="Attach images"><input type="file" accept="image/*" multiple data-attach="${esc(key)}" aria-label="Attach images">${PHOTO}</label>`;
// A send box: the tray (when there are images), the text field, then the photo button and the box's own button.
export const composer = (key, field, send) => `<div class="reply" data-composer="${esc(key)}">${chipsBox(key)}${field}<div class="acts">${attachButton(key)}${send}</div></div>`;

// The tray is built again on every change; it keeps its sideways scroll, or shows the end when images were added.
function changed(key, toEnd = false) {
  const box = document.querySelector(`[data-chips="${CSS.escape(String(key))}"]`);
  if (box) {
    const left = box.querySelector(".tray")?.scrollLeft ?? 0;
    setHTML(box, chipsHTML(key));
    const tray = box.querySelector(".tray");
    if (tray) tray.scrollLeft = toEnd ? tray.scrollWidth : left;
  }
  emit("attach", String(key));
}

// Where a box's images go: /api/uploads, unless a feature claims the box's key by its prefix (a room's send box,
// "room:SLUG", puts them in the room's folder). Such a target answers with an id too, and can take an image back
// (remove) when it is removed from the tray before sending.
const targets = [];
export const uploadTarget = (prefix, target) => { targets.push({ prefix, ...target }); };
const targetOf = (key) => targets.find((t) => String(key).startsWith(t.prefix));

async function upload(key, a) {
  a.state = "up";
  changed(key);
  try {
    const name = a.blob.name || "image", t = targetOf(key);
    const res = await fetch(t ? t.url(String(key), name) : `/api/uploads?name=${encodeURIComponent(name)}`, { method: "POST", headers: { "content-type": typeOf(a.blob), "x-hud": "1" }, body: a.blob });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    Object.assign(a, { state: "done", path: data.path, url: data.url, ref: data.id ?? null, blob: null, error: "" });
  } catch (err) {
    Object.assign(a, { state: "err", label: "FAILED", error: `${a.name} did not upload. Tap it to retry.` });
  }
  if (listOf(key).includes(a)) changed(key);
}

export async function addFiles(files, key) {
  key = String(key);
  const items = [...files].map((file) => ({ file, a: { id: `i${++seq}`, name: file.name || "image", state: "prep" } }));
  if (!items.length) return;
  attached.set(key, [...listOf(key), ...items.map((x) => x.a)]);
  changed(key, true);
  await Promise.all(items.map(async ({ file, a }) => {
    try {
      a.blob = await prepare(file);
      a.preview = URL.createObjectURL(a.blob);
    } catch (err) {
      Object.assign(a, { state: "err", label: err.label || "CAN'T READ", error: err.message });
      if (listOf(key).includes(a)) changed(key);
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
  if (a.state === "done" && a.ref != null) targetOf(key)?.remove?.(String(key), a);
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
export const savedImages = () => imageKeys().map((k) => [k, listOf(k).filter((a) => a.state === "done").map(({ name, path, url, ref }) => ({ name, path, url, ref }))]).filter(([, l]) => l.length);
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
  const btn = e.target.closest("[data-chip-rm], [data-chip-retry], [data-chip-open]");
  if (!btn) return;
  const { chipRm, chipRetry, chipOpen } = btn.dataset, key = btn.closest("[data-chips]").dataset.chips;
  if (chipRm) { removeImage(key, chipRm); return; }
  const a = listOf(key).find((x) => x.id === (chipRetry || chipOpen));
  if (chipRetry && a?.blob) upload(key, a);
  if (chipOpen && a) openPreview(a.preview || a.url, a.name);
});

// The preview: the image as large as the screen allows, a close button, and a tap anywhere else closes it.
export function openPreview(src, name) {
  let d = $("imgPreview");
  if (!d) {
    d = document.createElement("dialog");
    d.id = "imgPreview";
    d.className = "preview";
    d.autofocus = true;
    d.innerHTML = `<figure><img alt=""><figcaption></figcaption></figure><button type="button" class="pclose" aria-label="Close preview"><span>${CROSS}</span></button>`;
    d.addEventListener("click", (e) => { if (e.target.tagName !== "IMG") d.close(); });
    document.body.append(d);
  }
  d.querySelector("img").src = src;
  d.querySelector("img").alt = name;
  d.querySelector("figcaption").textContent = name;
  d.showModal();
}

// The text field grows with what is typed, up to a few lines, then scrolls (CSS field-sizing; by script where the
// browser has none).
if (!CSS.supports("field-sizing", "content")) {
  const fit = (ta) => { ta.style.height = "auto"; ta.style.height = `${ta.scrollHeight}px`; };
  for (const type of ["input", "focusin"]) document.addEventListener(type, (e) => { if (e.target.matches?.(".reply textarea")) fit(e.target); });
}

// Drop or paste an image into any text box: it joins that box's tray.
const imageFiles = (dt) => [...(dt?.files ?? [])].filter((f) => typeOf(f).startsWith("image/"));
const boxKey = (el) => el.closest?.("[data-composer]")?.dataset.composer ?? (el.closest?.("[data-rbox]") ? "reply" : el.closest?.("[data-ask]")?.dataset.ask ?? "note");
const boxOf = (key) => document.querySelector(`[data-composer="${CSS.escape(String(key))}"]`);
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
