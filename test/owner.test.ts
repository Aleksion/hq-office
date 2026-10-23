// The note HQ receives and the event log name the configured owner, or a neutral word when none is set.
import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0)) await fn();
});

// Starts a server whose herdr is a stub that records the arguments it is given.
async function run(owner: string | undefined) {
  const data = mkdtempSync(join(tmpdir(), "hq-office-owner-"));
  const stub = join(data, "herdr");
  const log = join(data, "herdr.log");
  writeFileSync(stub, `#!/bin/sh\necho "$@" >> "${log}"\n`);
  chmodSync(stub, 0o755);
  const port = 4900 + Math.floor(Math.random() * 100);
  const env: Record<string, string | undefined> = { ...process.env, HUD_PORT: String(port), HUD_DATA_DIR: data, HERDR_BIN: stub, HUD_OWNER: owner };
  const server = Bun.spawn([process.execPath, "server.ts"], { cwd: ROOT, env, stdout: "ignore", stderr: "ignore" });
  cleanups.push(async () => {
    server.kill();
    await server.exited;
    rmSync(data, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${base}/api/state`)).ok) break;
    } catch {}
    await Bun.sleep(100);
  }
  await fetch(`${base}/api/notes`, { method: "POST", headers: { "x-hud": "1", "content-type": "application/json" }, body: JSON.stringify({ text: "ship it" }) });
  await Bun.sleep(300);
  const state = await (await fetch(`${base}/api/state`)).json();
  return { sent: readFileSync(log, "utf8"), events: state.events.map((e: any) => `${e.who} ${e.text}`).join("\n") };
}

test("a note reaches HQ under the owner's name", async () => {
  const { sent, events } = await run("Aleks");
  expect(sent).toContain("HUD note from Aleks: ship it");
  expect(events).toContain("Aleks told HQ: ship it");
});

test("with no owner set, the note says the owner", async () => {
  const { sent, events } = await run("");
  expect(sent).toContain("HUD note from the owner: ship it");
  expect(sent).not.toContain("Nico");
  expect(events).not.toContain("nico");
});
