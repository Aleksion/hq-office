#!/usr/bin/env bun
// herdr plugin entrypoint for HQ Office: start | stop | reload | open | status.
// herdr runs it with cwd = the plugin dir and hands over state and config dirs.
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = dirname(import.meta.dir);
const STATE = process.env.HERDR_PLUGIN_STATE_DIR || join(ROOT, ".data");
const CONFIG_DIR = process.env.HERDR_PLUGIN_CONFIG_DIR || ROOT;
const CONFIG_FILE = join(CONFIG_DIR, "config.env");
const PID_FILE = join(STATE, "hud.pid");
const LOG_FILE = join(STATE, "server.log");
const HEALTH_TIMEOUT_MS = 8_000;
const COMMANDS = ["start", "stop", "reload", "open", "status"];
const command = process.argv[2] ?? "";

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
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  try {
    const child = spawn(opener, [URL_BASE], { stdio: "ignore", detached: true });
    child.on("error", () => console.log(`Could not run ${opener}; open ${URL_BASE} yourself.`));
    child.unref();
  } catch {
    console.log(`Could not run ${opener}; open ${URL_BASE} yourself.`);
  }
}

async function start() {
  if (await fetchState()) {
    console.log(`HQ Office is already running at ${URL_BASE}`);
  } else {
    const pid = readPid();
    if (pid && alive(pid)) fail(`a server (pid ${pid}) is running but not answering at ${URL_BASE}. See ${LOG_FILE}, or run the stop action.`);
    mkdirSync(DATA_DIR, { recursive: true });
    const env: Record<string, string> = { ...(process.env as Record<string, string>), ...config, HUD_PORT: String(PORT), HUD_HOST: BIND_HOST, HUD_DATA_DIR: DATA_DIR, HERDR_BIN: HERDR };
    const log = openSync(LOG_FILE, "a");
    // process.execPath is the bun running this script, so PATH does not have to find it again.
    const child = spawn(process.execPath, ["server.ts"], { cwd: ROOT, env, stdio: ["ignore", log, log], detached: true });
    if (!child.pid) fail(`could not start the server. See ${LOG_FILE}`);
    writeFileSync(PID_FILE, String(child.pid));
    child.unref();

    const deadline = Date.now() + HEALTH_TIMEOUT_MS;
    let up = false;
    while (Date.now() < deadline) {
      if (await fetchState()) {
        up = true;
        break;
      }
      if (!alive(child.pid)) break;
      await Bun.sleep(250);
    }
    if (!up) {
      if (alive(child.pid)) process.kill(child.pid, "SIGTERM");
      rmSync(PID_FILE, { force: true });
      const tail = existsSync(LOG_FILE) ? readFileSync(LOG_FILE, "utf8").trimEnd().split("\n").slice(-10).join("\n") : "";
      fail(`the server did not come up at ${URL_BASE} within ${HEALTH_TIMEOUT_MS / 1000}s. Last log lines from ${LOG_FILE}:\n${tail}`);
    }
    console.log(`HQ Office started (pid ${child.pid}) at ${URL_BASE}`);
    console.log(`Data: ${DATA_DIR}`);
  }
  openBrowser();
  console.log(URL_BASE);
  checkHqAgent();
}

async function stop(): Promise<boolean> {
  const pid = readPid();
  if (!pid) {
    console.log(`No pid file at ${PID_FILE}; this plugin has no server to stop.`);
    if (await fetchState()) console.log(`Something is still answering at ${URL_BASE}; it was not started by this plugin.`);
    return false;
  }
  if (!alive(pid)) {
    rmSync(PID_FILE, { force: true });
    console.log(`Server (pid ${pid}) was not running; removed the stale pid file.`);
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

async function status() {
  const state = await fetchState();
  if (!state) {
    console.log(`HQ Office is down (nothing answering at ${URL_BASE}).`);
    console.log(`Start it with: herdr plugin action invoke hq-office.start`);
  } else {
    const open = Array.isArray(state.open) ? state.open.length : 0;
    const lanes: any[] = Array.isArray(state.lanes) ? state.lanes : [];
    const byStatus = new Map<string, number>();
    for (const lane of lanes) byStatus.set(String(lane?.status ?? "unknown"), (byStatus.get(String(lane?.status ?? "unknown")) ?? 0) + 1);
    console.log(`HQ Office is up at ${URL_BASE}\n`);
    console.log(`Open questions: ${open}`);
    console.log(`Lanes: ${lanes.length}${lanes.length ? ` (${[...byStatus].map(([s, n]) => `${n} ${s}`).join(", ")})` : ""}`);
  }
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
    await stop();
    await start();
    break;
  case "open":
    if (!(await fetchState())) console.log(`Note: nothing is answering at ${URL_BASE} yet; run the start action.`);
    openBrowser();
    console.log(URL_BASE);
    break;
  case "status":
    await status();
    break;
}
