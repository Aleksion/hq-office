// Where the plugin finds its config and data: herdr's folders when herdr hands them over, the same folders when the
// installed plugin is run by hand, and the copy's own .data for a checkout outside herdr's plugin folder.
import { expect, test } from "bun:test";
import { resolveDirs } from "../../bin/dirs.ts";

const HOME = "/home/someone";
const PLUGINS = `${HOME}/.config/herdr/plugins`;
const configDir = `${PLUGINS}/config/hq-office`;

test("herdr's own folders win", () => {
  const d = resolveDirs({ root: `${PLUGINS}/github/hq-office-abc`, id: "hq-office", env: { HOME, HERDR_PLUGIN_CONFIG_DIR: "/c", HERDR_PLUGIN_STATE_DIR: "/s" }, configDirFromHerdr: () => configDir });
  expect(d).toEqual({ config: "/c", state: "/s", from: "herdr" });
});

test("the installed plugin run by hand finds herdr's folders", () => {
  const d = resolveDirs({ root: `${PLUGINS}/github/hq-office-abc`, id: "hq-office", env: { HOME }, configDirFromHerdr: () => configDir });
  expect(d).toEqual({ config: configDir, state: `${HOME}/.local/state/herdr/plugins/hq-office`, from: "installed" });
  const x = resolveDirs({ root: `${PLUGINS}/github/hq-office-abc`, id: "hq-office", env: { HOME, XDG_STATE_HOME: "/xdg" }, configDirFromHerdr: () => configDir });
  expect(x.state).toBe("/xdg/herdr/plugins/hq-office");
});

test("a checkout outside herdr's plugin folder keeps its own .data, even with herdr installed", () => {
  const d = resolveDirs({ root: `${HOME}/code/hq-office`, id: "hq-office", env: { HOME }, configDirFromHerdr: () => configDir });
  expect(d).toEqual({ config: `${HOME}/code/hq-office`, state: `${HOME}/code/hq-office/.data`, from: "local" });
});

test("without herdr the copy keeps its own folders", () => {
  const d = resolveDirs({ root: `${HOME}/code/hq-office`, id: "hq-office", env: { HOME }, configDirFromHerdr: () => null });
  expect(d.from).toBe("local");
});
