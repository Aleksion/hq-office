// HQ Office: the HQ's one-stop shop for lanes, and the human's question panel.
// One Bun process, one SQLite file, one page. Binds to localhost only.
import { Database } from "bun:sqlite";
import { mkdirSync, statSync, watch } from "node:fs";

const DIR = import.meta.dir;
// Data (database, uploads) lives beside the code unless HUD_DATA_DIR says otherwise.
const DATA = process.env.HUD_DATA_DIR ?? DIR;
const UPLOADS = `${DATA}/uploads`;
const IMAGE_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };
const MAX_UPLOAD = 10 * 1024 * 1024;
mkdirSync(UPLOADS, { recursive: true });
const PORT = Number(process.env.HUD_PORT ?? 4747);
const HOST = process.env.HUD_HOST ?? "127.0.0.1";
const HERDR = process.env.HERDR_BIN ?? "herdr";
const LOCAL = process.env.HUD_LOCAL_MACHINE ?? "local";
const MACHINES = (process.env.HUD_MACHINES ?? LOCAL).split(",").map((m) => m.trim()).filter(Boolean);
// Shown on the page: the room's sign, and links from lanes to GitHub and Linear. Empty means no link.
const CONFIG = {
  owner: process.env.HUD_OWNER ?? "",
  githubRepo: process.env.HUD_GITHUB_REPO ?? "",
  linearWorkspace: process.env.HUD_LINEAR_WORKSPACE ?? "",
};
const SYNC_MS = 20_000;
const STALE_MS = 15 * 60_000;

