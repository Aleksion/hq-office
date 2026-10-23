// The SETTINGS panel.
import { $ } from "../core/dom.js";
import { esc } from "../core/format.js";
import { CONFIG } from "../core/state.js";
import { HEROES } from "../room/palette.js";
import { DEFAULTS, saveSettings, setHeroIndex, setSettings, settings } from "./prefs.js";
import { SEASONS, chosenSeason, setSeason } from "../room/seasons.js";
import { ACCESSORIES } from "../room/accessory-table.js";
import { wornCache } from "../room/accessories.js";

// SETTINGS opens a panel of choices. Each choice has a default, and RESET puts them all back.
const SETTING_OPTIONS = {
  hero: HEROES.map((h) => h.name),
  season: ["auto", ...SEASONS],
  hat: ["auto", "none", ...ACCESSORIES.filter((a) => a.slot === "head").map((a) => a.id)],
};
const SETTING_TITLES = { hero: "HERO", season: "SEASON", hat: "HERO HAT" };
// The default hero is labelled with the owner's name (HUD_OWNER), or YOU.
const label = (key, v) => (key === "hero" && v === DEFAULTS.hero ? CONFIG.owner.trim() || v : v).toUpperCase();
function renderSettings() {
  const row = (key) => `<div class="srow"><span class="k">${SETTING_TITLES[key]}</span><div class="opts2">${SETTING_OPTIONS[key].map((v) =>
    `<button class="btn-s ${settings[key] === v ? "on" : ""}" type="button" data-set="${key}" data-val="${esc(v)}">${esc(label(key, v))}</button>`).join("")}</div></div>`;
  $("settings").innerHTML = `<div class="shead"><b class="k">SETTINGS</b><span class="spacer"></span><button class="btn-s" type="button" data-close>CLOSE</button></div>`
    + row("hero") + row("season") + row("hat")
    + `<div class="sfoot"><button class="btn-s" type="button" data-reset>RESET TO DEFAULTS</button></div>`;
}
function renderSettingsButton() { $("settingsBtn").textContent = "SETTINGS"; }
function applySettings() {
  saveSettings();
  setHeroIndex(Math.max(0, HEROES.findIndex((h) => h.name === settings.hero)));
  setSeason(chosenSeason());
  wornCache.clear();
  renderSettings();
}
$("settingsBtn").addEventListener("click", () => {
  const panel = $("settings");
  panel.hidden = !panel.hidden;
  if (!panel.hidden) renderSettings();
});
$("settings").addEventListener("click", (e) => {
  const choice = e.target.closest("[data-set]");
  if (choice) { settings[choice.dataset.set] = choice.dataset.val; applySettings(); return; }
  if (e.target.closest("[data-reset]")) { setSettings({ ...DEFAULTS }); applySettings(); return; }
  if (e.target.closest("[data-close]")) $("settings").hidden = true;
});
renderSettingsButton();
