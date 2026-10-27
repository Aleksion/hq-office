// The bank and defer: a deferred question does not drain the bank while it is put off, and stops burning; the time it
// waited before and after still counts.
import { afterAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { waitedMinutes } from "../../src/server/score.ts";
import { office } from "./office.ts";

const MIN = 60_000;

describe("waitedMinutes", () => {
  test("leaves out the deferred spans, cut to the waiting window", () => {
    expect(waitedMinutes(0, 60 * MIN, [])).toBe(60);
    expect(waitedMinutes(0, 60 * MIN, [{ from_at: 10 * MIN, to_at: 40 * MIN }])).toBe(30);
    // a deferral reaching past the end, and one before the start (yesterday's, say), count only inside the window
    expect(waitedMinutes(20 * MIN, 60 * MIN, [{ from_at: 0, to_at: 30 * MIN }, { from_at: 50 * MIN, to_at: 90 * MIN }])).toBe(20);
    expect(waitedMinutes(0, 60 * MIN, [{ from_at: 0, to_at: 5 * MIN }, { from_at: 30 * MIN, to_at: 35 * MIN }])).toBe(50);
  });
});

describe("the bank while a question is deferred", () => {
  let o: Awaited<ReturnType<typeof office>>;
  afterAll(async () => {
    await o?.stop();
    o?.remove();
  });

  test("a deferred question stops burning, its deferral is recorded, and bringing it back ends the record", async () => {
    o = await office();
    const a = (await o.post("/api/asks", { title: "Later?" })).id;
    await o.post("/api/asks", { title: "Now?" });
    expect((await o.state()).score.burnPerMin).toBe(2);
    const until = Date.now() + 3_600_000;
    await o.post(`/api/asks/${a}/defer`, { until });
    expect((await o.state()).score.burnPerMin).toBe(1);
    const db = new Database(join(o.data, "hud.db"), { readonly: true });
    const rows = () => db.query("SELECT from_at, to_at FROM ask_defers WHERE ask_id = ?").all(a) as { from_at: number; to_at: number }[];
    expect(rows().map((r) => r.to_at)).toEqual([until]);
    await o.post(`/api/asks/${a}/defer`, { until: null });
    const [r] = rows();
    expect(r.to_at).toBeLessThan(until);
    expect(r.to_at).toBeGreaterThanOrEqual(r.from_at);
    db.close();
    expect((await o.state()).score.burnPerMin).toBe(2);
  });
});
