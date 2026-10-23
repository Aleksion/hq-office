#!/usr/bin/env bun
// herdr plugin entrypoint for HQ Office: start | stop | reload | open | status | install-service | remove-service |
// install-hud. herdr runs it with cwd = the plugin dir and hands over state and config dirs.
// HQ_OFFICE_OPENER replaces the browser opener (tests set it to `true`); bin/service.ts lists the service's fakes.
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { platform, pluginId, serviceFor, servicePath, type ServiceSpec } from "./service.ts";
import { installHud } from "./hud-command.ts";

const ROOT = dirname(import.meta.dir);
const STATE = process.env.HERDR_PLUGIN_STATE_DIR || join(ROOT, ".data");
const CONFIG_DIR = process.env.HERDR_PLUGIN_CONFIG_DIR || ROOT;
const CONFIG_FILE = join(CONFIG_DIR, "config.env");
const PID_FILE = join(STATE, "hud.pid");
const LOG_FILE = join(STATE, "server.log");
const HEALTH_TIMEOUT_MS = 8_000;
const COMMANDS = ["start", "stop", "reload", "open", "status", "install-service", "remove-service", "install-hud"];
const command = process.argv[2] ?? "";
const FORCE = process.argv.includes("--force");
const PLUGIN_ID = pluginId(ROOT);
const service = serviceFor(PLUGIN_ID);

if (!COMMANDS.includes(command)) {
  console.error(`usage: bun bin/hud-plugin.ts ${COMMANDS.join("|")}`);
  process.exit(2);
}
mkdirSync(STATE, { recursive: true });

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) value = value.slice(1, -1);
    out[line.slice(0, eq).trim()] = value;
  }
  return out;
}

// Reads config.env, creating it from the example on first run. Empty values mean "use the default".
function loadConfig(): Record<string, string> {
  if (!existsSync(CONFIG_FILE)) {
    const example = join(ROOT, "config.env.example");
    mkdirSync(CONFIG_DIR, { recursive: true });
    if (existsSync(example)) copyFileSync(example, CONFIG_FILE);
    else writeFileSync(CONFIG_FILE, "HUD_HQ_AGENT=\n");
    console.log(`Created ${CONFIG_FILE}. Edit it to configure HQ Office.`);
  }
  const all = parseEnv(readFileSync(CONFIG_FILE, "utf8"));
  return Object.fromEntries(Object.entries(all).filter(([, v]) => v !== ""));
}

const config = loadConfig();
const setting = (key: string) => config[key] || process.env[key] || "";

const PORT = Number(setting("HUD_PORT") || 4747);
const BIND_HOST = setting("HUD_HOST") || "127.0.0.1";
const HOST = BIND_HOST === "0.0.0.0" || BIND_HOST === "::" ? "127.0.0.1" : BIND_HOST;
const URL_BASE = `http://${HOST.includes(":") ? `[${HOST}]` : HOST}:${PORT}`;
const DATA_DIR = setting("HUD_DATA_DIR") || STATE;
const HERDR = Bun.which(setting("HERDR_BIN") || "herdr") ?? (setting("HERDR_BIN") || "herdr");
const HQ_AGENT = setting("HUD_HQ_AGENT");

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) fail(`HUD_PORT must be a port number, got "${setting("HUD_PORT")}"`);

