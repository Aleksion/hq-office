// The owner's settings (hero, season, hat, sound, performance): kept on the server, with a copy in this browser for the first paint.
import { HEROES } from "../room/palette.js";
import { emit, on } from "../core/bus.js";
import { post } from "../core/net.js";

// The owner's choices, not per-view state such as the open tab. The defaults: the season follows the calendar, the
// default hero (YOU) is the hero, its hat follows the season, the chime is off, and the room moves smoothly.
export const DEFAULTS = { hero: "YOU", season: "auto", hat: "auto", sound: false, performance: "smooth" };
// How much the room moves, and so what it costs (room/beat.js).
export const PERFORMANCE_CHOICES = ["smooth", "balanced", "saver"];
const LOCAL_KEY = "hq-settings";
// Before 0.3.0 the SOUND switch was remembered on its own, under this key.
const LOCAL_SOUND_KEY = "hq-sound";

// What this browser remembered: the copy of the server's settings from the last visit, or, from before the server
// kept settings, the only copy.
export function localSettings() {
  try {
    const out = JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}");
    const own = out && typeof out === "object" && !Array.isArray(out) ? out : {};
    const sound = localStorage.getItem(LOCAL_SOUND_KEY);
    if (sound !== null && !("sound" in own)) own.sound = sound === "1";
    return own;
  } catch { return {}; }
}
function saveLocal() { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(settings)); } catch {} }

// The defaults with the given choices over them. A hero this page no longer has (one saved by an older version) is
// the default hero again; the season and the hat are checked where they are used.
export function withDefaults(v) {
  const s = { ...DEFAULTS, ...v };
  if (!HEROES.some((h) => h.name === s.hero)) s.hero = DEFAULTS.hero;
  s.sound = s.sound === true;
  if (!PERFORMANCE_CHOICES.includes(s.performance)) s.performance = DEFAULTS.performance;
  return s;
}

// What the page does with the server's settings. The server's are the truth once it has any. A server with none
// yet gets what this browser remembered, sent up once (ifEmpty, so it never overwrites a choice made elsewhere);
// with nothing remembered either, the defaults stand and nothing is sent.
export function plan(server, local, migrated) {
  if (server && Object.keys(server).length) return { use: server, migrate: null };
  if (!Object.keys(local).length) return { use: null, migrate: null };
  return { use: local, migrate: migrated ? null : local };
}

export let settings = withDefaults(localSettings());
export let heroIndex = Math.max(0, HEROES.findIndex((h) => h.name === settings.hero));
export const hero = () => HEROES[heroIndex];

// Makes these the settings: the copy in this browser, the hero, and the "settings" event on the bus, which the
// settings panel, the room and SOUND listen to. Nothing happens when nothing changed.
function adopt(v) {
  const next = withDefaults(v);
  const same = JSON.stringify(next) === JSON.stringify(settings);
  settings = next;
  saveLocal();
  if (same) return;
  heroIndex = Math.max(0, HEROES.findIndex((h) => h.name === settings.hero));
  emit("settings", settings);
}

// The owner changed something on this page: it shows at once and goes to the server, whose reply is the truth.
// While a change is on its way, the stream's older settings are not applied over it.
let pending = 0, migrated = false, lastServer = null;
export async function changeSettings(changes) {
  adopt({ ...settings, ...changes });
  pending++;
  try {
    const reply = await post("/api/settings", { settings: changes });
    if (pending === 1) adopt(reply.settings);
  } catch (e) {
    console.warn("settings were not saved on the server:", e.message);
  } finally {
    pending--;
  }
}
export const resetSettings = () => changeSettings({ ...DEFAULTS });

on("state", (S) => {
  if (!S.settings || S.settings === lastServer) return;
  lastServer = S.settings;
  if (pending) return;
  const { use, migrate } = plan(S.settings, localSettings(), migrated);
  if (use) adopt(use);
  if (!migrate) return;
  migrated = true;
  post("/api/settings", { settings: withDefaults(migrate), ifEmpty: true })
    .then(() => { try { localStorage.removeItem(LOCAL_SOUND_KEY); } catch {} })
    .catch((e) => console.warn("settings were not sent to the server:", e.message));
});
