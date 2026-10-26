// ROOMS: a conference room per piece of work. The list shows each room's owner, its work's state on the board and
// its last activity; an open room shows its lanes, the pinned brief, the artifacts shelf and the thread, where you
// write to the owning lane or any lane in the room (the server types it into that lane). The office's conference
// table fills while a room talks (gather.js).
import "./gather.js";
import { $, keepScroll, phone, showEdges, toast } from "../core/dom.js";
import { CONFIG, S } from "../core/state.js";
import { clock, esc, setHTML } from "../core/format.js";
import { clipText, renderBody } from "../core/text.js";
import { post } from "../core/net.js";
import { on } from "../core/bus.js";
import { STATUS_TEXT } from "../core/status.js";
import { qTab } from "../messages/messages.js";
import { clearImages, composer, hasImages, notReady, openPreview, withImages } from "../images/images.js";
import { markdown } from "./markdown.js";

const box = $("rooms");
box.innerHTML = `<div class="rlist"></div>
  <div class="rview" hidden>
    <div class="rtop"></div>
    <section class="rbrief"></section>
    <section class="rshelf"></section>
    <div class="rthread"></div>
    <div class="rsend"></div>
  </div>`;
const part = (cls) => box.querySelector(`.${cls}`);
const store = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
const stored = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

let openSlug = stored("hq-room");
let detail = null; // the open room, as /api/rooms/SLUG gave it
let fetching = "";
let stick = true; // the thread opens at its newest message
let sendFor = null; // the room the send box was built for
let briefHidden = stored("hq-room-brief") === "hidden";
const fresh = new Set(); // lanes' messages that were new when shown: tinted until you leave the room
const seenSent = new Map(); // slug -> the rev a "seen" was sent for
// Unsent text per room, its To and the message it replies to; kept across a reload.
const drafts = new Map((() => { try { return JSON.parse(sessionStorage.getItem("hq-room-drafts") || "[]"); } catch { return []; } })());
const keepDrafts = () => { try { sessionStorage.setItem("hq-room-drafts", JSON.stringify([...drafts].filter(([, d]) => d.text || d.reply || d.to))); } catch {} };
addEventListener("pagehide", keepDrafts);
document.addEventListener("visibilitychange", () => { if (document.hidden) keepDrafts(); });
const draft = (slug) => drafts.get(slug) ?? drafts.set(slug, { text: "", to: "", reply: null }).get(slug);
const key = (slug) => `room:${slug}`;

const roomOf = (slug) => (S?.rooms ?? []).find((r) => r.slug === slug) ?? null;
const short = (s, n) => { const t = String(s ?? "").replace(/```[\s\S]*?```/g, "[code]").replace(/\[image: [^\]]+\]/g, "[image]").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
function ago(t) { const m = Math.floor((Date.now() - t) / 60000), h = Math.floor(m / 60); return m < 1 ? "NOW" : h < 1 ? `${m}M AGO` : h < 48 ? `${h}H AGO` : `${Math.floor(h / 24)}D AGO`; }

// ---- lanes: level, status, away ----

function laneInfo(name) {
  if (name === "hq") return { level: "HQ", label: "HQ", color: "#23233a", away: false };
  const l = (S?.lanes ?? []).find((x) => x.name === name);
  if (!l) return { level: "", label: "Not registered", color: "#6a6a82", away: true };
  const [label, color] = STATUS_TEXT[l.status] ?? [l.status, "#6a6a82"];
  // Away as the server decides it: herdr found no agent by this name (a lane can be away with a question open).
  return { level: l.level || "", label: l.herdr === "gone" ? `${label}, agent away` : label, color, away: l.herdr === "gone" };
}
function laneChip(name, role = "") {
  const i = laneInfo(name);
  const sel = name === "hq" ? "" : ` data-select="${esc(name)}"`;
  return `<button class="rlane${i.away ? " away" : ""}" type="button"${sel} title="${esc(`${name}: ${i.label}`)}"><i style="background:${i.color}"></i><b>${esc(name)}</b>${i.level ? `<span class="lv">${esc(i.level.toUpperCase())}</span>` : ""}${role ? `<span class="role">${role}</span>` : ""}${i.away ? `<span class="aw">AWAY</span>` : ""}</button>`;
}

// ---- linked work, with its state on the work board ----

