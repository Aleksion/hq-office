// RUNDOWN's data (src/client/core/floors.js): each floor in scope with who needs help and its open projects, their state,
// owner, open calls and brief. A scope lists its floor alone. No browser.
import { describe, expect, test } from "bun:test";
import { on } from "../../src/client/core/bus.js";
import { closePanel, openPanel, showPanel } from "../../src/client/core/panel.js";
import { briefExcerpt, escapeAction, rundown } from "../../src/client/core/floors.js";

const lane = (name: string, status: string, floor: string, extra: object = {}) => ({ name, floor, heads: false, status, title: name, ...extra });
const room = (slug: string, owner: string, createdAt: number, extra: object = {}) => ({ slug, title: slug.toUpperCase(), owner, members: [], issues: [], prs: [], createdAt, archivedAt: null, ...extra });
// Three floors (HQ, FIN, SALES); FIN has a stalled lane and a project, SALES has two projects and a question waiting.
const S: any = {
  lanes: [
    lane("pm", "moving", "hq"), lane("web", "blocked", "hq"),
    lane("fin", "hq_turn", "fin", { heads: true }), lane("recon", "stale", "fin"),
    lane("sales", "hq_turn", "sales", { heads: true }), lane("outb", "needs_you", "sales"), lane("lead", "moving", "sales"),
  ],
  open: [{ id: 1, lane: "outb", title: "Take the call?", created_at: 5 }],
  rooms: [
    room("release", "pm", 1), room("web-fix", "web", 2),
    room("recon", "recon", 3), room("old", "recon", 4, { archivedAt: 9 }),
    room("outbound", "outb", 6), room("pipeline", "lead", 5),
  ],
  board: { items: [] },
};
const BRIEFS = { release: "Cut the branch.\n\n  Tag it.", recon: "Close March." };
const ALL = { floor: null, agent: null };

describe("RUNDOWN's entries", () => {
  test("every floor, HQ first, each with its open projects oldest first and the archived ones left out", () => {
    const r = rundown(S, ALL, BRIEFS);
    expect(r.map((f: any) => f.id)).toEqual(["hq", "fin", "sales"]);
    expect(r.map((f: any) => f.projects.map((p: any) => p.slug))).toEqual([["release", "web-fix"], ["recon"], ["pipeline", "outbound"]]);
  });

  test("a project carries its state, owner, open calls and brief; one with no brief has none", () => {
    const r = rundown(S, ALL, BRIEFS);
    const by = Object.fromEntries(r.flatMap((f: any) => f.projects).map((p: any) => [p.slug, p]));
    expect(by.release).toMatchObject({ title: "RELEASE", owner: "pm", state: "moving", name: "MOVING", calls: 0, brief: "Cut the branch. Tag it." });
    expect(by["web-fix"]).toMatchObject({ state: "blocked", brief: null });
    expect(by.recon).toMatchObject({ state: "stalled", brief: "Close March." });
    expect(by.outbound).toMatchObject({ state: "waiting", calls: 1, brief: null });
    expect(by.pipeline.brief).toBeNull(); // not fetched yet: nothing stands in for it
  });

  test("a floor lists who needs help there, worst first, and its general only when it is not simply idle", () => {
    const r = rundown(S, ALL, {});
    expect(r[0].help).toEqual([{ lane: "web", state: "blocked" }]);
    expect(r[1].help).toEqual([{ lane: "recon", state: "stalled" }]); // fin waits on HQ: its normal state
    expect(r[2].help).toEqual([{ lane: "outb", state: "waiting" }]);
  });

  test("a floor with no project is still an entry, with none", () => {
    expect(rundown({ ...S, rooms: [] }, ALL).every((f: any) => f.projects.length === 0)).toBe(true);
  });
});

describe("RUNDOWN scoped (build note 2: inside a scope it shows only that floor)", () => {
  test("a floor in scope lists that floor alone", () => {
    const r = rundown(S, { floor: "sales", agent: null }, BRIEFS);
    expect(r.map((f: any) => f.id)).toEqual(["sales"]);
    expect(r[0].projects.map((p: any) => p.slug)).toEqual(["pipeline", "outbound"]);
  });

  test("an agent in scope lists its floor alone", () => {
    expect(rundown(S, { floor: null, agent: "recon" }).map((f: any) => f.id)).toEqual(["fin"]);
  });

  test("SHOW ALL gives the view {null, null}, and with it every floor", () => {
    expect(rundown(S, { floor: null, agent: null }).length).toBe(3);
  });

  test("one floor is one entry whatever the scope", () => {
    const one: any = { ...S, lanes: S.lanes.filter((l: any) => l.floor === "hq" ), rooms: S.rooms.filter((r: any) => ["release", "web-fix"].includes(r.slug)), open: [] };
    expect(rundown(one, ALL).map((f: any) => f.id)).toEqual(["hq"]);
    expect(rundown(one, { floor: null, agent: "pm" }).map((f: any) => f.id)).toEqual(["hq"]);
  });
});

describe("a brief as a line", () => {
  test("whitespace folds and a long brief is cut with an ellipsis", () => {
    expect(briefExcerpt("  a\n\n b  ")).toBe("a b");
    const long = briefExcerpt("word ".repeat(200))!;
    expect(long.length).toBeLessThanOrEqual(280);
    expect(long.endsWith("…")).toBe(true);
  });
  test("nothing, or only space, is no brief", () => {
    expect(briefExcerpt(null)).toBeNull();
    expect(briefExcerpt(" \n ")).toBeNull();
  });
});

describe("RUNDOWN takes its turn among the panels over the room", () => {
  const seen = () => {
    const ids: any[] = [];
    const off = on("panel", (id: any) => ids.push(id));
    return { ids, off };
  };
  test("opening it announces it, so an open panel closes itself; opening another announces that one", () => {
    showPanel(null);
    const { ids, off } = seen();
    showPanel("project", { slug: "release" });
    showPanel("rundown");
    expect(openPanel()).toBe("rundown");
    showPanel("accounts");
    expect(openPanel()).toBe("accounts");
    expect(ids).toEqual(["project", "rundown", "accounts"]);
    showPanel(null);
    off();
  });

  test("it closes itself only while it is the one open: a conference room opening must not close the project panel", () => {
    showPanel(null);
    showPanel("project", { slug: "release" });
    closePanel("rundown");
    expect(openPanel()).toBe("project");
    showPanel("rundown");
    closePanel("rundown");
    expect(openPanel()).toBeNull();
  });

  test("Escape closes it before it touches the scope, and the next Escape steps the scope out", () => {
    const quiet = { stage: false, settings: false, dialog: false, typing: false };
    const scoped = { floor: "fin", agent: null, all: false };
    showPanel(null);
    showPanel("rundown");
    expect(escapeAction(scoped, { ...quiet, panel: openPanel() !== null })).toBe("panel");
    closePanel();
    expect(escapeAction(scoped, { ...quiet, panel: openPanel() !== null })).toBe("out");
  });
});
