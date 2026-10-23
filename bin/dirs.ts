// Where the plugin keeps its config and data. herdr hands both over (HERDR_PLUGIN_CONFIG_DIR, HERDR_PLUGIN_STATE_DIR)
// when it runs an action. Run by hand, the installed plugin finds the same folders itself: the config folder from
// `herdr plugin config-dir`, the data folder at herdr's place for plugin state. A copy outside herdr's plugin folder (a
// development checkout) keeps its own .data, so running it by hand never touches an installed plugin's data.
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";

export type Dirs = { config: string; state: string; from: "herdr" | "installed" | "local" };

export function resolveDirs(opts: {
  root: string; // the plugin folder (where herdr-plugin.toml is)
  id: string; // the plugin id
  env: Record<string, string | undefined>;
  configDirFromHerdr: () => string | null; // `herdr plugin config-dir <id>`, or null when herdr cannot say
}): Dirs {
  const { root, id, env } = opts;
  if (env.HERDR_PLUGIN_CONFIG_DIR && env.HERDR_PLUGIN_STATE_DIR) return { config: env.HERDR_PLUGIN_CONFIG_DIR, state: env.HERDR_PLUGIN_STATE_DIR, from: "herdr" };
  const config = env.HERDR_PLUGIN_CONFIG_DIR || opts.configDirFromHerdr();
  // herdr keeps plugins under one folder (…/plugins/config/<id> for config, …/plugins/<source>/<dir> for the code).
  const pluginsRoot = config ? resolve(config, "..", "..") : null;
  if (config && pluginsRoot && (resolve(root) + sep).startsWith(pluginsRoot + sep)) {
    const stateHome = env.XDG_STATE_HOME || join(env.HOME || homedir(), ".local", "state");
    return { config, state: env.HERDR_PLUGIN_STATE_DIR || join(stateHome, "herdr", "plugins", id), from: "installed" };
  }
  return { config: env.HERDR_PLUGIN_CONFIG_DIR || root, state: env.HERDR_PLUGIN_STATE_DIR || join(root, ".data"), from: "local" };
}

export function herdrConfigDir(herdr: string, id: string): string | null {
  try {
    const p = Bun.spawnSync([herdr, "plugin", "config-dir", id], { stdout: "pipe", stderr: "ignore", timeout: 5000 });
    const out = p.stdout.toString().trim();
    return p.exitCode === 0 && out.startsWith("/") ? out : null;
  } catch {
    return null;
  }
}