const WS = { stalled: "STALLED", owner: "WAITING ON YOU", ci: "WAITING ON CI", moving: "MOVING", paused: "PAUSED", done: "DONE" };
const WS_ORDER = ["stalled", "owner", "ci", "moving", "paused", "done"];
function work(r) {
  const items = S?.board?.items ?? [];
  return [
    ...r.issues.map((k) => ({ kind: "issue", key: k, item: items.find((i) => i.issue === k) ?? null })),
    ...r.prs.map((k) => { const item = items.find((i) => i.prs.some((p) => p.key === k)) ?? null; return { kind: "pr", key: k, item, pr: item?.prs.find((p) => p.key === k) ?? null }; }),
  ];
}
// The most urgent state among a room's work.
const workState = (r) => WS_ORDER.find((s) => work(r).some((w) => w.item?.state === s)) ?? null;
function issueTag(k) {
  return CONFIG.linearWorkspace ? `<a class="tag key" href="https://linear.app/${esc(CONFIG.linearWorkspace)}/issue/${esc(k)}" target="_blank" rel="noopener">${esc(k)}</a>` : `<span class="tag key">${esc(k)}</span>`;
}
function prTag(k, p) {
  const num = k.split("#").pop(), repo = k.includes("#") ? k.split("#")[0] : CONFIG.githubRepo;
  const mark = !p ? "" : p.state === "MERGED" ? " MERGED" : p.state === "CLOSED" ? " CLOSED" : p.draft ? " DRAFT" : p.ci === "running" ? " CI…" : p.ci === "failed" ? " CI ✗" : p.state === "OPEN" ? " OPEN" : "";
  const cls = `tag pr${p?.state === "MERGED" ? " merged" : p?.draft ? " draft" : ""}`;
  return repo ? `<a class="${cls}" href="https://github.com/${esc(repo)}/pull/${esc(num)}" target="_blank" rel="noopener">#${esc(num)}${mark}</a>` : `<span class="${cls}">#${esc(num)}${mark}</span>`;
}
function workHtml(r, full) {
  return work(r).map((w) => {
    const state = w.item ? `<span class="tag ws ${w.item.state}" title="${esc(w.item.why)}">${WS[w.item.state]}</span>` : full ? `<span class="tag muted">NOT ON THE BOARD</span>` : "";
    // A PR's board state shows only when the room does not link its item's issue (which shows it already).
    // In the list the room's most urgent state stands for all of its work.
    const show = full && (w.kind === "issue" || !(w.item && r.issues.includes(w.item.issue)));
    return `<span class="rwork">${w.kind === "issue" ? issueTag(w.key) : prTag(w.key, w.pr)}${show ? state : ""}</span>`;
  }).join("");
}

// ---- the list ----

function rowHtml(r) {
  const state = workState(r);
  const last = r.last ? `<b>${r.last.who === "owner" ? `YOU → ${esc(r.last.to)}` : esc(r.last.who)}</b> ${esc(r.last.text)}` : `No messages yet${r.artifacts ? ` · ${r.artifacts} on the shelf` : ""}`;
  return `<article class="rrow${r.unread ? " unread" : ""}${r.archivedAt ? " archived" : ""}" data-room="${esc(r.slug)}" tabindex="0" role="button" aria-label="Open room ${esc(r.title)}">
      <div class="meta"><b class="rt">${esc(r.title)}</b>${r.unread ? `<span class="tag new">${r.unread} NEW</span>` : ""}${r.undelivered ? `<span class="tag kept">${r.undelivered} KEPT</span>` : ""}<span class="age">${ago(r.lastAt)}</span></div>
      <div class="people">${laneChip(r.owner, "OWNER")}${r.members.length ? `<span class="plus">+${r.members.length} ${r.members.length === 1 ? "LANE" : "LANES"}</span>` : ""}${state ? `<span class="tag ws ${state}">${WS[state]}</span>` : ""}${workHtml(r, false)}</div>
      <div class="last${r.last ? "" : " none"}">${last}</div>
    </article>`;
}
function renderList() {
  const rooms = S?.rooms ?? [];
  const live = rooms.filter((r) => !r.archivedAt), old = rooms.filter((r) => r.archivedAt);
  const unread = live.filter((r) => r.unread).length;
  setHTML(part("rlist"), rooms.length
    ? `<div class="rsum">${live.length} OPEN ${live.length === 1 ? "ROOM" : "ROOMS"}${unread ? ` · ${unread} WITH NEW MESSAGES` : ""}</div>${live.map(rowHtml).join("")}${old.length ? `<h4>ARCHIVED (${old.length})</h4>${old.map(rowHtml).join("")}` : ""}`
    : `<div class="empty">No rooms yet. HQ opens one for a piece of work with hud room create. Its lane keeps the brief and the artifacts there, and you talk to it here.</div>`);
}

