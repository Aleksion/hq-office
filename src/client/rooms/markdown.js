// The room brief's markdown, as safe HTML: everything is escaped first, then headings, lists (with [ ] and [x]),
// quotes, rules, tables, code fences (with COPY), inline code, bold, italic and links (http(s) or a path on this
// HUD). Nothing an agent writes can add a tag, an attribute or a script.
import { esc } from "../core/format.js";

// A link's target: http(s), or a path on this HUD (never a protocol-relative //host).
const LINK = /\[([^\]\n]+)\]\(((?:https?:\/\/|\/(?!\/))[^\s)]*)\)/g;
function inline(raw) {
  const codes = [];
  let t = esc(raw).replace(/`([^`\n]+)`/g, (m, c) => `\u0000${codes.push(c) - 1}\u0000`);
  t = t.replace(LINK, (m, label, url) => `<a href="${url}" target="_blank" rel="noopener">${label}</a>`);
  t = t.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (m, p, u) => `${p}<a href="${u}" target="_blank" rel="noopener">${u.length > 60 ? u.slice(0, 57) + "…" : u}</a>`);
  t = t.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>").replace(/__([^_\n]+)__/g, "<b>$1</b>");
  t = t.replace(/(^|[\s(>])\*([^*\s][^*\n]*?)\*(?=$|[\s).,;:!?<])/g, "$1<i>$2</i>").replace(/(^|[\s(>])_([^_\s][^_\n]*?)_(?=$|[\s).,;:!?<])/g, "$1<i>$2</i>");
  t = t.replace(/~~([^~\n]+)~~/g, "<s>$1</s>");
  return t.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code>${codes[i]}</code>`);
}
const task = (t) => {
  const m = t.match(/^\[([ xX])\]\s+(.*)$/);
  return m ? `<span class="tick${m[1] === " " ? "" : " on"}">${m[1] === " " ? "" : "✓"}</span>${inline(m[2])}` : inline(t);
};
const BULLET = /^\s*[-*+]\s+/, NUMBER = /^\s*\d+[.)]\s+/;
const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function markdown(src) {
  const lines = String(src ?? "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let para = [];
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; } };
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
      out.push(`<h${Math.min(m[1].length, 4) + 2}>${inline(m[2])}</h${Math.min(m[1].length, 4) + 2}>`);
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
      out.push(`<${tag}>${items.map((t) => `<li>${task(t)}</li>`).join("")}</${tag}>`);
    } else if (/^\s*>/.test(l)) {
      flush();
      const q = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push(`<blockquote>${markdown(q.join("\n"))}</blockquote>`);
    } else if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? "")) {
      flush();
      const head = cells(l);
      const rows = [];
      for (i += 2; i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]); i++) rows.push(cells(lines[i]));
      out.push(`<div class="mdtable"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
    } else if (!l.trim()) {
      flush();
      i++;
    } else {
      para.push(l.trim());
      i++;
    }
  }
  flush();
  return out.join("");
}
