// Per-browser settings (hero, season, hat), their defaults and storage.
import { HEROES } from "../room/palette.js";

// Per-browser choices. The defaults: the season follows the calendar, the default hero (YOU) is the hero, and its
// hat follows the season.
export const DEFAULTS = { hero: "YOU", season: "auto", hat: "auto" };
export let settings = (() => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem("hq-settings") || "{}") }; } catch { return { ...DEFAULTS }; } })();
// A hero this page no longer has (one saved by an older version) is the default hero again.
if (!HEROES.some((h) => h.name === settings.hero)) settings.hero = DEFAULTS.hero;
export function saveSettings() { try { localStorage.setItem("hq-settings", JSON.stringify(settings)); } catch {} }
export let heroIndex = Math.max(0, HEROES.findIndex((h) => h.name === settings.hero));
export const hero = () => HEROES[heroIndex];
export function setHeroIndex(v) { return (heroIndex = v); }
export function setSettings(v) { return (settings = v); }
