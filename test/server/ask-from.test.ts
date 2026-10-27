// hud ask --from LANE records which lane handed a question in; a question filed without it has nobody.
import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import { office, ROOT } from "./office.ts";

const o = await office();
afterAll(async () => {
  await o.stop();
  o.remove();
});
async function hud(...args: string[]) {
  const proc = Bun.spawn([process.execPath, join(ROOT, "hud.ts"), ...args], { env: { ...process.env, HUD_URL: o.base }, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { out, err, code };
}

test("--from is recorded on the question and reaches the page; without it nobody handed it in", async () => {
  const a = await hud("ask", "--title", "Handed in", "--from", "billing-lead");
  expect(a.code).toBe(0);
  expect((await hud("ask", "--title", "Plain")).code).toBe(0);
  // A checklist question goes through the ledger's route and keeps it too.
  expect((await hud("ask", "--title", "With items", "--from", "billing-lead", "--item", "one")).code).toBe(0);
  const s = await o.state();
  expect(s.open.map((q: any) => [q.title, q.handed_by])).toEqual([["Handed in", "billing-lead"], ["Plain", null], ["With items", "billing-lead"]]);
});
