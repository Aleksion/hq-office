// Defer: the owner puts an open question off until a time. It leaves the open list, HQ is told until when, and at its time it
// is back at the top, by itself and after a restart.
import { afterAll, describe, expect, test } from "bun:test";
import { office } from "./office.ts";

const offices: Awaited<ReturnType<typeof office>>[] = [];
afterAll(async () => {
  for (const o of offices) {
    await o.stop();
    o.remove();
  }
});
const start = async (opts: Parameters<typeof office>[0] = {}) => {
  const o = await office(opts);
  offices.push(o);
  return o;
};
const ids = (list: any[]) => list.map((a) => a.title);
async function until<T>(read: () => Promise<T>, ok: (v: T) => boolean) {
  for (let i = 0; i < 100; i++) {
    const v = await read();
    if (ok(v)) return v;
    await Bun.sleep(50);
  }
  throw new Error("never became true");
}

// An open page: the /api/stream messages, each holding the parts of the state that changed.
async function pageOpen(base: string) {
  const res = await fetch(`${base}/api/stream`);
  const reader = res.body!.getReader();
  let buf = "";
  const seen: any[] = [];
  return {
    async until(ok: (m: any) => boolean) {
      const stop = Date.now() + 5000;
      for (;;) {
        const hit = seen.find(ok);
        if (hit) return hit;
        if (Date.now() > stop) throw new Error("the page was never pushed it");
        const chunk = await Promise.race([reader.read(), Bun.sleep(5000).then(() => null)]);
        if (!chunk || chunk.done) continue;
        buf += new TextDecoder().decode(chunk.value);
        for (let i = buf.indexOf("\n\n"); i >= 0; i = buf.indexOf("\n\n")) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 2);
          if (line.startsWith("data: ")) seen.push(JSON.parse(line.slice(6)));
        }
      }
    },
    close: () => reader.cancel(),
  };
}

describe("defer", () => {
  test("a deferred question is out of open and its lane's count, in deferred, and HQ is told until when", async () => {
    const o = await start({ agents: ["hq"] });
    await o.post("/api/lanes", { name: "app" });
    const a = (await o.post("/api/asks", { title: "Later?", lane: "app" })).id;
    await o.post("/api/asks", { title: "Now?" });
    const t = Date.now() + 3_600_000;
    await o.post(`/api/asks/${a}/defer`, { until: t });
    const s = await o.state();
    expect(ids(s.open)).toEqual(["Now?"]);
    expect(s.lanes.find((l: any) => l.name === "app").asks).toBe(0);
    expect(s.deferred.map((x: any) => [x.title, x.defer_until])).toEqual([["Later?", t]]);
    const told = await o.prompted("Later?");
    expect(told).toContain("deferred it until");
    expect(told).toContain("comes back to the top then");
  });

  test("it comes back at its time, first, and an open page is pushed it without anyone asking", async () => {
    const o = await start();
    await Bun.sleep(2500); // the server's start-up pushes (first sync, machine sample) are over, so only the timer is left to push
    await o.post("/api/asks", { title: "Plain" });
    const a = (await o.post("/api/asks", { title: "Brief nap" })).id;
    await o.post(`/api/asks/${a}/defer`, { until: Date.now() + 1200 });
    expect(ids((await o.state()).open)).toEqual(["Plain"]);
    const page = await pageOpen(o.base);
    await page.until((m) => m.deferred?.length === 1 && m.open?.length === 1);
    // The page holds the stream; only a bump of the server's own makes it send the question's return.
    const pushed = await page.until((m) => m.open?.length === 2);
    expect(ids(pushed.open)).toEqual(["Brief nap", "Plain"]);
    expect(pushed.deferred).toEqual([]);
    page.close();
  });

  test("a restart does not lose it: before its time it is still deferred, then it comes back", async () => {
    const first = await start();
    const a = (await first.post("/api/asks", { title: "Survives" })).id;
    await first.post(`/api/asks/${a}/defer`, { until: Date.now() + 4500 });
    await first.stop();
    const second = await start({ data: first.data });
    const s = await second.state();
    expect(ids(s.open)).toEqual([]);
    expect(ids(s.deferred)).toEqual(["Survives"]);
    // The restarted server arms its own timer from the column: an open page is pushed the question's return.
    await Bun.sleep(2500);
    const page = await pageOpen(second.base);
    await page.until((m) => m.deferred?.length === 0 && m.open?.length === 1);
    page.close();
  });

  test("null brings it back now; a time in the past, or an answered question, is refused", async () => {
    const o = await start();
    const a = (await o.post("/api/asks", { title: "Q" })).id;
    await o.post(`/api/asks/${a}/defer`, { until: Date.now() + 3_600_000 });
    await o.post(`/api/asks/${a}/defer`, { until: null });
    expect(ids((await o.state()).open)).toEqual(["Q"]);
    expect((await o.send(`/api/asks/${a}/defer`, { until: Date.now() - 1000 })).status).not.toBe(200);
    expect((await o.send(`/api/asks/${a}/defer`, {})).status).not.toBe(200);
    await o.post(`/api/asks/${a}/answer`, { answer: "yes" });
    expect((await o.send(`/api/asks/${a}/defer`, { until: Date.now() + 5000 })).status).not.toBe(200);
  });

  test("a deferred question can still be answered", async () => {
    const o = await start();
    const a = (await o.post("/api/asks", { title: "Q" })).id;
    await o.post(`/api/asks/${a}/defer`, { until: Date.now() + 3_600_000 });
    await o.post(`/api/asks/${a}/answer`, { answer: "yes" });
    const s = await o.state();
    expect(s.deferred).toEqual([]);
    expect(s.answered.map((x: any) => x.answer)).toEqual(["yes"]);
  });
});
