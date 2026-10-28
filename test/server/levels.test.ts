// A lane's level: the tree gives it (a lane straight under HQ is the top level), and `hud lane NAME --level L` sets it
// by hand, from the owner's level names; "auto" gives it back to the tree. A level list that starts with HQ names
// HQ's own level, so the lanes' levels are the rest.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnServer } from "../../scripts/room-hash.ts";
import { levelNames, rankOf } from "../../src/lane-tree.ts";

const ROOT = join(import.meta.dir, "..", "..");
const DATA = mkdtempSync(join(tmpdir(), "hq-levels-test-"));
let server: Awaited<ReturnType<typeof spawnServer>>;
beforeAll(async () => {
  server = await spawnServer({ cwd: ROOT, env: { ...process.env, HUD_HOST: "127.0.0.1", HUD_DATA_DIR: DATA, HERDR_BIN: join(DATA, "no-such-herdr"), HUD_MACHINES: "local" } });
});
afterAll(async () => {
  await server?.stop();
  rmSync(DATA, { recursive: true, force: true });
});
const post = (path: string, body: unknown) => fetch(`${server.base}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-hud": "1" }, body: JSON.stringify(body) });
const lane = async (name: string) => (await (await fetch(`${server.base}/api/state`)).json()).lanes.find((l: any) => l.name === name);

test("a leading HQ in the level names is HQ's own level", () => {
  expect(levelNames("HQ, PM, Senior Engineer, Engineer, Grunt")).toEqual(["PM", "Senior Engineer", "Engineer", "Grunt"]);
  expect(levelNames("hq")).toEqual(["Manager", "Lead", "Engineer"]);
  expect(rankOf("senior engineer", ["PM", "Senior Engineer"])).toBe(2);
  expect(rankOf("Boss", ["PM"])).toBeNull();
});

test("a lane straight under HQ is the top level; a level set by hand wins; auto gives it back to the tree", async () => {
  expect((await post("/api/settings", { settings: { levels: "HQ, PM, Senior Engineer, Engineer, Grunt" } })).status).toBe(200);
  await post("/api/lanes", { name: "pm-one" });
  await post("/api/lanes", { name: "dev-one", parent: "pm-one" });
  expect(await lane("pm-one")).toMatchObject({ depth: 1, rank: 1, level: "PM", levelSet: false });
  expect(await lane("dev-one")).toMatchObject({ depth: 2, rank: 2, level: "Senior Engineer", levelSet: false });
  expect((await post("/api/lanes", { name: "dev-one", level: "grunt" })).status).toBe(200);
  expect(await lane("dev-one")).toMatchObject({ depth: 2, rank: 4, level: "Grunt", levelSet: true });
  await post("/api/lanes", { name: "dev-one", level: "auto" });
  expect(await lane("dev-one")).toMatchObject({ rank: 2, level: "Senior Engineer", levelSet: false });
});

test("a level that is not one of the owner's names is refused, with the names", async () => {
  const res = await post("/api/lanes", { name: "pm-one", level: "Wizard" });
  expect(res.status).toBe(400);
  expect((await res.json()).error).toBe("level must be one of: PM, Senior Engineer, Engineer, Grunt (or auto)");
  expect(await lane("pm-one")).toMatchObject({ level: "PM", levelSet: false });
});
