// Conference rooms, through the hud CLI against a server on a spare port with a throwaway data dir and a stub herdr
// that lists the agents in agents.json and records every prompt. No real lane is ever prompted.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnServer } from "../../scripts/room-hash.ts";
import { GUIDE } from "../../src/hq-guide.ts";

const ROOT = join(import.meta.dir, "..", "..");
const DATA = mkdtempSync(join(tmpdir(), "hq-rooms-test-"));
const LOG = join(DATA, "prompts.log");
const AGENTS = join(DATA, "agents.json");
let server: Awaited<ReturnType<typeof spawnServer>>;
let BASE = "";

const agents = (names: string[]) => writeFileSync(AGENTS, JSON.stringify({ result: { agents: names.map((name, i) => ({ name, agent_status: "idle", pane_id: `p${i}`, agent: "claude" })) } }));

beforeAll(async () => {
  const herdr = join(DATA, "herdr");
  // One record per prompt: every argument, then an end line (a prompt spans lines).
  writeFileSync(herdr, `#!/bin/sh\ncase "$*" in\n  *"agent list"*) cat "${AGENTS}" ;;\n  *"agent prompt"*) { for a in "$@"; do printf '%s\\n<<ARG>>\\n' "$a"; done; printf '<<END>>\\n'; } >> "${LOG}" ;;\nesac\nexit 0\n`);
  chmodSync(herdr, 0o755);
  agents(["pm", "eng"]);
  const env: Record<string, string | undefined> = { ...process.env, HUD_HOST: "127.0.0.1", HUD_DATA_DIR: DATA, HERDR_BIN: herdr, HUD_MACHINES: "local", HUD_LOCAL_MACHINE: "local", HUD_HQ_AGENT: "hq", HUD_OWNER: "Sam" };
  server = await spawnServer({ cwd: ROOT, env });
  BASE = server.base;
  for (const [name, parent] of [["pm", "hq"], ["eng", "pm"], ["far", "pm"], ["lead", "hq"]]) await post("/api/lanes", { name, parent, machine: "local" });
  await post("/api/sync", {});
}, 30_000);

afterAll(async () => {
  await server?.stop();
  rmSync(DATA, { recursive: true, force: true });
});

async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-hud": "1" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}
const get = async (path: string) => (await fetch(`${BASE}${path}`)).json();

