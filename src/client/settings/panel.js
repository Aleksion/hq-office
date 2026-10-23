// The SETTINGS panel.
import { $ } from "../core/dom.js";
import { esc } from "../core/format.js";
import { CONFIG } from "../core/state.js";
import { HEROES } from "../room/palette.js";
import { DEFAULTS, PERFORMANCE_CHOICES, changeSettings, resetSettings, settings } from "./prefs.js";
import { on } from "../core/bus.js";
import { SEASONS, chosenSeason, setSeason } from "../room/seasons.js";
import { ACCESSORIES } from "../room/accessory-table.js";
import { wornCache } from "../room/accessories.js";

// SETTINGS opens a panel of choices. Each choice has a default, and RESET puts them all back.
const SETTING_OPTIONS = {
  hero: HEROES.map((h) => h.name),
  season: ["auto", ...SEASONS],
  hat: ["auto", "none", ...ACCESSORIES.filter((a) => a.slot === "head").map((a) => a.id)],
  performance: PERFORMANCE_CHOICES,
};
const SETTING_TITLES = { hero: "HERO", season: "SEASON", hat: "HERO HAT", performance: "PERFORMANCE" };
// SMOOTH: everything moves at 30 frames a second. BALANCED: walking at 10, small motions on a slow beat.
// POWER SAVER: only walking workers move; an idle room shows no new frames.
const PERFORMANCE_LABELS = { smooth: "SMOOTH", balanced: "BALANCED", saver: "POWER SAVER" };
// The default hero is labelled with the owner's name (HUD_OWNER), or YOU.
const label = (key, v) => (key === "hero" && v === DEFAULTS.hero ? CONFIG.owner.trim() || v : key === "performance" ? PERFORMANCE_LABELS[v] : v).toUpperCase();
function renderSettings() {
  const row = (key) => `<div class="srow"><span class="k">${SETTING_TITLES[key]}</span><div class="opts2">${SETTING_OPTIONS[key].map((v) =>
    `<button class="btn-s ${settings[key] === v ? "on" : ""}" type="button" data-set="${key}" data-val="${esc(v)}">${esc(label(key, v))}</button>`).join("")}</div></div>`;
  $("settings").innerHTML = `<div class="shead"><b class="k">SETTINGS</b><span class="spacer"></span><button class="btn-s" type="button" data-close>CLOSE</button></div>`
    + row("hero") + row("season") + row("hat") + row("performance")
    + `<div class="sfoot"><button class="btn-s" type="button" data-reset>RESET TO DEFAULTS</button></div>`;
}
function renderSettingsButton() { $("settingsBtn").textContent = "SETTINGS"; }
// The settings changed, here, on another page or from the server: the room picks the season and the hats again.
on("settings", () => {
  setSeason(chosenSeason());
  wornCache.clear();
  if (!$("settings").hidden) renderSettings();
});
$("settingsBtn").addEventListener("click", () => {
  const panel = $("settings");
  panel.hidden = !panel.hidden;
  if (!panel.hidden) renderSettings();
});
$("settings").addEventListener("click", (e) => {
  const choice = e.target.closest("[data-set]");
  if (choice) { changeSettings({ [choice.dataset.set]: choice.dataset.val }); return; }
  if (e.target.closest("[data-reset]")) { resetSettings(); return; }
  if (e.target.closest("[data-close]")) $("settings").hidden = true;
});
renderSettingsButton();
