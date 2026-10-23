// Rich text in questions and messages: links, image thumbs, code boxes with COPY, MORE/LESS.
import { CONFIG } from "./state.js";
import { esc } from "./format.js";

export function linkify(s) {
  return esc(s)
    .replace(/\[image: ([^\]\s]+)\]/g, (m, p) => { const f = p.split("/").pop(); return `<a href="/uploads/${f}" target="_blank" rel="noopener"><img class="thumb" src="/uploads/${f}" alt=""></a>`; })
    .replace(/https?:\/\/[^\s<)]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u.length > 60 ? u.slice(0, 57) + "…" : u}</a>`)
    .replace(/(^|[\s(])#(\d{4,5})\b/g, (m, p, n) => (CONFIG.githubRepo ? `${p}<a href="https://github.com/${CONFIG.githubRepo}/pull/${n}" target="_blank" rel="noopener">#${n}</a>` : m));
}
// Question bodies: text between ``` fences becomes a grey box with a Copy button. The rest is plain text with links.
// Long messages show their first part and a MORE button. Which ones are open is remembered by key, so re-renders keep it.
const LONG = 280;
export const expanded = new Set();
export function clipText(text, key) {
  const t = String(text ?? "");
  if (t.length <= LONG) return linkify(t);
  const open = expanded.has(key);
  const shown = open ? t : t.slice(0, LONG).replace(/\s+\S*$/, "") + "…";
  return `${linkify(shown)}<button class="more" type="button" data-more="${esc(key)}">${open ? "LESS" : "MORE"}</button>`;
}
export function renderBody(s) {
  const parts = [];
  let last = 0;
  const fence = /```[^\n]*\n?([\s\S]*?)```/g;
  let m;
  while ((m = fence.exec(s))) {
    parts.push(linkify(s.slice(last, m.index)));
    parts.push(`<div class="codebox"><button class="copy" type="button">COPY</button><pre>${esc(m[1].replace(/\n$/, ""))}</pre></div>`);
    last = fence.lastIndex;
  }
  parts.push(linkify(s.slice(last)));
  return parts.join("");
}
export function copyCode(btn) {
  const pre = btn.parentElement.querySelector("pre");
  const done = (ok) => {
    btn.textContent = ok ? "COPIED" : "SELECTED: PRESS CMD-C";
    setTimeout(() => { btn.textContent = "COPY"; }, 1600);
  };
  // Fallback: select the box's text so a plain Cmd-C works.
  const select = () => {
    const range = document.createRange();
    range.selectNodeContents(pre);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    try { return document.execCommand("copy"); } catch { return false; }
  };
  // The write starts inside the click itself, so the browser allows it.
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(pre.textContent).then(() => done(true), () => done(select()));
  else done(select());
}
