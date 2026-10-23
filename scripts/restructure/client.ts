// The plan for the page's script: which top-level statement goes to which module under src/client.
import ts from "typescript";
import { emit } from "./emit.ts";
import { type Analysis, checkOrder, comment, cut, dedent, link, parse, type Piece, slug, subPiece } from "./split.ts";

// Every top-level name the page declared when this plan was written, by module. A statement that declares nothing
// (a call, a listener) goes with the statement above it. A name not listed here goes with the statement above it
// too, unless it opens a section of its own (see SECTIONS).
const NAMES: Record<string, string[]> = {
  "core/dom.js": ["$", "toast"],
  "core/state.js": ["S", "CONFIG"],
  "core/status.js": ["STATUS_TEXT"],
  "core/format.js": ["esc", "dur", "clock", "hash"],
  "core/text.js": ["linkify", "LONG", "expanded", "clipText", "renderBody", "copyCode"],
  "core/net.js": ["post"],
  "core/boot.js": ["first", "pageStamp", "load", "connect"],
  "room/canvas.js": ["TS", "SC", "W", "H", "cv", "ctx", "px", "ART", "artIds", "artNext", "artId", "bake", "blit"],
  "room/sprites.js": ["HEAD_FRONT", "HEAD_BACK", "BODY_FRONT", "LEGS_FRONT", "HEAD_SIDE", "BODY_SIDE", "LEGS_SIDE", "HEADS", "mirrored", "frame", "drawSprite"],
  "room/palette.js": ["HAIR", "SHIRT", "SKIN", "PANTS", "ACCENT", "shade", "palette", "HERO", "HEROES", "HQBOT"],
  "settings/prefs.js": ["DEFAULTS", "settings", "saveSettings", "heroIndex", "hero"],
  "room/seasons.js": ["EVENTS", "SEASONS", "SEASON_OVERRIDE", "seasonNow", "chosenSeason", "season", "snowy"],
  "room/accessory-table.js": ["ACCESSORIES"],
  "room/accessories.js": ["COATS", "fits", "wornCache", "wornBy", "drawAccessories", "paintAccessories"],
  "room/weather.js": ["CANOPY", "FALL_LEAVES", "drawWindowView", "FLAKES", "drawParticles"],
  "room/art.js": [
    "dc", "dp", "stamp", "rnd", "disc", "glow", "FONT3", "text3", "plank", "swagY", "swagLine", "bunting", "WIN", "inGlass", "mullions",
    "windowTree", "inHeart", "heartArt", "HEART5", "HEART7", "pumpkin", "BAT", "MINIBAT", "web", "shamrock", "eggArt", "smallEgg", "balloon",
    "firework", "BITS", "drift", "twinkle", "partyYear",
    // the Christmas helpers: each one used by a single event moves into that event's file (see FLOAT)
    "NISSE", "NISSE_PAL", "nisse", "HJERTE", "julehjerte", "MINIHEART", "STAR5", "DOORS", "DOOR_C", "xmasDay", "adventLit", "ADVENT",
    "TREE_X", "TIERS", "TREE_CANDLES", "XMAS_BULBS", "cottage", "snowFir", "danishFlag", "TINYFLAG", "JULEBUK",
  ],
  "room/events.js": ["EVENT_ART", "eventLayer", "eventLayerKey", "drawEvent", "drawEventCounter", "drawSeason"],
  "room/spots.js": ["SEATS", "QUEUE", "HQ_SPOT", "WAIT_SPOT", "COUCH", "DONE_SPOT", "slot"],
  "room/workers.js": ["workers", "targetFor", "syncWorkers"],
  "room/collision.js": ["FURNITURE", "blocked", "tileKey", "rebuildBlocked", "findPath", "route", "deskCount"],
  "room/scene.js": ["fontsLoaded", "paintRoomStill", "roomLayer", "roomLayerKey", "drawRoom", "drawBubble", "drawLabel", "GLYPH"],
  "room/hero.js": ["BEAT_MS", "DANCE", "isNight", "drawSleep", "drawZ", "danceMove", "drawShadow", "drawSparkles", "drawNotes"],
  "room/breakroom.js": ["COFFEE_SPOT", "SNACK_SPOT", "WANDER", "CHAT_PAIRS", "SNACK_COLORS", "isIdle", "pickOne", "spotOf", "taken", "openSpot", "sendTo", "idleBrain", "idleLift", "drawWatchCheck", "drawProp"],
  "room/loop.js": ["FRAME_MS", "last", "lastDraw", "animating", "visibleAndFocused", "scheduleFrame", "loop"],
  "room/input.js": ["selected", "hovered", "workerAt", "select", "roomBox", "roomLegend", "fitRoom"],
  "topbar/topbar.js": ["renderMachines", "renderStats"],
  "questions/questions.js": ["renderBelow", "renderHud", "tick"],
  "questions/drafts.js": ["drafts", "keepDrafts", "restoreDrafts"],
  "questions/announce.js": ["seenAsks", "announce"],
  "feed/feed.js": ["seenUpdates", "feedTab", "updateRows", "renderFeed", "softChime", "announceUpdates", "renderLog", "logRows"],
  "card/card.js": ["renderCard"],
  "messages/messages.js": ["REF", "qTab", "replyTo", "replyText", "msgStick", "readSent", "msgFresh", "short", "setQTab", "renderQTabs", "msgModel", "msgItem", "replyBox", "msgNode", "renderMsgs", "sendReply"],
  "images/images.js": ["imageFiles", "boxKey", "boxOf", "insertAtCaret", "attachImages", "clearDropping"],
  "sound/sound.js": ["audio", "pref", "setPref", "sound", "ensureAudio", "tone", "chime", "renderSoundButtons"],
  "settings/panel.js": ["SETTING_OPTIONS", "SETTING_TITLES", "renderSettings", "renderSettingsButton", "applySettings"],
};

