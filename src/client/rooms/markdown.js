// The room brief's markdown, as safe HTML: everything is escaped first, then headings, lists (with [ ] and [x]),
// quotes, rules, tables, code fences (with COPY), inline code, bold, italic and links (http(s) or a path on this
// HUD). Nothing an agent writes can add a tag, an attribute or a script. A thread's messages use it too, as chat:
// each line break shows, a blank line starts a paragraph, and [image: PATH] (an attached image) and #1234 (a PR)
// show as they do in MESSAGES.
import { esc } from "../core/format.js";
import { CONFIG } from "../core/state.js";

// An attached image's address on this HUD: from a room's folder (rooms/SLUG/files/NAME, where a room's send box puts
// it), an old shelf file (room-files/), or the general uploads/.
const unesc = (t) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
function imageUrl(escaped) {
  const p = unesc(escaped), f = p.split("/").pop();
  const room = p.match(/\/rooms\/([a-z0-9][a-z0-9-]{0,47})\/files\/([^/]+)$/);
  if (room) return `/rooms/${room[1]}/files/${encodeURIComponent(room[2])}`;
  return `/${/\/room-files\/[^/]+$/.test(p) ? "room-files" : "uploads"}/${encodeURIComponent(f)}`;
}
// A link's target: http(s), or a path on this HUD (never a protocol-relative //host).
const LINK = /\[([^\]\n]+)\]\(((?:https?:\/\/|\/(?!\/))[^\s)]*)\)/g;
function inline(raw, chat) {
  const codes = [];
  const keep = (html) => `\u0000${codes.push(html) - 1}\u0000`;
  let t = esc(raw).replace(/`([^`\n]+)`/g, (m, c) => keep(`<code>${c}</code>`));
  if (chat) {
    t = t.replace(/\[image: ([^\]\n]+?)\]/g, (m, p) => { const u = esc(imageUrl(p)); return keep(`<a href="${u}" target="_blank" rel="noopener"><img class="thumb" src="${u}" alt=""></a>`); });
    if (CONFIG.githubRepo) t = t.replace(/(^|[\s(])#(\d{4,5})\b/g, (m, p, n) => `${p}${keep(`<a href="https://github.com/${esc(CONFIG.githubRepo)}/pull/${n}" target="_blank" rel="noopener">#${n}</a>`)}`);
  }
  t = t.replace(LINK, (m, label, url) => `<a href="${url}" target="_blank" rel="noopener">${label}</a>`);
  t = t.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (m, p, u) => `${p}<a href="${u}" target="_blank" rel="noopener">${u.length > 60 ? u.slice(0, 57) + "…" : u}</a>`);
  t = t.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>").replace(/__([^_\n]+)__/g, "<b>$1</b>");
  t = t.replace(/(^|[\s(>])\*([^*\s][^*\n]*?)\*(?=$|[\s).,;:!?<])/g, "$1<i>$2</i>").replace(/(^|[\s(>])_([^_\s][^_\n]*?)_(?=$|[\s).,;:!?<])/g, "$1<i>$2</i>");
  t = t.replace(/~~([^~\n]+)~~/g, "<s>$1</s>");
  return t.replace(/\u0000(\d+)\u0000/g, (m, i) => codes[i]);
}
const task = (t, chat) => {
  const m = t.match(/^\[([ xX])\]\s+(.*)$/);
  return m ? `<span class="tick${m[1] === " " ? "" : " on"}">${m[1] === " " ? "" : "✓"}</span>${inline(m[2], chat)}` : inline(t, chat);
};
const BULLET = /^\s*[-*+]\s+/, NUMBER = /^\s*\d+[.)]\s+/;
const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

// chat: a message in a thread, where a line break is a line break.
export function markdown(src, chat = false) {
  const lines = String(src ?? "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let para = [];
  const flush = () => { if (para.length) { out.push(`<p>${chat ? para.map((l) => inline(l, true)).join("<br>") : inline(para.join(" "))}</p>`); para = []; } };
  for (let i = 0; i < lines.length;) {
    const l = lines[i];
    let m;
    if (/^\s*```/.test(l)) {
      flush();
      const body = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) body.push(lines[i]);
      i++;
      out.push(`<div class="codebox"><button class="copy" type="button">COPY</button><pre>${esc(body.join("\n"))}</pre></div>`);
    } else if ((m = l.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) {
      flush();
      out.push(`<h${Math.min(m[1].length, 4) + 2}>${inline(m[2], chat)}</h${Math.min(m[1].length, 4) + 2}>`);
      i++;
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) {
      flush();
      out.push("<hr>");
      i++;
    } else if (BULLET.test(l) || NUMBER.test(l)) {
      flush();
      const kind = BULLET.test(l) ? BULLET : NUMBER, items = [];
      while (i < lines.length && kind.test(lines[i])) {
        items.push(lines[i++].replace(kind, ""));
        // a wrapped line of the same item, indented under it
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !BULLET.test(lines[i]) && !NUMBER.test(lines[i])) items[items.length - 1] += " " + lines[i++].trim();
      }
      const tag = kind === BULLET ? "ul" : "ol";
      out.push(`<${tag}>${items.map((t) => `<li>${task(t, chat)}</li>`).join("")}</${tag}>`);
    } else if (/^\s*>/.test(l)) {
      flush();
      const q = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push(`<blockquote>${markdown(q.join("\n"), chat)}</blockquote>`);
    } else if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? "")) {
      flush();
      const head = cells(l);
      const rows = [];
      for (i += 2; i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]); i++) rows.push(cells(lines[i]));
      out.push(`<div class="mdtable"><table><thead><tr>${head.map((c) => `<th>${inline(c, chat)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c, chat)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
    } else if (!l.trim()) {
      flush();
      i++;
    } else {
      para.push(chat ? l.trimEnd() : l.trim());
      i++;
    }
  }
  flush();
  return out.join("");
}
