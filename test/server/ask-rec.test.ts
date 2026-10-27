// The owner's rule: every ask carries the agent's pick. `hud ask` and the route behind it refuse a decision filed with options and no
// --rec, say what is missing and show the line to send; a question with no options is not refused. The guide teaches the rule.
import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { GUIDE } from "../../src/hq-guide.ts";
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
const titles = async () => (await o.state()).open.map((a: any) => a.title);

describe("a decision with options needs a recommendation", () => {
  test("hud ask refuses it, says what is missing and shows the line with --rec", async () => {
    const r = await hud("ask", "--title", "Which database?", "--opt", "SQLite", "--opt", "Postgres");
    expect(r.code).toBe(1);
    expect(r.err.trim()).toBe(
      `This decision has options but no recommendation. Every question to the owner carries your pick and why: add --rec with the option you recommend, and say why in --body. Example:\n` +
        `  hud ask --title "Which database?" --opt "SQLite" --opt "Postgres" --rec "SQLite" --body "I recommend SQLite because ..."\n` +
        `A question with no options (--kind action or info) needs no --rec.`,
    );
    expect(await titles()).toEqual([]);
  });

  test("the route refuses it too, a blank pick counts as none, and the ledger's route as well", async () => {
    for (const path of ["/api/asks", "/api/ledger/asks"]) {
      for (const recommended of [undefined, "", "  "]) {
        const res = await o.send(path, { title: "Left or right?", options: ["Left", "Right"], recommended });
        expect(res.status).not.toBe(200);
        expect(((await res.json()) as any).error).toContain("no recommendation");
      }
    }
    expect(await titles()).toEqual([]);
  });

  test("with --rec, with no options, or as an action or info, it is filed", async () => {
    expect((await hud("ask", "--title", "Picked", "--opt", "A", "--opt", "B", "--rec", "A")).code).toBe(0);
    expect((await hud("ask", "--title", "Open question")).code).toBe(0);
    expect((await hud("ask", "--title", "Do the thing", "--kind", "action")).code).toBe(0);
    expect((await hud("ask", "--title", "FYI", "--kind", "info", "--opt", "Noted")).code).toBe(0);
    expect(await titles()).toEqual(["Picked", "Open question", "Do the thing", "FYI"]);
  });

  test("hud update refuses an edit that would leave options with no pick, and allows the rest", async () => {
    const ask = async (body: object) => ((await (await o.send("/api/asks", body)).json()) as any).id as number;
    const ask_ = async (id: number) => (await o.state()).open.find((a: any) => a.id === id);
    const bare = await ask({ title: "Bare" });
    const r = await hud("update", String(bare), "--opt", "Yes", "--opt", "No");
    expect(r.code).toBe(1);
    expect(r.err).toContain("This decision has options but no recommendation.");
    expect(r.err).toContain('--opt "Yes" --opt "No" --rec "Yes"');
    expect((await ask_(bare)).options ?? []).toEqual([]);
    expect((await hud("update", String(bare), "--opt", "Yes", "--opt", "No", "--rec", "Yes")).code).toBe(0);
    expect((await ask_(bare)).recommended).toBe("Yes");
    // A blank --rec on a question with options takes its pick away: refused.
    expect((await hud("update", String(bare), "--rec", " ")).code).toBe(1);
    // An edit that leaves the options and the pick alone is not this rule's business.
    expect((await hud("update", String(bare), "--title", "Bare, renamed")).code).toBe(0);
    const info = await ask({ title: "FYI 2", kind: "info" });
    expect((await hud("update", String(info), "--opt", "Noted")).code).toBe(0);
  });

  test("the guide teaches the rule, with the same flag the refusal shows", () => {
    const line = GUIDE.split("\n").find((l) => l.includes("refuse options without"))!;
    expect(line).toContain("--rec A");
    expect(line).toContain("--opt A --opt B");
  });
});
