// Service mode for the herdr plugin: the server as a per-user service that starts at login and restarts when it
// stops. A launchd agent on macOS, a systemd user unit on Linux.
//
// Every outside command goes through the binaries named here, so tests swap in fakes and a fake home directory:
//   HQ_OFFICE_PLATFORM   darwin | linux (default: this machine's)
//   HQ_OFFICE_LAUNCHCTL  the launchctl to run (default: launchctl)
//   HQ_OFFICE_SYSTEMCTL  the systemctl to run (default: systemctl)
//   HOME, XDG_CONFIG_HOME where the agent's plist or the unit file is written
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// What the service runs: Bun on the plugin's server.ts, in the plugin's folder, with these variables.
export type ServiceSpec = { bun: string; root: string; env: Record<string, string>; log: string };
export type ServiceState = { installed: boolean; loaded: boolean; running: boolean; pid: number | null };
export type Service = {
  kind: "launchd" | "systemd";
  name: string; // the launchd label or the systemd unit
  file: string; // the plist or the unit file
  render(spec: ServiceSpec): string;
  installedDataDir(): string | null; // HUD_DATA_DIR in the installed file, or null
  state(): ServiceState;
  install(spec: ServiceSpec): void; // write the file, then load and (re)start it
  remove(): void;
  start(): void;
  stop(): void;
};

export const home = () => process.env.HOME || homedir();
export const platform = () => process.env.HQ_OFFICE_PLATFORM || process.platform;

