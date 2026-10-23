// herdr-plugin.toml and bin/hud-plugin.ts agree: every action and pane runs a command the plugin knows, and
// package.json says the same version as the manifest.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const manifest = Bun.TOML.parse(readFileSync(join(ROOT, "herdr-plugin.toml"), "utf8")) as any;
const known = readFileSync(join(ROOT, "bin", "hud-plugin.ts"), "utf8").match(/const COMMANDS = \[([^\]]*)\]/)![1].match(/"[^"]+"/g)!.map((s) => JSON.parse(s));

test("every action and pane runs a command the plugin knows", () => {
  const entries = [...manifest.actions, ...manifest.panes];
  for (const a of entries) {
    const sub = String(a.command.at(-1)).match(/bin\/hud-plugin\.ts (\S+)/)?.[1];
    expect({ id: a.id, sub, known: known.includes(sub) }).toEqual({ id: a.id, sub, known: true });
  }
  expect(manifest.actions.map((a: any) => a.id)).toEqual(["start", "stop", "reload", "open", "install-service", "remove-service", "install-hud"]);
});

test("package.json has the manifest's version", () => {
  expect(JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version).toBe(manifest.version);
});
