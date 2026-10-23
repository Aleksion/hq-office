// Which season or event it is, from the clock, the ?season= preview and the settings.
import { settings } from "../settings/prefs.js";

// By this computer's clock. Events are a few days a year each, from and to as [month, day], both days included.
// They never overlap, and an event beats the calendar season. Christmas runs 1 to 26 December, so New Year
// (27 December to 2 January) follows it.
const EVENTS = [
  { id: "newyear", from: [12, 27], to: [1, 2] },
  { id: "valentine", from: [2, 7], to: [2, 14] },
  { id: "stpatrick", from: [3, 10], to: [3, 17] },
  { id: "easter", from: [4, 1], to: [4, 15] },
  { id: "halloween", from: [10, 15], to: [10, 31] },
  { id: "thanksgiving", from: [11, 22], to: [11, 28] },
];
// The one list of valid seasons, for both the URL and the settings. ?season=halloween (or any of these) previews one.
export const SEASONS = ["spring", "summer", "fall", "winter", "christmas", ...EVENTS.map((e) => e.id)];
const SEASON_OVERRIDE = (() => { try { const s = new URLSearchParams(location.search).get("season"); return SEASONS.includes(s) ? s : null; } catch { return null; } })();
function seasonNow(date = new Date()) {
  const m = date.getMonth(), d = date.getDate();
  const md = (m + 1) * 100 + d;
  for (const e of EVENTS) {
    const a = e.from[0] * 100 + e.from[1], b = e.to[0] * 100 + e.to[1];
    if (a <= b ? md >= a && md <= b : md >= a || md <= b) return e.id; // a window that wraps the new year
  }
  if (m === 11) return d <= 26 ? "christmas" : "winter";
  if (m <= 1) return "winter";
  if (m <= 4) return "spring";
  if (m <= 7) return "summer";
  return "fall";
}
export const chosenSeason = () => SEASON_OVERRIDE ?? (SEASONS.includes(settings.season) ? settings.season : seasonNow());
export let season = chosenSeason(); // checked again at every room frame
export const snowy = () => season === "winter" || season === "christmas";
export function setSeason(v) { return (season = v); }