// PATH for the service: Bun's own install folder and Homebrew's first, then what the plugin was run with.
export function servicePath(current = process.env.PATH ?? "") {
  const dirs = [join(home(), ".bun", "bin"), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin", ...current.split(":")];
  return [...new Set(dirs.filter(Boolean))].join(":");
}

type Run = { code: number; out: string; err: string };
function run(cmd: string[]): Run {
  try {
    const p = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe", timeout: 15_000 });
    return { code: p.exitCode ?? 1, out: p.stdout.toString(), err: p.stderr.toString() };
  } catch (e) {
    return { code: 127, out: "", err: (e as Error).message };
  }
}
function must(cmd: string[]): Run {
  const r = run(cmd);
  if (r.code !== 0) throw new Error(`${cmd.join(" ")} failed (exit ${r.code}): ${(r.err || r.out).trim()}`);
  return r;
}
const sleep = (ms: number) => Bun.sleepSync(ms);

// ---- macOS: a LaunchAgent ----

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function launchd(pluginId: string): Service {
  const label = `dev.${pluginId}.server`;
  const file = join(home(), "Library", "LaunchAgents", `${label}.plist`);
  const launchctl = process.env.HQ_OFFICE_LAUNCHCTL || "launchctl";
  const domain = `gui/${process.getuid?.() ?? 501}`;
  const target = `${domain}/${label}`;

  const state = (): ServiceState => {
    const installed = existsSync(file);
    const r = run([launchctl, "print", target]);
    if (r.code !== 0) return { installed, loaded: false, running: false, pid: null };
    const pid = Number(r.out.match(/^\s*pid = (\d+)/m)?.[1]) || null;
    const running = /^\s*state = running/m.test(r.out) && pid !== null;
    return { installed, loaded: true, running, pid };
  };
  const bootout = () => {
    if (!state().loaded) return;
    must([launchctl, "bootout", target]);
    for (let i = 0; i < 50 && state().loaded; i++) sleep(100);
  };
  // launchd can refuse a bootstrap right after a bootout while it finishes; try again for a few seconds.
  const bootstrap = () => {
    let last: Run = { code: 0, out: "", err: "" };
    for (let i = 0; i < 10; i++) {
      last = run([launchctl, "bootstrap", domain, file]);
      if (last.code === 0 || state().loaded) return;
      sleep(500);
    }
    throw new Error(`${launchctl} bootstrap ${domain} ${file} failed (exit ${last.code}): ${(last.err || last.out).trim()}`);
  };

  return {
    kind: "launchd",
    name: label,
    file,
    installedDataDir: () => dataDirIn(file, "launchd"),
    render(spec) {
      const env = Object.entries(spec.env).map(([k, v]) => `      <key>${xml(k)}</key>\n      <string>${xml(v)}</string>`).join("\n");
      return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- HQ Office's server, written by the ${xml(pluginId)} herdr plugin ("install service"). Run that action again to
     update it, and "remove service" to remove it. -->
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${xml(label)}</string>
    <key>ProgramArguments</key>
    <array>
      <string>${xml(spec.bun)}</string>
      <string>${xml(join(spec.root, "server.ts"))}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${xml(spec.root)}</string>
    <key>EnvironmentVariables</key>
    <dict>
${env}
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>StandardOutPath</key>
    <string>${xml(spec.log)}</string>
    <key>StandardErrorPath</key>
    <string>${xml(spec.log)}</string>
  </dict>
</plist>
`;
    },
    state,
    install(spec) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, this.render(spec));
      bootout();
      bootstrap();
    },
    remove() {
      bootout();
      rmSync(file, { force: true });
    },
    start() {
      if (!state().loaded) bootstrap();
      else must([launchctl, "kickstart", target]);
    },
    // Unloads it: with KeepAlive, killing the process would only bring it back. The plist stays, so it starts again
    // at the next login or with start.
    stop: bootout,
  };
}

// ---- Linux: a systemd user unit ----

// HUD_DATA_DIR as written in an installed plist or unit file, decoded; null when there is no file or no such line.
function dataDirIn(file: string, kind: "launchd" | "systemd"): string | null {
  if (!existsSync(file)) return null;
  const text = readFileSync(file, "utf8");
  if (kind === "launchd") {
    const v = text.match(/<key>HUD_DATA_DIR<\/key>\s*<string>([^<]*)<\/string>/)?.[1];
    return v == null ? null : v.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  }
  const v = text.match(/^Environment="HUD_DATA_DIR=((?:[^"\\]|\\.)*)"$/m)?.[1];
  return v == null ? null : v.replace(/%%/g, "%").replace(/\\(.)/g, "$1");
}

// A value inside Environment="..." or ExecStart: quotes and backslashes escaped, % doubled (systemd specifiers).
const unitQuote = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/%/g, "%%")}"`;

export function systemd(pluginId: string): Service {
  const unit = `${pluginId}.service`;
  const file = join(process.env.XDG_CONFIG_HOME || join(home(), ".config"), "systemd", "user", unit);
  const systemctl = process.env.HQ_OFFICE_SYSTEMCTL || "systemctl";
  const sc = (...args: string[]) => [systemctl, "--user", ...args];

  const state = (): ServiceState => {
    const installed = existsSync(file);
    const r = run(sc("show", unit, "-p", "LoadState", "-p", "ActiveState", "-p", "MainPID"));
    const prop = (k: string) => r.out.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim() ?? "";
    const loaded = r.code === 0 && prop("LoadState") === "loaded";
    const pid = Number(prop("MainPID")) || null;
    return { installed, loaded, running: loaded && prop("ActiveState") === "active", pid };
  };

  return {
    kind: "systemd",
    name: unit,
    file,
    installedDataDir: () => dataDirIn(file, "systemd"),
    render(spec) {
      const env = Object.entries(spec.env).map(([k, v]) => `Environment=${unitQuote(`${k}=${v}`)}`).join("\n");
      return `# HQ Office's server, written by the ${pluginId} herdr plugin ("install service"). Run that action again to
# update it, and "remove service" to remove it.
[Unit]
Description=HQ Office server
After=network.target

[Service]
Type=simple
WorkingDirectory=${unitQuote(spec.root)}
ExecStart=${unitQuote(spec.bun)} ${unitQuote(join(spec.root, "server.ts"))}
${env}
Restart=always
RestartSec=2
StandardOutput=append:${spec.log}
StandardError=append:${spec.log}

[Install]
WantedBy=default.target
`;
    },
    state,
    install(spec) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, this.render(spec));
      must(sc("daemon-reload"));
      if (state().running) {
        must(sc("enable", unit));
        must(sc("restart", unit));
      } else {
        must(sc("enable", "--now", unit));
      }
    },
    remove() {
      if (existsSync(file) || state().loaded) run(sc("disable", "--now", unit));
      rmSync(file, { force: true });
      must(sc("daemon-reload"));
    },
    start() {
      must(sc("start", unit));
    },
    stop() {
      if (state().loaded) must(sc("stop", unit));
    },
  };
}

// The service for this platform, or null where there is none.
export function serviceFor(pluginId: string): Service | null {
  const p = platform();
  return p === "darwin" ? launchd(pluginId) : p === "linux" ? systemd(pluginId) : null;
}

// The plugin's id from its manifest, which names the label and the unit.
export function pluginId(root: string) {
  try {
    return readFileSync(join(root, "herdr-plugin.toml"), "utf8").match(/^id\s*=\s*"([^"]+)"/m)?.[1] ?? "hq-office";
  } catch {
    return "hq-office";
  }
}