async function fetchState(): Promise<any | null> {
  try {
    const res = await fetch(`${URL_BASE}/api/state`, { signal: AbortSignal.timeout(1500) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

function readPid(): number | null {
  if (!existsSync(PID_FILE)) return null;
  const pid = Number(readFileSync(PID_FILE, "utf8").trim());
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function herdrAgentNames(): string[] | null {
  try {
    const proc = Bun.spawnSync([HERDR, "agent", "list"], { stdout: "pipe", stderr: "ignore", timeout: 5000 });
    if (proc.exitCode !== 0) return null;
    const agents = JSON.parse(proc.stdout.toString())?.result?.agents;
    if (!Array.isArray(agents)) return null;
    return [...new Set(agents.map((a: any) => a?.name).filter((n: unknown): n is string => typeof n === "string" && n !== ""))];
  } catch {
    return null;
  }
}

function checkHqAgent() {
  const names = herdrAgentNames();
  const listing = names === null ? "  (could not run `herdr agent list`)" : names.length ? names.map((n) => `  - ${n}`).join("\n") : "  (no named agents right now)";
  if (!HQ_AGENT) {
    console.log(`\nWarning: HUD_HQ_AGENT is not set, so answers go to an agent named "hq".`);
    console.log(`Set HUD_HQ_AGENT in ${CONFIG_FILE} to your HQ's herdr agent name, then run the reload action.`);
    console.log(`Agents herdr knows about:\n${listing}`);
  } else if (names && !names.includes(HQ_AGENT)) {
    console.log(`\nNote: no herdr agent named "${HQ_AGENT}" is running right now. Agents herdr knows about:\n${listing}`);
  }
}

function openBrowser() {
  const opener = process.env.HQ_OFFICE_OPENER || (process.platform === "darwin" ? "open" : "xdg-open");
  try {
    const child = spawn(opener, [URL_BASE], { stdio: "ignore", detached: true });
    child.on("error", () => console.log(`Could not run ${opener}; open ${URL_BASE} yourself.`));
    child.unref();
  } catch {
    console.log(`Could not run ${opener}; open ${URL_BASE} yourself.`);
  }
}

const logTail = () => (existsSync(LOG_FILE) ? readFileSync(LOG_FILE, "utf8").trimEnd().split("\n").slice(-10).join("\n") : "");

// Waits for the server to answer, while `alive` says it may still come up.
async function waitUp(alive: () => boolean = () => true) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await fetchState()) return true;
    if (!alive()) return false;
    await Bun.sleep(250);
  }
  return false;
}

// The variables the server runs with: config.env, then what the plugin decides.
function serverEnv(): Record<string, string> {
  return { ...config, HUD_PORT: String(PORT), HUD_HOST: BIND_HOST, HUD_DATA_DIR: DATA_DIR, HERDR_BIN: HERDR };
}

// Bun for the service: the one on PATH (a stable link such as ~/.bun/bin/bun), else the one running this.
function bunPath() {
  return Bun.which("bun", { PATH: servicePath() }) ?? process.execPath;
}

function serviceSpec(): ServiceSpec {
  return { bun: bunPath(), root: ROOT, env: { ...serverEnv(), PATH: servicePath() }, log: LOG_FILE };
}

const serviceInstalled = () => !!service && service.state().installed;

async function start() {
  if (await fetchState()) {
    console.log(`HQ Office is already running at ${URL_BASE}`);
  } else if (serviceInstalled()) {
    try {
      service!.start();
    } catch (e) {
      fail((e as Error).message);
    }
    if (!(await waitUp())) fail(`the service ${service!.name} did not answer at ${URL_BASE} within ${HEALTH_TIMEOUT_MS / 1000}s. Last log lines from ${LOG_FILE}:\n${logTail()}`);
    console.log(`HQ Office service ${service!.name} started at ${URL_BASE}`);
    console.log(`Data: ${DATA_DIR}`);
  } else {
    const pid = readPid();
    if (pid && alive(pid)) fail(`a server (pid ${pid}) is running but not answering at ${URL_BASE}. See ${LOG_FILE}, or run the stop action.`);
    mkdirSync(DATA_DIR, { recursive: true });
    const env: Record<string, string> = { ...(process.env as Record<string, string>), ...serverEnv() };
    const log = openSync(LOG_FILE, "a");
    // process.execPath is the bun running this script, so PATH does not have to find it again.
    const child = spawn(process.execPath, ["server.ts"], { cwd: ROOT, env, stdio: ["ignore", log, log], detached: true });
    if (!child.pid) fail(`could not start the server. See ${LOG_FILE}`);
    writeFileSync(PID_FILE, String(child.pid));
    child.unref();

    if (!(await waitUp(() => alive(child.pid!)))) {
      if (alive(child.pid)) process.kill(child.pid, "SIGTERM");
      rmSync(PID_FILE, { force: true });
      fail(`the server did not come up at ${URL_BASE} within ${HEALTH_TIMEOUT_MS / 1000}s. Last log lines from ${LOG_FILE}:\n${logTail()}`);
    }
    console.log(`HQ Office started (pid ${child.pid}) at ${URL_BASE}`);
    console.log(`Data: ${DATA_DIR}`);
  }
  openBrowser();
  console.log(URL_BASE);
  checkHqAgent();
}

// Stops the server this plugin started as a plain process (the pid file).
async function stopProcess(quiet = false): Promise<boolean> {
  const pid = readPid();
  if (!pid) {
    if (quiet) return false;
    console.log(`No pid file at ${PID_FILE}; this plugin has no server to stop.`);
    if (await fetchState()) console.log(`Something is still answering at ${URL_BASE}; it was not started by this plugin.`);
    return false;
  }
  if (!alive(pid)) {
    rmSync(PID_FILE, { force: true });
    if (!quiet) console.log(`Server (pid ${pid}) was not running; removed the stale pid file.`);
    return false;
  }
  process.kill(pid, "SIGTERM");
  const deadline = Date.now() + 5000;
  while (alive(pid) && Date.now() < deadline) await Bun.sleep(100);
  if (alive(pid)) process.kill(pid, "SIGKILL");
  rmSync(PID_FILE, { force: true });
  console.log(`Stopped HQ Office (pid ${pid}).`);
  return true;
}

async function stop() {
  if (!serviceInstalled()) return stopProcess();
  await stopProcess(true);
  try {
    service!.stop();
  } catch (e) {
    fail((e as Error).message);
  }
  console.log(`Stopped the HQ Office service ${service!.name}. It starts again at the next login or with the start action;`);
  console.log(`the remove service action removes it for good.`);
}

// Writes the service with the current config.env and plugin folder, and (re)starts it.
async function installService() {
  if (!service) fail(`service mode needs macOS (launchd) or Linux (systemd); this is ${platform()}.`);
  const before = service.state();
  await stopProcess(true);
  if (!before.running && (await fetchState())) {
    fail(`something else is answering at ${URL_BASE}, not this plugin's service. Stop it first (or give HQ Office another HUD_PORT in ${CONFIG_FILE}), then run this action again.`);
  }
  mkdirSync(DATA_DIR, { recursive: true });
  try {
    service.install(serviceSpec());
  } catch (e) {
    fail((e as Error).message);
  }
  if (!(await waitUp())) fail(`the service is installed (${service.file}) but did not answer at ${URL_BASE} within ${HEALTH_TIMEOUT_MS / 1000}s. Last log lines from ${LOG_FILE}:\n${logTail()}`);
  console.log(`${before.installed ? "Updated" : "Installed"} the HQ Office service ${service.name} (${service.kind}), running at ${URL_BASE}`);
  console.log(`File: ${service.file}`);
  console.log(`Data: ${DATA_DIR}`);
  console.log(`Log:  ${LOG_FILE}`);
  console.log(`It starts at login and restarts when it stops. After a config.env change or a plugin update, run the restart action (or this one) again.`);
  if (service.kind === "systemd") console.log(`To keep it running while you are logged out, and to start it at boot: loginctl enable-linger "$USER"`);
}

async function removeService() {
  if (!service) fail(`service mode needs macOS (launchd) or Linux (systemd); this is ${platform()}.`);
  const before = service.state();
  if (!before.installed && !before.loaded) {
    console.log(`The HQ Office service is not installed (no ${service.file}).`);
    return;
  }
  try {
    service.remove();
  } catch (e) {
    fail((e as Error).message);
  }
  console.log(`Removed the HQ Office service ${service.name} and ${service.file}. Your data stays in ${DATA_DIR}.`);
  console.log(`The start action runs the server again, until this machine restarts.`);
}

function serviceLine() {
  if (!service) return `not available on ${platform()}`;
  const st = service.state();
  if (!st.installed) return `not installed (the install service action keeps the server running across restarts)`;
  const run = st.running ? `running${st.pid ? ` (pid ${st.pid})` : ""}` : st.loaded ? "loaded, not running" : "stopped";
  return `installed, ${run}: ${service.name} (${service.kind})`;
}

async function status() {
  const state = await fetchState();
  if (!state) {
    console.log(`HQ Office is down (nothing answering at ${URL_BASE}).`);
    console.log(`Start it with: herdr plugin action invoke ${PLUGIN_ID}.start`);
  } else {
    const open = Array.isArray(state.open) ? state.open.length : 0;
    const lanes: any[] = Array.isArray(state.lanes) ? state.lanes : [];
    const byStatus = new Map<string, number>();
    for (const lane of lanes) byStatus.set(String(lane?.status ?? "unknown"), (byStatus.get(String(lane?.status ?? "unknown")) ?? 0) + 1);
    console.log(`HQ Office is up at ${URL_BASE}\n`);
    console.log(`Open questions: ${open}`);
    console.log(`Lanes: ${lanes.length}${lanes.length ? ` (${[...byStatus].map(([s, n]) => `${n} ${s}`).join(", ")})` : ""}`);
  }
  console.log(`Service:  ${serviceLine()}`);
  console.log(`HQ agent: ${HQ_AGENT || `not set (falls back to "hq"); set HUD_HQ_AGENT in ${CONFIG_FILE}`}`);
  console.log(`Data dir: ${DATA_DIR}`);
  console.log(`Config:   ${CONFIG_FILE}`);
  console.log(`URL:      ${URL_BASE}`);
  // As a popup pane the output would vanish at once; wait for a key when someone is looking.
  if (process.stdin.isTTY) {
    console.log("\npress any key to close");
    process.stdin.setRawMode(true);
    await new Promise((resolve) => process.stdin.once("data", resolve));
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }
}

switch (command) {
  case "start":
    await start();
    break;
  case "stop":
    await stop();
    break;
  case "reload":
    // A service is written again, so it picks up config.env and a moved plugin folder.
    if (serviceInstalled()) await installService();
    else {
      await stop();
      await start();
    }
    break;
  case "open":
    if (!(await fetchState())) console.log(`Note: nothing is answering at ${URL_BASE} yet; run the start action.`);
    openBrowser();
    console.log(URL_BASE);
    break;
  case "status":
    await status();
    break;
  case "install-service":
    await installService();
    break;
  case "remove-service":
    await removeService();
    break;
  case "install-hud": {
    const result = installHud({ hudTs: join(ROOT, "hud.ts"), url: URL_BASE, force: FORCE });
    for (const line of result.lines) (result.ok ? console.log : console.error)(line);
    if (!result.ok) process.exit(1);
    break;
  }
}