const db = new Database(`${DATA}/hud.db`, { create: true });
db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS lanes (
  name TEXT PRIMARY KEY,
  title TEXT,
  machine TEXT,
  pane TEXT,
  agent TEXT,
  herdr TEXT,
  herdr_since INTEGER,
  herdr_seen INTEGER,
  issue TEXT,
  pr TEXT,
  phase TEXT NOT NULL DEFAULT 'running',
  note TEXT,
  updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS asks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lane TEXT,
  kind TEXT NOT NULL DEFAULT 'decision',
  title TEXT NOT NULL,
  body TEXT,
  options TEXT,
  recommended TEXT,
  link TEXT,
  due INTEGER,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  answer TEXT,
  answered_at INTEGER,
  acked_at INTEGER
);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  text TEXT NOT NULL,
  acked_at INTEGER
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  lane TEXT,
  who TEXT NOT NULL,
  text TEXT NOT NULL
);
`);

type Lane = Record<string, any>;
type Ask = Record<string, any>;

let version = 1;
const listeners = new Set<() => void>();
function bump() {
  version++;
  for (const fn of [...listeners]) fn();
}

function event(who: string, text: string, lane?: string | null) {
  db.query("INSERT INTO events (at, lane, who, text) VALUES (?, ?, ?, ?)").run(Date.now(), lane ?? null, who, text);
}

// ---- herdr sync: which lanes are live, idle or gone ----

let untracked: { name: string; machine: string; status: string }[] = [];
let lastSync: { at: number; errors: string[] } = { at: 0, errors: [] };

async function herdrList(machine: string): Promise<any[]> {
  const args = machine === LOCAL ? [HERDR, "agent", "list"] : [HERDR, "--machine", machine, "agent", "list"];
  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => proc.kill(), 15_000);
  const out = await new Response(proc.stdout).text();
  clearTimeout(timer);
  await proc.exited;
  return JSON.parse(out).result.agents;
}

async function syncHerdr() {
  const errors: string[] = [];
  const seen = new Map<string, { machine: string; agent: any }>();
  await Promise.all(
    MACHINES.map(async (machine) => {
      try {
        for (const agent of await herdrList(machine)) {
          if (agent.name) seen.set(agent.name, { machine, agent });
        }
      } catch (e) {
        errors.push(`${machine}: ${(e as Error).message}`);
      }
    }),
  );
  const now = Date.now();
  const lanes = db.query("SELECT * FROM lanes").all() as Lane[];
  const known = new Set(lanes.map((l) => l.name));
  let changed = false;
  for (const lane of lanes) {
    const hit = seen.get(lane.name);
    if (!hit) {
      // Only call a lane gone when its machine answered.
      const machineAnswered = !errors.some((e) => e.startsWith(`${lane.machine}:`));
      if (machineAnswered && lane.herdr !== "gone") {
        db.query("UPDATE lanes SET herdr = 'gone', herdr_since = ? WHERE name = ?").run(now, lane.name);
        changed = true;
      }
      continue;
    }
    const status = hit.agent.agent_status as string;
    if (status !== lane.herdr || hit.agent.pane_id !== lane.pane || hit.machine !== lane.machine) {
      db.query(
        "UPDATE lanes SET herdr = ?, herdr_since = CASE WHEN herdr = ? THEN herdr_since ELSE ? END, pane = ?, machine = ?, agent = ? WHERE name = ?",
      ).run(status, status, now, hit.agent.pane_id, hit.machine, hit.agent.agent, lane.name);
      changed = true;
    }
    db.query("UPDATE lanes SET herdr_seen = ? WHERE name = ?").run(now, lane.name);
  }
  untracked = [...seen.entries()]
    .filter(([name]) => !known.has(name))
    .map(([name, { machine, agent }]) => ({ name, machine, status: agent.agent_status }));
  lastSync = { at: now, errors };
  if (changed) bump();
}

// ---- derived view ----

function laneStatus(lane: Lane, openByLane: Map<string, number>, now: number): string {
  if (openByLane.get(lane.name)) return "needs_you";
  if (lane.phase === "done" || lane.phase === "parked") return lane.phase;
  if (lane.phase === "waiting") return "waiting";
  if (lane.herdr === "working") return "moving";
  if (lane.herdr === "gone") return "gone";
  if (lane.herdr_since && now - lane.herdr_since > STALE_MS) return "stale";
  return "hq_turn";
}

function startOfDay(now: number) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// The game: a daily bank of 1000. Every minute an ask waits past a
// 5-minute grace costs one point; an answer inside 10 minutes earns 20.
function score(now: number) {
  const asks = db
    .query("SELECT created_at, answered_at, status FROM asks WHERE status != 'withdrawn' AND (created_at >= ? OR status = 'open' OR answered_at >= ?)")
    .all(startOfDay(now), startOfDay(now)) as Ask[];
  let lost = 0;
  let bonus = 0;
  let fast = 0;
  for (const a of asks) {
    const from = Math.max(a.created_at, startOfDay(now));
    const to = a.answered_at ?? now;
    lost += Math.max(0, Math.floor((to - from) / 60_000) - 5);
    if (a.answered_at && a.answered_at - a.created_at <= 10 * 60_000) {
      bonus += 20;
      fast++;
    }
  }
  const open = asks.filter((a) => a.status === "open").length;
  return { bank: 1000 - lost + bonus, lost, bonus, fast, burnPerMin: open };
}

function state() {
  const now = Date.now();
  const lanes = db.query("SELECT * FROM lanes ORDER BY name").all() as Lane[];
  const open = db.query("SELECT * FROM asks WHERE status = 'open' ORDER BY COALESCE(due, 9e15), created_at").all() as Ask[];
  const answered = db
    .query("SELECT * FROM asks WHERE status != 'open' AND COALESCE(answered_at, created_at) >= ? ORDER BY answered_at DESC LIMIT 40")
    .all(now - 24 * 3600_000) as Ask[];
  const openByLane = new Map<string, number>();
  for (const a of open) if (a.lane) openByLane.set(a.lane, (openByLane.get(a.lane) ?? 0) + 1);
  const parse = (a: Ask) => ({ ...a, options: a.options ? JSON.parse(a.options) : [] });
  return {
    now,
    version,
    lanes: lanes.map((l) => ({ ...l, status: laneStatus(l, openByLane, now) })),
    open: open.map(parse),
    answered: answered.map(parse),
    notes: db.query("SELECT * FROM notes ORDER BY at DESC LIMIT 20").all(),
    events: db.query("SELECT * FROM events ORDER BY at DESC LIMIT 60").all(),
    score: score(now),
    untracked,
    sync: lastSync,
    page: pageStamp(),
    config: CONFIG,
  };
}

// The page reloads itself when index.html changes: its mtime rides on every state, and the watcher pushes one out.
function pageStamp() {
  try {
    return statSync(`${DIR}/index.html`).mtimeMs;
  } catch {
    return 0;
  }
}

function inbox() {
  return {
    answers: (db.query("SELECT * FROM asks WHERE status = 'answered' AND acked_at IS NULL ORDER BY answered_at").all() as Ask[]).map((a) => ({
      ...a,
      options: a.options ? JSON.parse(a.options) : [],
    })),
    notes: db.query("SELECT * FROM notes WHERE acked_at IS NULL ORDER BY at").all(),
  };
}

// ---- writes ----

const LANE_FIELDS = ["title", "machine", "pane", "issue", "pr", "phase", "note"] as const;

function upsertLane(body: any) {
  if (!body.name) throw new Error("name is required");
  const now = Date.now();
  db.query("INSERT INTO lanes (name, updated_at) VALUES (?, ?) ON CONFLICT(name) DO NOTHING").run(body.name, now);
  for (const f of LANE_FIELDS) {
    if (body[f] !== undefined) db.query(`UPDATE lanes SET ${f} = ?, updated_at = ? WHERE name = ?`).run(body[f] === "" ? null : body[f], now, body.name);
  }
  if (body.note || body.phase) event("hq", [body.phase && `phase ${body.phase}`, body.note].filter(Boolean).join(": "), body.name);
}

function createAsk(body: any) {
  if (!body.title) throw new Error("title is required");
  const res = db
    .query("INSERT INTO asks (lane, kind, title, body, options, recommended, link, due, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(
      body.lane ?? null,
      body.kind ?? "decision",
      body.title,
      body.body ?? null,
      body.options?.length ? JSON.stringify(body.options) : null,
      body.recommended ?? null,
      body.link ?? null,
      body.due ?? null,
      body.created_at ?? Date.now(),
    );
  event("hq", `asked: ${body.title}`, body.lane);
  return Number(res.lastInsertRowid);
}

function answerAsk(id: number, answer: string) {
  const ask = db.query("SELECT * FROM asks WHERE id = ?").get(id) as Ask | null;
  if (!ask) throw new Error(`no ask ${id}`);
  if (ask.status !== "open") throw new Error(`ask ${id} is already ${ask.status}`);
  db.query("UPDATE asks SET status = 'answered', answer = ?, answered_at = ? WHERE id = ?").run(answer, Date.now(), id);
  event("nico", `answered "${ask.title}": ${answer}`, ask.lane);
  notifyHq(`HUD answer #${id}${ask.lane ? ` (${ask.lane})` : ""}: "${ask.title}" -> ${answer}`);
}

