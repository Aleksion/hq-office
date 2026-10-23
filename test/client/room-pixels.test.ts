// The page draws exactly as before a change: the room's canvas pixels for 19 fixed states, seasons and times, and
// every element's computed style and box at 1440x900 and 800x900, against a base tree from git.
//
// It runs on its own while HEAD still has the old single index.html (the restructure is not committed yet), and
// whenever PIXEL_BASE names a ref: PIXEL_BASE=HEAD bun test test/client/room-pixels.test.ts checks that a
// refactor in the working tree changed nothing on screen. It needs Chrome (CHROME_BIN to point at one).
// Against a base from before 0.2.0, whose default hero showed a fixed name rather than HUD_OWNER, set PIXEL_OWNER to
// that name: both sides then run with it as the owner, and the hero's label matches.
import { expect, test } from "bun:test";
import { join } from "node:path";
import { capture, findChrome, treeOf } from "../../scripts/room-hash.ts";

const ROOT = join(import.meta.dir, "..", "..");
const git = (...args: string[]) => Bun.spawnSync(["git", "-C", ROOT, ...args], { stdout: "pipe", stderr: "ignore" });
const base = process.env.PIXEL_BASE ?? (git("cat-file", "-e", "HEAD:index.html").exitCode === 0 ? "HEAD" : null);

test.skipIf(!base || !findChrome())(`the page draws the same as ${base}`, async () => {
  const tree = await treeOf(base!, ROOT);
  try {
    const before = await capture(tree.dir);
    const after = await capture(ROOT);
    expect(after.errors).toEqual([]);
    expect(after.scroll["1440x900"]).toBe(true);
    expect(after.captures).toEqual(before.captures);
    expect(after.styles).toEqual(before.styles);
  } finally {
    tree.done();
  }
}, 120_000);