// ---- an open room ----

function renderTop(r) {
  setHTML(part("rtop"), `<div class="rhead"><button class="btn-s back" type="button" data-room-back aria-label="Back to the rooms">◀ ROOMS</button><h3>${esc(r.title)}</h3>${r.archivedAt ? `<span class="tag muted">ARCHIVED</span>` : ""}</div>
    <div class="people">${laneChip(r.owner, "OWNER")}${r.members.map((m) => laneChip(m)).join("")}</div>
    ${r.issues.length || r.prs.length ? `<div class="works">${workHtml(r, true)}</div>` : ""}`);
}

function renderBrief(d) {
  const head = `<div class="k"><span>BRIEF</span>${d?.briefAt ? `<span class="by">${esc(d.briefBy || "")} · ${ago(d.briefAt)}</span>` : ""}<button class="btn-s" type="button" data-brief-toggle aria-expanded="${!briefHidden}">${briefHidden ? "SHOW" : "HIDE"}</button></div>`;
  const body = !d ? "" : d.brief ? `<div class="md">${markdown(d.brief)}</div>` : `<div class="md none">No brief yet. The owning lane pins one with hud room brief ${esc(d.slug)}.</div>`;
  part("rbrief").classList.toggle("folded", briefHidden);
  setHTML(part("rbrief"), head + (briefHidden ? "" : body));
  briefEdge();
}
// A fade at the brief's foot while more of it is below.
function briefEdge() {
  const md = part("rbrief").querySelector(".md");
  if (md) md.classList.toggle("more", md.scrollHeight - md.clientHeight - md.scrollTop > 2);
}

// Pixel icons for the shelf's cards.
const icon = (paths) => `<svg viewBox="0 0 12 12" aria-hidden="true" shape-rendering="crispEdges">${paths}</svg>`;
const ICON = {
  "claude-artifact": icon(`<path d="M5 0h2v3H5zM5 9h2v3H5zM0 5h3v2H0zM9 5h3v2H9zM3 3h2v2H3zM7 3h2v2H7zM3 7h2v2H3zM7 7h2v2H7zM5 5h2v2H5z"/>`),
  link: icon(`<path d="M1 4h2v1H1zM0 5h1v3H0zM1 8h4v1H1zM5 5h1v3H5zM4 4h1v1H4zM6 3h4v1H6zM10 4h1v3h-1zM6 7h4v1H6zM6 4h1v3H6zM3 6h6v1H3z"/>`),
  file: icon(`<path d="M2 0h6v1H2zM8 1h1v1H8zM9 2h1v1H9zM10 3h1v9H10zM1 1h1v11H1zM2 11h8v1H2zM8 2h1v2h2v1H8zM3 5h5v1H3zM3 7h5v1H3zM3 9h4v1H3z"/>`),
};
const LABEL = { "claude-artifact": "CLAUDE ARTIFACT", link: "LINK", file: "FILE", image: "IMAGE" };
function host(u) { try { return new URL(u, location.href).host.replace(/^www\./, ""); } catch { return ""; } }
function cardHtml(a) {
  const meta = `<span class="am">${esc(a.by || "")} · ${ago(a.at)}</span>`;
  if (a.kind === "image") {
    return `<div class="art image"><button type="button" class="aimg" data-art-preview="${a.id}" aria-label="See ${esc(a.title)} full screen"><img src="${esc(a.url)}" alt="" loading="lazy"></button><div class="at" title="${esc(a.title)}">${esc(a.title)}</div><div class="af">${meta}</div></div>`;
  }
  const ext = a.kind === "file" ? (a.url.match(/\.([a-z0-9]{1,8})$/i)?.[1] ?? "").toUpperCase() : "";
  const label = a.kind === "file" ? `${ext || "FILE"} FILE` : a.kind === "link" ? host(a.url) || "LINK" : LABEL[a.kind];
  return `<div class="art ${esc(a.kind)}"><div class="ak">${ICON[a.kind] ?? ICON.link}<span>${esc(label)}</span></div><div class="at" title="${esc(a.title)}">${esc(a.title)}</div><div class="af">${meta}<a class="btn-s open" href="${esc(a.url)}" target="_blank" rel="noopener">OPEN</a></div></div>`;
}
function renderShelf(d) {
  const list = d?.artifactList ?? [];
  setHTML(part("rshelf"), `<div class="k"><span>ARTIFACTS${list.length ? ` (${list.length})` : ""}</span></div>${list.length
    ? `<div class="cards">${[...list].reverse().map(cardHtml).join("")}</div>`
    : `<div class="none">Nothing on the shelf yet. Lanes add Claude artifacts, links, images and files with hud room artifact.</div>`}`);
}

