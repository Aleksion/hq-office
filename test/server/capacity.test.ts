// The capacity guard: a fake guard script stands in for the real one, which is never run from a test.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "capacity-test-"));
process.env.HUD_DATA_DIR = dir;
process.env.HUD_CAPACITY_TIMEOUT_MS = "400";
// herdr.ts first, as main.ts does: state.ts and hq-link.ts import each other.
await import("../../src/server/herdr.ts");
const { state } = await import("../../src/server/state.ts");
const { LOCAL } = await import("../../src/server/config.ts"); // fixed by whichever test file loaded it first
const { capacity } = await import("../../src/server/capacity.ts");

function guard(name: string, body: string) {
  const path = join(dir, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}
const marker = join(dir, "ran");
const fakes = {
  go: guard("go", `echo "$1" >> "${marker}"; echo "capacity hub: 80 GiB free -> go"; exit 0`),
  hold: guard("hold", `echo "capacity hub: 45 GiB free -> hold"; exit 1`),
  stop: guard("stop", `echo "capacity hub: 30 GiB free -> stop"; exit 2`),
  slow: guard("slow", `sleep 5; exit 0`),
  crash: guard("crash", `echo boom >&2; exit 7`),
};
afterAll(() => { delete process.env.HUD_CAPACITY_GUARD; rmSync(dir, { recursive: true, force: true }); });
beforeAll(() => { delete process.env.HUD_CAPACITY_GUARD; });

test("each exit code is its state, and the guard gets the argument hub", async () => {
  for (const [name, want] of [["go", "go"], ["hold", "hold"], ["stop", "stop"]] as const) {
    process.env.HUD_CAPACITY_GUARD = fakes[name];
    const r = await capacity("there");
    expect(r.state).toBe(want);
    expect(r.reason).toContain(`-> ${want}`);
  }
  expect((await Bun.file(marker).text()).trim()).toBe("hub");
});

test("a slow guard is a hold, within the limit", async () => {
  process.env.HUD_CAPACITY_GUARD = fakes.slow;
  const t = Date.now();
  const r = await capacity("there");
  expect(r.state).toBe("hold");
  expect(r.reason).toContain("no answer");
  expect(Date.now() - t).toBeLessThan(3000);
});

test("a missing or crashing guard is a hold, never a go", async () => {
  process.env.HUD_CAPACITY_GUARD = join(dir, "nope");
  expect((await capacity("there")).state).toBe("hold");
  process.env.HUD_CAPACITY_GUARD = fakes.crash;
  const r = await capacity("there");
  expect(r.state).toBe("hold");
  expect(r.reason).toContain("boom");
});

test("no guard set is go and says so", async () => {
  delete process.env.HUD_CAPACITY_GUARD;
  const r = await capacity("there");
  expect(r.state).toBe("go");
  expect(r.reason).toContain("no capacity guard");
});

test("this machine is go without running the guard", async () => {
  await Bun.write(marker, "");
  process.env.HUD_CAPACITY_GUARD = fakes.stop;
  const r = await capacity(LOCAL);
  expect(r.state).toBe("go");
  expect(await Bun.file(marker).text()).toBe("");
});

test("the page carries the last answer per machine and asking is not the state getter's job", async () => {
  process.env.HUD_CAPACITY_GUARD = fakes.hold;
  await capacity("there");
  process.env.HUD_CAPACITY_GUARD = fakes.stop;
  const s: any = state();
  expect(s.capacity.there.state).toBe("hold"); // stop guard not run by the getter
  expect(s.capacity[LOCAL].state).toBe("go");
});