// The real CLI, as an agent runs it.
async function hud(args: string[], stdin?: string) {
  const proc = Bun.spawn([process.execPath, join(ROOT, "hud.ts"), ...args], { env: { ...process.env, HUD_URL: BASE }, stdin: stdin === undefined ? "ignore" : new Blob([stdin]), stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { out: out.trim(), err: err.trim(), code };
}

type Prompt = string[];
const prompts = (): Prompt[] => (existsSync(LOG) ? readFileSync(LOG, "utf8").split("<<END>>\n").filter(Boolean).map((p) => p.split("\n<<ARG>>\n").filter((a, i, all) => i < all.length - 1 || a)) : []);
// Each prompt is herdr's arguments: agent, prompt, the lane, the text. The stub runs after the request returns: wait
// for a prompt to `name` containing `part`, then a moment more so a duplicate would land too.
async function promptsTo(name: string, part: string, ms = 3000) {
  for (const end = Date.now() + ms; Date.now() < end; await Bun.sleep(40)) {
    if (prompts().some((p) => p.includes(name) && p.at(-1)!.includes(part))) break;
  }
  await Bun.sleep(300);
  return prompts().filter((p) => p.includes(name) && p.at(-1)!.includes(part));
}
const room = (slug: string) => get(`/api/rooms/${slug}`);

describe("hud room", () => {
  test("create: a room with an owner, members and linked work; again changes it", async () => {
    const r = await hud(["room", "create", "OPE-12-auth", "--title", "Auth rewrite", "--owner", "pm", "--member", "eng", "--member", "far", "--issue", "ope-12", "--pr", "#41"]);
    expect(r.code).toBe(0);
    expect(r.out.split("\n")[0]).toBe("room ope-12-auth created");
    expect(r.out.split("\n")[1]).toBe(`folder ${join(DATA, "rooms", "ope-12-auth")} (files/ is shared; anything saved there shows on the shelf)`);
    const v = await room("ope-12-auth");
    expect(v).toMatchObject({ slug: "ope-12-auth", title: "Auth rewrite", owner: "pm", members: ["eng", "far"], issues: ["OPE-12"], prs: ["41"], archivedAt: null });
    expect((await hud(["room", "create", "ope-12-auth", "--issue", "OPE-13"])).out).toStartWith("room ope-12-auth updated\n");
    expect((await room("ope-12-auth")).issues).toEqual(["OPE-12", "OPE-13"]);
  });

  test("create refuses a lane that is not registered, and a bad slug", async () => {
    const r = await hud(["room", "create", "x", "--title", "X", "--owner", "nobody"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("no lane named nobody");
    expect((await hud(["room", "create", "bad slug!", "--title", "X", "--owner", "pm"])).code).not.toBe(0);
  });

  test("brief: from --body, then from stdin, replaced as a whole", async () => {
    expect((await hud(["room", "brief", "ope-12-auth", "--body", "# Plan\nfirst"])).code).toBe(0);
    expect((await room("ope-12-auth")).brief).toBe("# Plan\nfirst");
    expect((await hud(["room", "brief", "ope-12-auth"], "## Now\n- tokens rotate\n- [the PR](https://example.com/pr)\n")).out).toBe("brief of ope-12-auth set");
    const v = await room("ope-12-auth");
    expect(v.brief).toBe("## Now\n- tokens rotate\n- [the PR](https://example.com/pr)");
    expect(v.briefBy).toBe("pm");
  });

  test("artifact: a Claude artifact link, a plain link and a file", async () => {
    expect((await hud(["room", "artifact", "ope-12-auth", "--title", "Design doc", "--url", "https://claude.ai/artifact/abc123"])).code).toBe(0);
    expect((await hud(["room", "artifact", "ope-12-auth", "--title", "Runbook", "--url", "https://example.com/runbook", "--as", "eng"])).code).toBe(0);
    const file = join(DATA, "trace notes.txt");
    writeFileSync(file, "line one\nline two\n");
    const up = await hud(["room", "artifact", "ope-12-auth", "--title", "Trace notes", "--file", file]);
    expect(up.code).toBe(0);
    expect(up.out).toMatch(/^artifact #\d+ \(file\) on ope-12-auth: http/);
    const shelf = (await room("ope-12-auth")).artifactList;
    expect(shelf.map((a: any) => [a.kind, a.title, a.by])).toEqual([["claude-artifact", "Design doc", "pm"], ["link", "Runbook", "eng"], ["file", "Trace notes", "pm"]]);
    const served = await fetch(`${BASE}${shelf[2].url}`);
    expect(await served.text()).toBe("line one\nline two\n");
    // An uploaded file shows but never runs: it is served sandboxed.
    expect(served.headers.get("content-security-policy")).toContain("sandbox");
    expect((await hud(["room", "artifact", "ope-12-auth", "--title", "x", "--url", "javascript:alert(1)"])).code).toBe(1);
  });

  test("say: the owning lane by default, a member with --as, a lane outside the room is refused", async () => {
    const a = await hud(["room", "say", "ope-12-auth", "Tokens", "rotate", "hourly", "now."]);
    expect(a.out).toMatch(/^message #\d+ in ope-12-auth$/);
    await hud(["room", "say", "ope-12-auth", "Tests are green.", "--as", "eng"]);
    expect((await hud(["room", "say", "ope-12-auth", "hi", "--as", "lead"])).err).toContain("lead is not in room ope-12-auth");
    const v = await room("ope-12-auth");
    expect(v.messages.map((m: any) => [m.who, m.text])).toEqual([["pm", "Tokens rotate hourly now."], ["eng", "Tests are green."]]);
    expect(v.unread).toBe(2);
  });

  test("the owner's message reaches the owning lane once, with the reply instruction", async () => {
    const { id } = await post("/api/rooms/ope-12-auth/post", { text: "Why hourly and not daily?" });
    const got = await promptsTo("pm", "Why hourly");
    expect(got.length).toBe(1);
    const [agent, verb, name, text] = got[0];
    expect([agent, verb, name]).toEqual(["agent", "prompt", "pm"]);
    expect(text).toStartWith(`HUD room ope-12-auth ("Auth rewrite"): Sam wrote to you, the room's owner (message #${id}):\nWhy hourly and not daily?\n`);
    expect(text).toContain(`hud room say ope-12-auth "<your reply>" [--reply ${id}]`);
    expect(text).toContain("hud room brief ope-12-auth");
    expect(text).toContain("hud room artifact ope-12-auth");
    expect(text).toContain(`\nRoom folder: ${join(DATA, "rooms", "ope-12-auth")} (files/ is shared; anything you save there shows on the shelf)\n`);
    expect((await room("ope-12-auth")).messages.at(-1)).toMatchObject({ id, who: "owner", to: "pm", delivery: "sent" });
  });

  test("To: a member lane gets it, told to answer with --as itself", async () => {
    const eng = (await room("ope-12-auth")).messages.find((m: any) => m.who === "eng");
    await post("/api/rooms/ope-12-auth/post", { text: "Which suite ran?", to: "eng", reply: eng.id });
    const got = await promptsTo("eng", "Which suite ran?");
    expect(got.length).toBe(1);
    expect(got[0][2]).toBe("eng");
    expect(got[0][3]).toContain(`replying to your message #${eng.id} ("Tests are green.")`);
    expect(got[0][3]).toContain(`hud room say ope-12-auth "<your reply>" --as eng`);
    expect(prompts().filter((p) => p.at(-1)!.includes("Which suite ran?")).length).toBe(1);
    await expect(post("/api/rooms/ope-12-auth/post", { text: "x", to: "lead" })).rejects.toThrow("lead is not in room");
  });

  test("a lane that is away keeps its message, and gets it once when herdr sees it again", async () => {
    await post("/api/rooms/ope-12-auth/post", { text: "Far lane, are you there?", to: "far" });
    await Bun.sleep(300);
    expect(prompts().some((p) => p.at(-1)!.includes("Far lane"))).toBe(false);
    const kept = (await room("ope-12-auth")).messages.at(-1);
    expect(kept).toMatchObject({ to: "far", delivery: "away" });
    expect((await get("/api/state")).rooms.find((r: any) => r.slug === "ope-12-auth").undelivered).toBe(1);
    agents(["pm", "eng", "far"]);
    await post("/api/sync", {});
    await post("/api/sync", {});
    const got = await promptsTo("far", "Far lane");
    expect(got.length).toBe(1);
    expect(got[0][3]).toContain("while you were away");
    expect((await room("ope-12-auth")).messages.at(-1)).toMatchObject({ id: kept.id, delivery: "sent" });
  });

  test("read: the owner's messages, --since, --json", async () => {
    const all = await hud(["room", "read", "ope-12-auth", "--json"]);
    const out = JSON.parse(all.out);
    expect(out.messages.map((m: any) => m.text)).toEqual(["Why hourly and not daily?", "Which suite ran?", "Far lane, are you there?"]);
    const second = out.messages[1].id;
    const since = JSON.parse((await hud(["room", "read", "ope-12-auth", "--since", String(second), "--json"])).out);
    expect(since.messages.map((m: any) => m.id)).toEqual([out.messages[2].id]);
    const text = await hud(["room", "read", "ope-12-auth", "--since", String(second)]);
    expect(text.out).toContain("owner -> far: Far lane, are you there?");
    expect(text.out).toContain(`next: hud room read ope-12-auth --since ${out.last}`);
  });

  test("read --wait returns when the owner writes, and not for a lane's message", async () => {
    const proc = Bun.spawn([process.execPath, join(ROOT, "hud.ts"), "room", "read", "ope-12-auth", "--wait", "--json"], { env: { ...process.env, HUD_URL: BASE }, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    let done = false;
    proc.exited.then(() => (done = true));
    await Bun.sleep(600);
    await hud(["room", "say", "ope-12-auth", "a lane talking"]);
    await Bun.sleep(400);
    expect(done).toBe(false);
    await post("/api/rooms/ope-12-auth/post", { text: "Ship it today." });
    const out = JSON.parse(await new Response(proc.stdout).text());
    expect(await proc.exited).toBe(0);
    expect(out.messages.map((m: any) => m.text)).toEqual(["Ship it today."]);
  });

  test("the room is in the state, and the owner reading it clears its unread count", async () => {
    let s = (await get("/api/state")).rooms.find((r: any) => r.slug === "ope-12-auth");
    expect(s).toMatchObject({ title: "Auth rewrite", owner: "pm", members: ["eng", "far"], issues: ["OPE-12", "OPE-13"], artifacts: 3 });
    expect(s.unread).toBe(3);
    expect(s.threadAt).toBeGreaterThan(Date.now() - 60_000);
    await post("/api/rooms/ope-12-auth/seen", {});
    s = (await get("/api/state")).rooms.find((r: any) => r.slug === "ope-12-auth");
    expect(s.unread).toBe(0);
  });

  test("list, and archive: the owner can no longer write, an agent still reads, create reopens", async () => {
    await hud(["room", "create", "side", "--title", "Side quest", "--owner", "lead"]);
    const list = await hud(["room", "list"]);
    expect(list.out).toContain(`ope-12-auth  "Auth rewrite"  owner pm  members eng, far  work OPE-12 OPE-13 #41`);
    expect(list.out).toContain(`side  "Side quest"  owner lead`);
    expect((await hud(["room", "archive", "side"])).out).toBe("room side archived");
    expect((await room("side")).archivedAt).toBeGreaterThan(0);
    await expect(post("/api/rooms/side/post", { text: "hello" })).rejects.toThrow("archived");
    expect((await hud(["room", "read", "side"])).code).toBe(0);
    expect(JSON.parse((await hud(["room", "list", "--json"])).out).find((r: any) => r.slug === "side").archivedAt).toBeGreaterThan(0);
    await hud(["room", "create", "side"]);
    expect((await room("side")).archivedAt).toBeNull();
  });

  test("hud room alone prints the usage", async () => {
    const r = await hud(["room"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("hud room create SLUG --title T --owner LANE");
  });

  test("the HQ guide tells HQ that work with an owning lane can get a room, kept current by that lane", () => {
    const line = GUIDE.split("\n").find((l) => l.includes("conference room"))!;
    expect(line).toContain("hud room create SLUG --title T --owner LANE");
    expect(line).toContain("the owning lane keeps its brief and artifacts current");
    expect(line).toContain("hud room path SLUG");
  });
});