function deliveryHtml(m) {
  if (m.delivery === "sent") return `<span class="seen ok">DELIVERED</span>`;
  if (m.delivery === "away") return `<span class="seen kept" title="Kept: it goes to ${esc(m.to)} when herdr sees the lane again">AWAY · KEPT</span>`;
  if (m.delivery === "failed") return `<span class="seen bad" title="${esc(m.error || "")}">NOT DELIVERED</span><button class="btn-s" type="button" data-room-retry="${m.id}">RETRY</button>`;
  return `<span class="seen">SENDING…</span>`;
}
function messageHtml(m, byId, live) {
  const lane = m.who !== "owner";
  const p = m.reply ? byId.get(m.reply) : null;
  const quote = p ? `<div class="quote">↩ ${p.who === "owner" ? "you" : esc(p.who)} ${clock(p.at)}: ${esc(short(p.text, 80))}</div>` : m.reply ? `<div class="quote">↩ an earlier message</div>` : "";
  const text = m.text.includes("```") ? renderBody(m.text) : clipText(m.text, `room${m.id}`);
  return `<article class="msg ${lane ? "lane" : "you"}${lane && (!m.read || fresh.has(m.id)) ? " unread" : ""}" data-rmsg="${m.id}">
      <div class="meta"><span class="who">${lane ? esc(m.who) : "YOU"}</span>${lane ? "" : `<span class="to">→ ${esc(m.to)}</span>`}<span class="tag">${clock(m.at)}</span>${lane ? "" : deliveryHtml(m)}${lane && live ? `<button class="btn-s" type="button" data-room-reply="${m.id}">REPLY</button>` : ""}</div>
      ${quote}<div class="text">${text}</div>
    </article>`;
}
function renderThread(d, r) {
  const el = part("rthread");
  if (!d) { setHTML(el, `<div class="empty">LOADING…</div>`); return; }
  for (const m of d.messages) if (m.who !== "owner" && !m.read) fresh.add(m.id);
  const byId = new Map(d.messages.map((m) => [m.id, m]));
  const html = (d.earlier ? `<div class="earlier">${d.earlier} EARLIER ${d.earlier === 1 ? "MESSAGE" : "MESSAGES"} NOT SHOWN</div>` : "")
    + (d.messages.map((m) => messageHtml(m, byId, !r.archivedAt)).join("") || `<div class="empty">No messages yet. Write to ${esc(r.owner)} below: it is typed into the lane, and its reply lands here.</div>`);
  // At the newest message (just opened, or within 40px of it), stay on it; reading older ones, what you read stays put.
  const pinned = stick || el.scrollHeight - el.scrollTop - el.clientHeight < 40, place = pinned ? null : keepScroll(el, "data-rmsg");
  setHTML(el, html);
  if (pinned) el.scrollTop = el.scrollHeight; else place();
  atEnd = pinned || el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  stick = false;
  showEdges(el);
}

