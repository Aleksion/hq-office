// A stand-in for launchctl and systemctl in the plugin's tests: it never touches the real service managers. It
// records every call in $FAKE_SERVICE_DIR/calls.log and keeps what is loaded in $FAKE_SERVICE_DIR/state.json, and,
// like the real ones, runs what the plist or unit file says (program, arguments, folder, variables, log), so a test
// sees the server the service would run.
//   bun test/fake-service.ts launchctl <args>     bun test/fake-service.ts systemctl --user <args>
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = process.env.FAKE_SERVICE_DIR;
if (!DIR) {
  console.error("FAKE_SERVICE_DIR is not set");
  process.exit(90);
}
const [tool, ...args] = process.argv.slice(2);
appendFileSync(join(DIR, "calls.log"), JSON.stringify([tool, ...args]) + "\n");

type Job = { file: string; pid: number | null; enabled?: boolean };
const STATE = join(DIR, "state.json");
const state: Record<string, Job> = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2));
const alive = (pid: number | null) => {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
type Program = { argv: string[]; cwd: string; env: Record<string, string>; log: string };
function launch(p: Program) {
  const log = openSync(p.log, "a");
  const child = spawn(p.argv[0], p.argv.slice(1), { cwd: p.cwd, env: p.env, stdio: ["ignore", log, log], detached: true });
  child.unref();
  return child.pid ?? null;
}
function kill(job: Job) {
  if (!alive(job.pid)) return;
  process.kill(job.pid!, "SIGTERM");
  for (let i = 0; i < 50 && alive(job.pid); i++) Bun.sleepSync(100);
  if (alive(job.pid)) process.kill(job.pid!, "SIGKILL");
  job.pid = null;
}

// ---- launchctl ----

const unxml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
function plist(file: string): Program & { label: string } {
  const text = readFileSync(file, "utf8");
  const after = (key: string) => text.split(`<key>${key}</key>`)[1] ?? "";
  const str = (key: string) => unxml(after(key).match(/^\s*<string>([^<]*)<\/string>/)?.[1] ?? "");
  const argv = [...(after("ProgramArguments").split("</array>")[0].matchAll(/<string>([^<]*)<\/string>/g))].map((m) => unxml(m[1]));
  const envBlock = after("EnvironmentVariables").split("</dict>")[0];
  const env = Object.fromEntries([...envBlock.matchAll(/<key>([^<]*)<\/key>\s*<string>([^<]*)<\/string>/g)].map((m) => [unxml(m[1]), unxml(m[2])]));
  if (!/<key>KeepAlive<\/key>\s*<true\/>/.test(text) || !/<key>RunAtLoad<\/key>\s*<true\/>/.test(text)) throw new Error("plist must keep alive and run at load");
  return { label: str("Label"), argv, cwd: str("WorkingDirectory"), env, log: str("StandardOutPath") };
}

function launchctl() {
  const domain = `gui/${process.getuid!()}`;
  const [verb, ...rest] = args;
  const labelOf = (target: string) => {
    if (!target?.startsWith(`${domain}/`)) {
      console.error(`unexpected target ${target}`);
      process.exit(64);
    }
    return target.slice(domain.length + 1);
  };
  switch (verb) {
    case "print": {
      const job = state[labelOf(rest[0])];
      if (!job) {
        console.error(`Could not find service "${rest[0]}" in domain for user gui: ${process.getuid!()}`);
        process.exit(113);
      }
      console.log(`${rest[0]} = {\n\tpath = ${job.file}\n\tstate = ${alive(job.pid) ? "running" : "not running"}\n${alive(job.pid) ? `\tpid = ${job.pid}\n` : ""}}`);
      return;
    }
    case "bootstrap": {
      if (rest[0] !== domain) process.exit(64);
      const p = plist(rest[1]);
      if (state[p.label]) {
        console.error("Bootstrap failed: 5: Input/output error");
        process.exit(5);
      }
      state[p.label] = { file: rest[1], pid: launch(p) };
      return save();
    }
    case "bootout": {
      const label = labelOf(rest[0]);
      const job = state[label];
      if (!job) {
        console.error("Boot-out failed: 3: No such process");
        process.exit(3);
      }
      kill(job);
      delete state[label];
      return save();
    }
    case "kickstart": {
      const k = rest[0] === "-k";
      const job = state[labelOf(k ? rest[1] : rest[0])];
      if (!job) process.exit(113);
      if (k) kill(job);
      if (!alive(job.pid)) job.pid = launch(plist(job.file));
      return save();
    }
    default:
      console.error(`fake launchctl: unknown ${verb}`);
      process.exit(64);
  }
}

// ---- systemctl --user ----

// Splits an ExecStart or Environment value: double quotes, with \\ and \" inside; %% is %.
function words(line: string) {
  const out: string[] = [];
  for (const m of line.matchAll(/"((?:[^"\\]|\\.)*)"|(\S+)/g)) out.push((m[1] !== undefined ? m[1].replace(/\\(.)/g, "$1") : m[2]).replace(/%%/g, "%"));
  return out;
}
function unit(file: string): Program {
  const text = readFileSync(file, "utf8");
  const one = (key: string) => text.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1] ?? "";
  if (one("Restart") !== "always") throw new Error("unit must restart always");
  const env = Object.fromEntries([...text.matchAll(/^Environment=(.*)$/gm)].map((m) => words(m[1])[0]).map((kv) => [kv.slice(0, kv.indexOf("=")), kv.slice(kv.indexOf("=") + 1)]));
  return { argv: words(one("ExecStart")), cwd: words(one("WorkingDirectory"))[0], env, log: one("StandardOutput").replace(/^append:/, "") };
}

function systemctl() {
  if (args[0] !== "--user") {
    console.error("fake systemctl: only --user");
    process.exit(64);
  }
  const unitDir = join(process.env.XDG_CONFIG_HOME || join(process.env.HOME!, ".config"), "systemd", "user");
  const [verb, ...rest] = args.slice(1);
  if (verb === "daemon-reload") return;
  const now = rest.includes("--now");
  const name = rest.find((a) => a.endsWith(".service"))!;
  const file = join(unitDir, name ?? "");
  const job = (state[name] ??= { file, pid: null });
  const start = () => { if (!alive(job.pid)) job.pid = launch(unit(file)); };
  const loadedOrDie = () => { if (!existsSync(file)) { console.error(`Unit ${name} not found.`); process.exit(5); } };
  switch (verb) {
    case "show": {
      const loaded = existsSync(file);
      console.log(`LoadState=${loaded ? "loaded" : "not-found"}\nActiveState=${alive(job.pid) ? "active" : "inactive"}\nMainPID=${alive(job.pid) ? job.pid : 0}`);
      return;
    }
    case "enable":
      loadedOrDie();
      job.enabled = true;
      if (now) start();
      return save();
    case "disable":
      job.enabled = false;
      if (now) kill(job);
      return save();
    case "start":
      loadedOrDie();
      start();
      return save();
    case "stop":
      kill(job);
      return save();
    case "restart":
      loadedOrDie();
      kill(job);
      start();
      return save();
    default:
      console.error(`fake systemctl: unknown ${verb}`);
      process.exit(64);
  }
}

if (tool === "launchctl") launchctl();
else if (tool === "systemctl") systemctl();
else process.exit(64);
