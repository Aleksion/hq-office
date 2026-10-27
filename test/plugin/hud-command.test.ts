// The plugin's "install hud command" action, with a fake home directory: it writes ~/.local/bin/hud for this
// plugin's hud.ts and the configured port, updates it when run again, and leaves a `hud` that is not its own alone
// unless forced. Nothing is written outside a temporary directory.
import { afterAll, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { freePort } from "../../scripts/room-hash.ts";

const ROOT = join(import.meta.dir, "..", "..");
const dir = mkdtempSync(join(tmpdir(), "hq-office-hud-"));
const home = join(dir, "home");
const config = join(dir, "config");
const state = join(dir, "state");
const hud = join(home, ".local", "bin", "hud");
for (const d of [home, config, state]) mkdirSync(d, { recursive: true });
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const setPort = (port: number) => writeFileSync(join(config, "config.env"), `HUD_PORT=${port}\nHUD_HQ_AGENT=hq\n`);
function plugin(args: string[], path = process.env.PATH ?? "/usr/bin:/bin") {
  const env = { PATH: path, HOME: home, TMPDIR: tmpdir(), HERDR_PLUGIN_STATE_DIR: state, HERDR_PLUGIN_CONFIG_DIR: config, HQ_OFFICE_PLATFORM: "none", HQ_OFFICE_LAUNCHCTL: "/nonexistent/launchctl", HQ_OFFICE_SYSTEMCTL: "/nonexistent/systemctl", HQ_OFFICE_OPENER: "true" };
  const p = Bun.spawnSync([process.execPath, "bin/hud-plugin.ts", ...args], { cwd: ROOT, env, stdout: "pipe", stderr: "pipe", timeout: 30_000 });
  return { code: p.exitCode, out: p.stdout.toString() + p.stderr.toString() };
}

test("installs an executable hud for this plugin's hud.ts and port, creating the folder", async () => {
  const port = freePort();
  setPort(port);
  const r = plugin(["install-hud"]);
  expect(r.code).toBe(0);
  expect(r.out).toContain(`Installed ${hud}`);
  expect(r.out).toContain(`export PATH="$HOME/.local/bin:$PATH"`); // the folder is not on the PATH it ran with
  expect(lstatSync(hud).mode & 0o111).toBeTruthy();
  const text = readFileSync(hud, "utf8");
  expect(text).toContain(`'${join(ROOT, "hud.ts")}'`);
  expect(text).toContain(`HUD_URL="\${HUD_URL:-http://127.0.0.1:${port}}"`);

  // It runs hud.ts against that port: a stand-in server answers /api/state.
  const server = Bun.spawn([process.execPath, "-e", `Bun.serve({ port: ${port}, hostname: "127.0.0.1", fetch: () => Response.json({ lanes: [], from: "the stand-in" }) })`], { stdout: "ignore", stderr: "ignore" });
  try {
    let out = "";
    for (let i = 0; i < 100 && !out.includes("the stand-in"); i++) {
      const env: Record<string, string> = { PATH: process.env.PATH ?? "", HOME: home };
      out = Bun.spawnSync([hud, "state"], { env, stdout: "pipe", stderr: "pipe", timeout: 10_000 }).stdout.toString();
      if (!out.includes("the stand-in")) await Bun.sleep(50);
    }
    expect(out).toContain("the stand-in");
  } finally {
    server.kill();
    await server.exited;
  }
});

test("running it again updates it, and says nothing about PATH when the folder is on it", () => {
  setPort(4999);
  const r = plugin(["install-hud"], `${join(home, ".local", "bin")}:${process.env.PATH}`);
  expect(r.code).toBe(0);
  expect(r.out).toContain(`Updated ${hud}`);
  expect(r.out).not.toContain("not on your PATH");
  expect(readFileSync(hud, "utf8")).toContain("http://127.0.0.1:4999");
});

test("a hud that points elsewhere is left alone, and replaced only with --force", () => {
  rmSync(hud);
  const elsewhere = join(dir, "elsewhere", "hud.ts");
  mkdirSync(join(dir, "elsewhere"));
  writeFileSync(elsewhere, "// another hud\n");
  symlinkSync(elsewhere, hud);
  const r = plugin(["install-hud"]);
  expect(r.code).toBe(1);
  expect(r.out).toContain(`already exists: a link to ${elsewhere}`);
  expect(r.out).toContain(`rm ${hud}`);
  expect(readlinkSync(hud)).toBe(elsewhere);

  const forced = plugin(["install-hud", "--force"]);
  expect(forced.code).toBe(0);
  expect(forced.out).toContain(`Replaced a link to ${elsewhere}`);
  expect(lstatSync(hud).isSymbolicLink()).toBe(false);
  expect(readFileSync(hud, "utf8")).toContain(join(ROOT, "hud.ts"));
  expect(readFileSync(elsewhere, "utf8")).toBe("// another hud\n");
});

test("a file it did not write is left alone too; a link to this plugin's hud.ts is updated", () => {
  rmSync(hud);
  writeFileSync(hud, "#!/bin/sh\necho mine\n");
  const r = plugin(["install-hud"]);
  expect(r.code).toBe(1);
  expect(r.out).toContain("a file this plugin did not write");
  expect(readFileSync(hud, "utf8")).toBe("#!/bin/sh\necho mine\n");

  rmSync(hud);
  symlinkSync(join(ROOT, "hud.ts"), hud);
  expect(plugin(["install-hud"]).code).toBe(0);
  expect(lstatSync(hud).isSymbolicLink()).toBe(false);
  expect(existsSync(join(ROOT, "hud.ts"))).toBe(true);
});