const lanesOf = (r) => [r.owner, ...r.members];
function renderSend(r) {
  const el = part("rsend");
  const d = draft(r.slug);
  if (!lanesOf(r).includes(d.to)) d.to = r.owner;
  if (r.archivedAt) {
    sendFor = null;
    setHTML(el, `<div class="none">This room is archived. HQ reopens it with hud room create ${esc(r.slug)}.</div>`);
    return;
  }
  const options = lanesOf(r).map((n) => `<option value="${esc(n)}"${n === d.to ? " selected" : ""}>${esc(n)}${n === r.owner ? " (owner)" : ""}${laneInfo(n).away ? " · away" : ""}</option>`).join("");
  if (sendFor !== r.slug) {
    sendFor = r.slug;
    el.innerHTML = `<div class="rto"><label>TO <select data-room-to aria-label="Send to">${options}</select></label><span class="tostate"></span></div>
      <div class="rquote"></div>
      ${composer(key(r.slug), `<textarea rows="1" placeholder="Write to the lane. ⌘↩ sends.">${esc(d.text)}</textarea>`, `<button class="send go" type="button" data-room-send>SEND</button>`)}`;
  } else {
    const sel = el.querySelector("[data-room-to]");
    if (sel.innerHTML !== options) { sel.innerHTML = options; sel.value = d.to; }
  }
  const away = laneInfo(d.to).away;
  setHTML(el.querySelector(".tostate"), away ? `<span class="aw">AWAY</span> kept until the lane is back` : `typed into ${esc(d.to)}`);
  const p = d.reply && detail?.messages.find((m) => m.id === d.reply);
  setHTML(el.querySelector(".rquote"), p ? `<span>↩ ${esc(p.who)} ${clock(p.at)}: ${esc(short(p.text, 70))}</span><button class="btn-s" type="button" data-room-unreply aria-label="Do not reply to it">×</button>` : "");
  sendState();
}
function sendState() {
  const btn = part("rsend").querySelector("[data-room-send]");
  if (btn && openSlug) btn.disabled = !draft(openSlug).text.trim() && !hasImages(key(openSlug));
}

function renderRoom() {
  const r = roomOf(openSlug);
  if (!r) { closeRoom(); return; }
  const d = detail?.slug === r.slug ? detail : null;
  renderTop(r);
  renderBrief(d);
  renderShelf(d);
  renderThread(d, r);
  renderSend(r);
  // Seen: its lanes' messages stop counting as new (the tint stays until you leave the room).
  if (d && r.unread && seenSent.get(r.slug) !== r.rev && document.visibilityState === "visible") {
    seenSent.set(r.slug, r.rev);
    post(`/api/rooms/${encodeURIComponent(r.slug)}/seen`, {}).catch(() => seenSent.delete(r.slug));
  }
}

async function fetchRoom(slug) {
  const r = roomOf(slug);
  if (!r || (detail?.slug === slug && detail.rev === r.rev)) return;
  const want = `${slug}@${r.rev}`;
  if (fetching === want) return;
  fetching = want;
  try {
    const res = await fetch(`/api/rooms/${encodeURIComponent(slug)}`);
    if (res.ok && openSlug === slug) { detail = await res.json(); if (qTab === "rooms") renderRoom(); }
  } catch {} finally { if (fetching === want) fetching = ""; }
}

function render() {
  renderCount();
  if (qTab !== "rooms" || !S) return;
  const r = openSlug && roomOf(openSlug);
  part("rlist").hidden = !!r;
  part("rview").hidden = !r;
  box.classList.toggle("inroom", !!r);
  if (!r) { renderList(); return; }
  renderRoom();
  fetchRoom(r.slug);
}
function renderCount() {
  const n = (S?.rooms ?? []).filter((r) => !r.archivedAt && r.unread).length, t = $("qtRooms");
  t.hidden = !n;
  t.textContent = n;
  t.title = `${n} ${n === 1 ? "room has" : "rooms have"} new messages`;
}

function openRoom(slug) {
  if (openSlug !== slug) { detail = null; fresh.clear(); }
  openSlug = slug;
  store("hq-room", slug);
  stick = true;
  sendFor = null;
  render();
  if (phone()) box.scrollIntoView({ block: "start" });
}
function closeRoom() {
  openSlug = null;
  detail = null;
  sendFor = null;
  fresh.clear();
  store("hq-room", null);
  part("rview").hidden = true;
  part("rlist").hidden = false;
  box.classList.remove("inroom");
  if (qTab === "rooms") renderList();
}

