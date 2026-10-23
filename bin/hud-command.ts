// Puts a `hud` command on the user's PATH: ~/.local/bin/hud, a small shell script that runs this plugin's hud.ts
// against the configured server. Running it again updates it. A `hud` that is not this plugin's is left alone
// unless forced.
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { home } from "./service.ts";

const MARK = "# hq-office-plugin-hud";
const shQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

export function hudScript(hudTs: string, url: string) {
  return `#!/bin/sh
# hud: HQ's command for HQ Office. Written by the HQ Office herdr plugin's "install hud command" action; run that
# action again to update it. HUD_URL set in the environment wins over the URL below.
${MARK}
# target: ${hudTs}
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
export PATH
HUD_URL="\${HUD_URL:-${url}}"
export HUD_URL
exec bun ${shQuote(hudTs)} "$@"
`;
}

// What an existing file at the target is: this plugin's script (and what it runs), a link (and where it points),
// or something else.
function describe(path: string): { ours: boolean; what: string } {
  const st = lstatSync(path);
  if (st.isSymbolicLink()) {
    const to = readlinkSync(path);
    return { ours: false, what: `a link to ${resolve(join(path, ".."), to)}` };
  }
  const text = st.isFile() ? readFileSync(path, "utf8").slice(0, 4096) : "";
  if (text.includes(MARK)) return { ours: true, what: `this plugin's hud command for ${text.match(/^# target: (.*)$/m)?.[1] ?? "an unknown hud.ts"}` };
  return { ours: false, what: st.isFile() ? "a file this plugin did not write" : "something that is not a file" };
}

export type HudInstall = { ok: boolean; path: string; lines: string[] };

export function installHud(opts: { hudTs: string; url: string; force?: boolean; pathEnv?: string }): HudInstall {
  const dir = join(home(), ".local", "bin");
  const path = join(dir, "hud");
  const lines: string[] = [];
  let same = false;
  if (existsSync(path) || isLink(path)) {
    const { ours, what } = describe(path);
    same = ours || pointsAt(path, opts.hudTs);
    if (ours && !what.endsWith(` for ${opts.hudTs}`)) lines.push(`It was ${what}.`);
    if (!same && !opts.force) {
      return {
        ok: false,
        path,
        lines: [
          `${path} already exists: ${what}.`,
          `It was left as it is. To replace it with this plugin's hud command, remove it (rm ${path}) and run the`,
          `"install hud command" action again.`,
        ],
      };
    }
    if (!same) lines.push(`Replaced ${what} (--force).`);
    rmSync(path, { force: true });
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, hudScript(opts.hudTs, opts.url));
  chmodSync(path, 0o755);
  lines.unshift(`${same ? "Updated" : "Installed"} ${path}: runs ${opts.hudTs} against ${opts.url}.`);
  const onPath = (opts.pathEnv ?? process.env.PATH ?? "").split(":").some((p) => p && resolve(p) === resolve(dir));
  if (!onPath) {
    lines.push(`${dir} is not on your PATH here. If \`hud\` is not found in your shell, add this to your shell profile:`);
    lines.push(`  export PATH="$HOME/.local/bin:$PATH"`);
  }
  return { ok: true, path, lines };
}

function isLink(path: string) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}
// A link straight to this plugin's hud.ts counts as this plugin's.
function pointsAt(path: string, hudTs: string) {
  try {
    return isLink(path) && realpathSync(path) === realpathSync(hudTs);
  } catch {
    return false;
  }
}
