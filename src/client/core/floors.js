// Floors and the scope, as pure functions of S (the last /api/state): which floors there are, which lane is on which,
// what a scope lets through, and the counts and lines every panel shows for it. No DOM, so `bun test` imports it.
// A floor is a lane that directs leads (src/lane-tree.ts decides which; the state's lanes carry `floor` and `heads`).

export const HQ = "hq";
// In order, from HQ's floor on; they repeat after five. The colours belong to the page, not the server.
export const FLOOR_COLORS = ["#3c6fd6", "#2f9e57", "#c07a12", "#b8327a", "#7a4fc9"];

const lanesOf = (S) => S?.lanes ?? [];
const floorOf = (l) => l.floor ?? HQ;

// The floor a module copy belongs to, from its URL or path: /floor/<id>/src/client/... is <id>, anything else is HQ's.
export function floorFromPath(url) {
  let path = String(url ?? "");
  try { path = new URL(path, "http://page.invalid").pathname; } catch {}
  const m = path.match(/^\/floor\/([^/]+)\//);
  if (!m) return HQ;
  try { return decodeURIComponent(m[1]) || HQ; } catch { return m[1]; }
}
// HQ's floor draws on the page's own canvas; every other floor on its own.
export const canvasId = (floor) => (!floor || floor === HQ ? "room" : `room-${floor}`);

// HQ's floor first, then the others by name.
export function floorList(S) {
  const heads = lanesOf(S).filter((l) => l.heads).map((l) => l.name).sort((a, b) => a.localeCompare(b));
  return [HQ, ...heads].map((id, i) => ({ id, label: id === HQ ? "HQ" : id.toUpperCase(), color: FLOOR_COLORS[i % FLOOR_COLORS.length] }));
}
export const hasLane = (S, name) => !!name && lanesOf(S).some((l) => l.name === name);
// A lane that is gone, or none, is on HQ's floor.
export function floorOfLane(S, name) {
  const l = name ? lanesOf(S).find((x) => x.name === name) : null;
  return l ? floorOf(l) : HQ;
}
// The workers of a floor: its lanes except its head, who is the figure at the terminal.
export const floorLanes = (S, floor) => lanesOf(S).filter((l) => floorOf(l) === floor && !l.heads);
// The terminal's label, cut as a worker's name is (room/loop.js).
export function terminalName(S, floor) {
  if (!floor || floor === HQ) return "HQ";
  const name = floor.toUpperCase();
  return name.length > 14 ? name.slice(0, 13) + "…" : name;
}
export const floorTagShown = (S) => floorList(S).length >= 2;
// Tell HQ goes to HQ in every scope, until other generals exist on the server.
export const tellRecipient = () => "HQ";

// What the lists filter by: nothing under SHOW ALL.
export const viewOf = (scope) => (scope.all ? { floor: null, agent: null } : { floor: scope.floor, agent: scope.agent });
// An item with a `lane` (an ask, an update) is in scope when it is the agent's, or on the floor. No lane is HQ's floor.
export function inScope(S, item, view) {
  if (!view || (!view.floor && !view.agent)) return true;
  if (view.agent) return (item.lane ?? null) === view.agent;
  return floorOfLane(S, item.lane) === view.floor;
}

const WAIT_ON_HQ = ["hq_turn", "stale", "gone"];
// Every number the top bar and the tabs show. Unscoped, these are today's numbers.
export function counts(S, view) {
  const scoped = !!(view && (view.floor || view.agent));
  const open = S.open.filter((a) => inScope(S, a, view));
  const lanes = lanesOf(S).filter((l) => inScope(S, { lane: l.name }, view));
  const by = S.updatesUnreadByLane;
  const unread = !scoped || !by ? S.updatesUnread ?? 0 : Object.entries(by).reduce((n, [lane, c]) => n + (inScope(S, { lane: lane || null }, view) ? c : 0), 0);
  return {
    waiting: open.length,
    oldest: open.length ? Math.min(...open.map((a) => a.created_at)) : null,
    working: lanes.filter((l) => l.status === "moving").length,
    live: lanes.filter((l) => !["done", "parked"].includes(l.status)).length,
    onHq: lanes.filter((l) => WAIT_ON_HQ.includes(l.status)).length,
    unread,
    otherWaiting: S.open.length - open.length,
    otherUnread: (S.updatesUnread ?? 0) - unread,
  };
}

// The chip's words, or "" when nothing is scoped or SHOW ALL is on. The floor is named only with two or more floors.
export function chipText(S, scope) {
  if (scope.all || (!scope.floor && !scope.agent)) return "";
  const floor = scope.floor && `${floorList(S).find((f) => f.id === scope.floor)?.label ?? scope.floor.toUpperCase()} FLOOR`;
  return [floor, scope.agent].filter(Boolean).join(" › ") + " ✕";
}
const target = (S, scope) => chipText(S, { ...scope, all: false }).replace(/ ✕$/, "").split(" › ").pop();
// The first line of a scoped list: how many are left out and the way to see them (`tail`, SHOW ALL by default); or,
// with SHOW ALL on, the way back. "" when nothing is hidden.
export function othersLine(S, scope, hidden, tail = "SHOW ALL") {
  if (scope.all) {
    if (!scope.floor && !scope.agent) return "";
    return `${floorList(S).length > 1 ? "ALL FLOORS" : "ALL AGENTS"} · ONLY ${target(S, scope)}`;
  }
  if (!hidden || (!scope.floor && !scope.agent)) return "";
  return `+${hidden} ${scope.agent ? "FROM OTHER AGENTS" : "ON OTHER FLOORS"} · ${tail}`;
}
// What an empty scoped list says.
export const nothingLine = (S, scope) => (scope.all || (!scope.floor && !scope.agent) ? "" : `NOTHING FROM ${target(S, scope)} WAITS ON YOU`);

// How much a lane needs the owner or HQ, worst first: blocked > waiting on you > stalled > waiting on HQ.
const HELP = { blocked: "blocked", needs_you: "waiting", stale: "stalled", hq_turn: "hq" };
export const helpState = (lane) => HELP[lane.status] ?? null;
const HELP_ORDER = ["blocked", "waiting", "stalled", "hq"];
// The lanes in scope that need help, worst first, then by name.
export function needHelp(S, view) {
  return lanesOf(S)
    .filter((l) => !l.heads && helpState(l) && inScope(S, { lane: l.name }, view))
    .sort((a, b) => HELP_ORDER.indexOf(helpState(a)) - HELP_ORDER.indexOf(helpState(b)) || a.name.localeCompare(b.name))
    .map((l) => ({ lane: l.name, state: helpState(l) }));
}
// The NEED HELP strip: a count, its rows, and whether it can be pressed. Nobody needing help is disabled with no rows.
export function helpStrip(S, view) {
  const rows = needHelp(S, view);
  return { count: rows.length, rows, disabled: !rows.length };
}

// A scope that still holds: a lane that is gone drops the agent, a floor that is gone zooms out, an agent's floor is
// where the agent is, and one floor has no floor scope. SHOW ALL means nothing with nothing scoped.
export function normalizeScope(S, scope) {
  const floors = floorList(S).map((f) => f.id);
  let { floor, agent, all } = scope;
  if (agent && !hasLane(S, agent)) agent = null;
  if (agent) floor = floors.length >= 2 ? floorOfLane(S, agent) : null;
  else if (!floors.includes(floor) || floors.length < 2) floor = null;
  return { floor, agent, all: !!all && !!(floor || agent) };
}

// Opening MESSAGES marks only the shown updates in scope as read.
export const marksRead = (S, view) => (S.updates ?? []).filter((u) => !u.read_at && inScope(S, u, view)).map((u) => u.id);
// The body of MARK ALL READ: empty unscoped, which marks everything.
export function readAllBody(view) {
  const body = {};
  if (view?.floor) body.floor = view.floor;
  if (view?.agent) body.lane = view.agent;
  return body;
}

// What Escape does: step the scope out one level ("out"), or leave the key alone (null) when nothing is scoped or
// something else owns it: a conference room on the stage, SETTINGS or a dialog, a text field.
export function escapeAction(scope, busy) {
  if (busy.stage || busy.settings || busy.dialog || busy.typing) return null;
  return scope.floor || scope.agent ? "out" : null;
}
// Where choosing a lane with `jump` takes the question panel: the lane's first open question, or null.
export const jumpAsk = (S, lane) => (hasLane(S, lane) ? S.open.find((a) => a.lane === lane) ?? null : null);