async function send(btn) {
  const slug = openSlug, d = draft(slug), k = key(slug);
  const text = withImages(k, d.text.trim());
  if (!text) return;
  const wait = notReady(k);
  if (wait) { toast(wait); return; }
  btn.disabled = true;
  try {
    await post(`/api/rooms/${encodeURIComponent(slug)}/post`, { text, to: d.to, reply: d.reply });
    toast(laneInfo(d.to).away ? `KEPT FOR ${d.to.toUpperCase()}: IT IS AWAY.` : `SENT TO ${d.to.toUpperCase()}.`);
    d.text = "";
    d.reply = null;
    clearImages(k);
    const ta = part("rsend").querySelector("textarea");
    if (ta) ta.value = "";
    stick = true;
    renderSend(roomOf(slug));
  } catch (err) { toast(err.message); btn.disabled = false; }
}

box.addEventListener("click", (e) => {
  const t = e.target;
  if (t.closest("[data-select]") || t.closest("a")) return; // a lane chip selects its worker; a link opens
  const row = t.closest("[data-room]");
  if (row) { openRoom(row.dataset.room); return; }
  if (t.closest("[data-room-back]")) { closeRoom(); return; }
  if (t.closest("[data-brief-toggle]")) {
    briefHidden = !briefHidden;
    store("hq-room-brief", briefHidden ? "hidden" : null);
    renderBrief(detail);
    return;
  }
  const art = t.closest("[data-art-preview]");
  if (art) { const a = detail?.artifactList.find((x) => String(x.id) === art.dataset.artPreview); if (a) openPreview(a.url, a.title); return; }
  const reply = t.closest("[data-room-reply]");
  if (reply) {
    const m = detail?.messages.find((x) => String(x.id) === reply.dataset.roomReply), d = draft(openSlug);
    if (m) { d.reply = m.id; if (lanesOf(roomOf(openSlug)).includes(m.who)) d.to = m.who; }
    renderSend(roomOf(openSlug));
    part("rsend").querySelector("textarea")?.focus();
    return;
  }
  if (t.closest("[data-room-unreply]")) { draft(openSlug).reply = null; renderSend(roomOf(openSlug)); return; }
  const retry = t.closest("[data-room-retry]");
  if (retry) { retry.disabled = true; post(`/api/rooms/${encodeURIComponent(openSlug)}/messages/${retry.dataset.roomRetry}/retry`, {}).catch((err) => { toast(err.message); retry.disabled = false; }); return; }
  const go = t.closest("[data-room-send]");
  if (go) { send(go); return; }
  // MORE / LESS on a long message: core/clicks.js flips it after this handler; draw the thread once it has.
  if (t.closest(".more[data-more]")) setTimeout(() => detail && renderThread(detail, roomOf(openSlug)), 0);
});
box.addEventListener("keydown", (e) => {
  const row = e.target.closest?.("[data-room]");
  if (row && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openRoom(row.dataset.room); return; }
  if (!e.target.closest?.(".rsend")) return;
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) part("rsend").querySelector("[data-room-send]")?.click();
  if (e.key === "Escape" && openSlug && draft(openSlug).reply) { draft(openSlug).reply = null; renderSend(roomOf(openSlug)); }
});
box.addEventListener("input", (e) => {
  if (e.target.tagName !== "TEXTAREA" || !openSlug || !e.target.closest(".rsend")) return;
  draft(openSlug).text = e.target.value;
  sendState();
});
box.addEventListener("change", (e) => {
  if (!e.target.matches("[data-room-to]") || !openSlug) return;
  draft(openSlug).to = e.target.value;
  renderSend(roomOf(openSlug));
});
// At the thread's end it stays there while the room settles around it (fonts, the brief, an image in a message).
let atEnd = true;
const thread = part("rthread");
const toEnd = () => { if (atEnd && !thread.hidden) thread.scrollTop = thread.scrollHeight; };
thread.addEventListener("scroll", () => { atEnd = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 40; showEdges(thread); }, { passive: true });
thread.addEventListener("load", toEnd, true);
new ResizeObserver(toEnd).observe(thread);
part("rbrief").addEventListener("scroll", briefEdge, { passive: true, capture: true });
addEventListener("resize", briefEdge);
on("attach", (k) => { if (openSlug && k === key(openSlug)) sendState(); });
on("state", render);
on("qtab", (t) => { if (t === "rooms") { stick = true; render(); } else fresh.clear(); });