// Nico's answers reach HQ the moment he sends them: typed into HQ's session.
const HQ_AGENT = process.env.HUD_HQ_AGENT ?? "hq";
function notifyHq(text: string) {
  const proc = Bun.spawn([HERDR, "agent", "prompt", HQ_AGENT, text], { stdout: "ignore", stderr: "pipe" });
  proc.exited.then(async (code) => {
    if (code !== 0) event("hud", `could not reach HQ: ${(await new Response(proc.stderr).text()).trim() || `exit ${code}`}`);
  });
}

// ---- http ----

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

async function waitForInbox(timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const box = inbox();
    if (box.answers.length || box.notes.length) return box;
    await new Promise<void>((resolve) => {
      const done = () => {
        listeners.delete(done);
        clearTimeout(t);
        resolve();
      };
      const t = setTimeout(done, deadline - Date.now());
      listeners.add(done);
    });
  }
  return inbox();
}

const page = Bun.file(`${DIR}/index.html`);
watch(DIR, (_event, file) => {
  if (file === "index.html") bump();
});

Bun.serve({
  port: PORT,
  hostname: HOST,
  idleTimeout: 255,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    try {
      if (req.method === "GET") {
        if (path === "/") return new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } });
        if (path.startsWith("/uploads/")) {
          const name = decodeURIComponent(path.slice("/uploads/".length));
          if (!/^[\w.-]+$/.test(name)) return json({ error: "not found" }, 404);
          const file = Bun.file(`${UPLOADS}/${name}`);
          return (await file.exists()) ? new Response(file) : json({ error: "not found" }, 404);
        }
        if (path === "/api/state") return json(state());
        if (path === "/api/inbox") return json(inbox());
        if (path === "/api/wait") return json(await waitForInbox(Math.min(Number(url.searchParams.get("s") ?? 240), 240) * 1000));
        if (path === "/api/stream") {
          let cleanup = () => {};
          const stream = new ReadableStream({
            start(controller) {
              const enc = new TextEncoder();
              const send = () => controller.enqueue(enc.encode(`data: ${version}\n\n`));
              const ping = setInterval(() => controller.enqueue(enc.encode(`: ping\n\n`)), 25_000);
              listeners.add(send);
              send();
              cleanup = () => {
                listeners.delete(send);
                clearInterval(ping);
              };
            },
            cancel() {
              cleanup();
            },
          });
          return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } });
        }
        return json({ error: "not found" }, 404);
      }

      // Writes need a custom header: a browser page on another origin cannot
      // send one without a CORS preflight, which this server never grants.
      if (req.method !== "POST" || req.headers.get("x-hud") !== "1") return json({ error: "forbidden" }, 403);
      // Images travel as raw bytes, so this route reads the body itself before the JSON parse below.
      if (path === "/api/uploads") {
        const ext = IMAGE_EXT[req.headers.get("content-type") ?? ""];
        if (!ext) throw new Error("only png, jpeg, gif or webp images");
        const bytes = await req.arrayBuffer();
        if (bytes.byteLength > MAX_UPLOAD) throw new Error("image is over 10 MB");
        const stem = (url.searchParams.get("name") ?? "image").replace(/\.[^.]*$/, "").replace(/[^\w-]+/g, "-").slice(0, 40) || "image";
        const name = `${Date.now()}-${stem}.${ext}`;
        await Bun.write(`${UPLOADS}/${name}`, bytes);
        return json({ path: `${UPLOADS}/${name}`, url: `/uploads/${name}` });
      }
      const body = await req.json().catch(() => ({}));
      let m: RegExpMatchArray | null;
      let result: unknown = { ok: true };
      if (path === "/api/lanes") upsertLane(body);
      else if (path === "/api/lanes/delete") {
        db.query("DELETE FROM lanes WHERE name = ?").run(body.name);
        event("hq", "removed from the board", body.name);
      } else if (path === "/api/asks") result = { id: createAsk(body) };
      else if ((m = path.match(/^\/api\/asks\/(\d+)\/answer$/))) answerAsk(Number(m[1]), String(body.answer ?? "").trim() || "done");
      else if ((m = path.match(/^\/api\/asks\/(\d+)\/withdraw$/))) {
        db.query("UPDATE asks SET status = 'withdrawn', answer = ?, answered_at = ?, acked_at = ? WHERE id = ? AND status = 'open'").run(
          body.reason ?? "withdrawn by HQ",
          Date.now(),
          Date.now(),
          Number(m[1]),
        );
        event("hq", `withdrew ask #${m[1]}${body.reason ? `: ${body.reason}` : ""}`);
      } else if ((m = path.match(/^\/api\/asks\/(\d+)\/ack$/))) db.query("UPDATE asks SET acked_at = ? WHERE id = ?").run(Date.now(), Number(m[1]));
      else if (path === "/api/notes") {
        if (!String(body.text ?? "").trim()) throw new Error("text is required");
        db.query("INSERT INTO notes (at, text) VALUES (?, ?)").run(Date.now(), String(body.text).trim());
        event("nico", `told HQ: ${String(body.text).trim()}`);
        notifyHq(`HUD note from Nico: ${String(body.text).trim()}`);
      } else if ((m = path.match(/^\/api\/notes\/(\d+)\/ack$/))) db.query("UPDATE notes SET acked_at = ? WHERE id = ?").run(Date.now(), Number(m[1]));
      else if (path === "/api/events") event(body.who ?? "hq", String(body.text ?? ""), body.lane);
      else if (path === "/api/sync") await syncHerdr();
      else return json({ error: "not found" }, 404);
      bump();
      return json(result);
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }
  },
});

syncHerdr();
setInterval(syncHerdr, SYNC_MS);
// Timers on the page tick on their own; this keeps stale detection fresh.
setInterval(bump, 60_000);
console.log(`HQ command centre on http://${HOST}:${PORT}`);