// Statements that declare nothing and do not belong with the statement above them.
const MATCH: [RegExp, string][] = [
  [/^document\.addEventListener\("click"/, "core/clicks.js"],
  [/^\$\("main"\)\.addEventListener/, "questions/answer.js"],
  [/^\$\("(compose|noteText)"\)\.addEventListener/, "tell/tell.js"],
  [/^load\(\)\.then\(connect\)|^setInterval\(\(\) => \{ if \(S\)/, "core/boot.js"],
];

// Section headers (// ---------- title ----------) the page had, and where a statement opening one goes when the
// plan does not name it. A header not listed here is new work: it becomes a module of its own, <slug>/<slug>.js.
const SECTIONS: Record<string, string> = {
  "helpers": "core/format.js",
  "the room": "room/canvas.js",
  "settings": "settings/prefs.js",
  "seasons": "room/seasons.js",
  "accessories": "room/accessories.js",
  "season decorations, drawn with the room": "room/weather.js",
  "events: a few days a year with a room of their own": "room/art.js",
  "Christmas, the Danish way: a julestue": "room/art.js",
  "collision": "room/collision.js",
  "break room life": "room/breakroom.js",
  "HUD": "topbar/topbar.js",
  "messages": "messages/messages.js",
  "images": "images/images.js",
  "events": "core/clicks.js",
  "sound": "sound/sound.js",
};

// Art helpers used by exactly one event move into that event's file, so an event is one file to work on.
const FLOAT_FROM = "room/art.js";
const FLOAT_INTO = /^room\/events\//;

// The big table of event art is cut into one file per event: room/events/<id>.js, default export.
const SPLIT_OBJECT = { name: "EVENT_ART", dir: "room/events" };

export const DOCS: Record<string, string> = {
  "main.js": "The page's entry. Loads every built-in area in the order the old single script ran them, so the room, the panels and the timers start as before. New features do not go here: a folder with an index.js is loaded by the page on its own (see AGENTS.md).",
  "core/dom.js": "DOM shortcuts: $ by id, and the toast.",
  "core/state.js": "The page's shared state: S, the last /api/state, and CONFIG from the server. Leaf module; boot.js sets them.",
  "core/status.js": "Lane status labels and colours. A contract shared by the card and anything else that names a status.",
  "core/format.js": "Small pure helpers: HTML escaping, durations, clock times, the name hash.",
  "core/text.js": "Rich text in questions and messages: links, image thumbs, code boxes with COPY, MORE/LESS.",
  "core/net.js": "Writes to the server (POST with the x-hud header).",
  "core/boot.js": "Loads the state, renders every panel, listens to the server's stream and reloads the page when its files change.",
  "core/clicks.js": "Clicks delegated from the whole document: select a worker, switch the feed tab, MORE/LESS.",
  "core/bus.js": "The page's event channel. A feature listens here instead of being called from another area's file.",
  "room/canvas.js": "The room's canvas, its pixel scale, px() and the cache of pre-painted art (bake, blit).",
  "room/sprites.js": "The 16x16 worker sprite: heads, bodies, legs, walk frames, and drawSprite.",
  "room/palette.js": "Colours: worker palettes from the name hash, the heroes, the HQ bot.",
  "room/seasons.js": "Which season or event it is, from the clock, the ?season= preview and the settings.",
  "room/accessory-table.js": "Every accessory's pixels and seasons. Data only; order matters (it decides who wears what).",
  "room/accessories.js": "Who wears which accessory this season, and drawing them over the sprite.",
  "room/weather.js": "Season decorations drawn with the room: the window views, snow and falling leaves.",
  "room/art.js": "Drawing tools for event art: the event layer's px (dp), stamps, glows, pixel letters, bunting, shared shapes.",
  "room/events.js": "Runs the current event's art: its still layer, painted once, and its live bits every frame.",
  "room/spots.js": "The room's layout in tiles: desks, the queue, HQ, the couch, the break room.",
  "room/workers.js": "One worker per lane: where each one should be, and syncing them with the state.",
  "room/collision.js": "Furniture that blocks walking, and paths around it.",
  "room/scene.js": "The room itself: floor, walls, furniture (painted once), screens and lights, bubbles and name labels.",
  "room/hero.js": "The hero behind the counter: the dance, the sleep at night, the shadow, sparkles and notes.",
  "room/breakroom.js": "Idle workers' life in the break room: coffee, snacks, wandering, chats.",
  "room/loop.js": "The frame loop: 10 fps, paused while the tab is hidden or unfocused.",
  "room/input.js": "Pointer input on the room (hover, click to select) and fitting the canvas to its box.",
  "topbar/topbar.js": "The top bar: waiting count, oldest wait, working, on HQ, bank, FROM HQ, machines.",
  "questions/questions.js": "The question panel: the open asks, their timers, and the pill for asks out of view.",
  "questions/answer.js": "Answering: options, drafts as you type, SEND, COPY, and marking updates read.",
  "questions/announce.js": "Notices new questions: the chime, and switching back to QUESTIONS.",
  "questions/drafts.js": "Unsent answers and notes, kept across the page's own reloads.",
  "tell/tell.js": "Tell HQ: the free-text note box.",
  "feed/feed.js": "The box under the room: FROM HQ updates and the SENT & ANSWERED log, and the note under Tell HQ.",
  "card/card.js": "The worker card: the selected lane's status, links and open asks.",
  "messages/messages.js": "The MESSAGES tab: one thread of HQ's updates and your notes, with replies.",
  "images/images.js": "Dropping or pasting images into any text box: upload, then insert the path.",
  "sound/sound.js": "Sound: the chime for a new question, generated in the browser, and the SOUND button.",
  "settings/prefs.js": "Per-browser settings (hero, season, hat), their defaults and storage.",
  "settings/panel.js": "The SETTINGS panel.",
};

export type ClientResult = { files: Map<string, string>; mainOrder: string[]; notes: string[]; problems: string[] };

export function splitClient(js: string): ClientResult {
  const notes: string[] = [];
  const byName = new Map<string, string>();
  for (const [m, names] of Object.entries(NAMES)) for (const n of names) byName.set(n, m);
  const sectionRe = /^\s*\/\/ -{4,} (.*?) -{4,}\s*$/;
  const { sf, checker } = parse("page.js", js, ts.ScriptKind.JS);
  const pieces = cut(js, sf, { sectionRe, moduleOfName: (n) => byName.get(n), splitDeclarators: true });

  // assign modules
  let prev = "core/dom.js";
  for (const p of pieces) {
    const named = p.names.map((n) => byName.get(n)).find(Boolean);
    const match = MATCH.find(([re]) => re.test(p.text))?.[1];
    let m = named ?? match;
    if (!m && p.sectionStart) {
      m = SECTIONS[p.section];
      if (!m) {
        const s = slug(p.section);
        m = `${s}/${s}.js`;
        notes.push(`new section "${p.section}" -> ${m}`);
      }
    }
    if (!m) {
      m = prev;
      if (p.names.length) notes.push(`${p.names.join(", ")} (not in the plan) -> ${m}, with the statement above`);
    }
    p.module = m;
    prev = m;
  }

  // the event art table: one sub-piece per event
  const table = pieces.find((p) => p.names.includes(SPLIT_OBJECT.name));
  const events: { key: string; piece: Piece }[] = [];
  if (table) {
    const decl = (table.node as ts.VariableStatement).declarationList.declarations[0];
    const obj = decl.initializer;
    if (!obj || !ts.isObjectLiteralExpression(obj)) throw new Error(`${SPLIT_OBJECT.name} is not an object literal`);
    for (const prop of obj.properties) {
      if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) throw new Error(`${SPLIT_OBJECT.name}: unexpected property at ${prop.getText().slice(0, 40)}`);
      const key = prop.name.text;
      const lead = js.slice(prop.getFullStart(), prop.getStart()).split("\n").map((l) => l.trim()).filter((l) => l.startsWith("//")).join("\n");
      const piece = subPiece(pieces, table, prop, prop.initializer.getStart(), prop.initializer.end, {
        module: `${SPLIT_OBJECT.dir}/${key}.js`,
        head: (lead ? lead + "\n" : "") + "export default ",
        tail: ";\n",
      });
      events.push({ key, piece });
    }
  }

  let a: Analysis = link({ sf, checker, text: js, pieces });

  // float single-use art helpers into their event
  for (let changed = true; changed; ) {
    changed = false;
    for (const p of pieces) {
      if (p.module !== FLOAT_FROM || !p.names.length) continue;
      const users = new Set(a.refs.filter((r) => r.to === p.idx && r.from !== p.idx).map((r) => pieces[r.from].module));
      if (users.size === 1) {
        const [u] = users;
        if (FLOAT_INTO.test(u)) { p.module = u; changed = true; notes.push(`${p.names.join(", ")} -> ${u} (its only user)`); }
      }
    }
  }
  // a statement that declares nothing follows the one above it, also after floating
  for (let i = 1; i < pieces.length; i++) {
    const p = pieces[i];
    if (p.kind === "expr" && pieces[i - 1].kind !== "part" && !MATCH.some(([re]) => re.test(p.text)) && !p.sectionStart) p.module = pieces[i - 1].module;
  }

  const evNames = new Map(events.map(({ key }) => [key, key]));
  const declared = new Set(pieces.flatMap((p) => p.names));
  for (const k of evNames.keys()) if (declared.has(k)) evNames.set(k, `${k}Art`);

  const out = emit(a, {
    ext: ".js",
    sectionRe,
    header: (m) => comment(DOCS[m] ?? (m.startsWith("room/events/") ? `${m.slice(12, -3)}: the room for this event. Its still() is painted once into a layer and copied every frame; live(now) draws the moving bits.` : "Moved here from the page's single script.")),
    respec: (s) => s,
    custom: (p, body) => {
      if (p === table) {
        const lead = js.slice(p.start, (p.node as ts.Statement).getStart());
        return `${lead}${p.exported ? "export " : ""}const ${SPLIT_OBJECT.name} = {\n${events.map(({ key }) => `  ${evNames.get(key) === key ? key : `${key}: ${evNames.get(key)}`},`).join("\n")}\n};${js.slice((p.node as ts.Statement).end, p.end)}`;
      }
      if (p.kind === "part") return p.head + dedent(body(p.start, p.end), 2) + p.tail;
      return null;
    },
    extraImports: table ? new Map([[table.module, events.map(({ key, piece }) => `import ${evNames.get(key)} from "./${piece.module.slice(SPLIT_OBJECT.dir.length - "events".length)}";`)]]) : undefined,
  });

  // the table's module needs each event; the order check must see those edges too
  if (table) out.deps.set(table.module, [...events.map((e) => e.piece.module), ...(out.deps.get(table.module) ?? [])]);
  const mainOrder = [...new Set(pieces.filter((p) => p.kind !== "part").map((p) => p.module))];
  const problems = checkOrder(a, mainOrder, out.deps);
  notes.push(...out.setters.map((s) => `setter ${s}`));
  return { files: out.files, mainOrder, notes, problems };
}
