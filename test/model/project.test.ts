// The project panel's data, the links on a question, panels over the room taking turns, and what Escape closes first
// (src/client/core/floors.js and panel.js). No browser.
import { describe, expect, test } from "bun:test";
import { askLinks, escapeAction, issueLink, prLink, projectView } from "../../src/client/core/floors.js";

const lane = (name: string, status = "moving", floor = "hq", extra: object = {}) => ({ name, floor, heads: false, status, title: `${name} title`, ...extra });
const room = (slug: string, owner: string, extra: object = {}) => ({ slug, title: slug.toUpperCase(), owner, members: [], issues: [], prs: [], createdAt: 1, archivedAt: null, ...extra });
const S: any = {
  lanes: [lane("pm", "moving", "hq", { issue: "REL-1 REL-2", pr: "12, acme-example/app#7" }), lane("api"), lane("web", "blocked"), lane("solo")],
  open: [{ id: 1, lane: "api", title: "Ship?", created_at: 5 }],
  rooms: [room("release", "pm", { members: ["api", "web"], issues: ["REL-1"], prs: ["acme-example/app#7"] }), room("old", "pm", { archivedAt: 9 }), room("other", "web")],
  board: { items: [{ issue: "REL-1", state: "ci", why: "a check is running", prs: [{ key: "acme-example/app#7", state: "OPEN", ci: "running", draft: false }] }] },
};
const CONFIG = { linearWorkspace: "acme-example", githubRepo: "acme-example/app" };

describe("links on a question", () => {
  test("the open projects the lane is in, as owner or member, and its issue and pull requests", () => {
    expect(askLinks(S, CONFIG, { lane: "pm" }).projects.map((p: any) => p.slug)).toEqual(["release"]);
    expect(askLinks(S, CONFIG, { lane: "api" }).projects.map((p: any) => p.slug)).toEqual(["release"]);
    expect(askLinks(S, CONFIG, { lane: "web" }).projects.map((p: any) => p.slug)).toEqual(["release", "other"]);
    const pm = askLinks(S, CONFIG, { lane: "pm" });
    expect(pm.issues).toEqual([{ key: "REL-1", href: "https://linear.app/acme-example/issue/REL-1" }, { key: "REL-2", href: "https://linear.app/acme-example/issue/REL-2" }]);
    expect(pm.prs.map((p: any) => [p.num, p.href])).toEqual([["12", "https://github.com/acme-example/app/pull/12"], ["7", "https://github.com/acme-example/app/pull/7"]]);
  });

  test("no tag for a lane in no project, a question with no lane, or an archived room; no link without a workspace or repo", () => {
    expect(askLinks(S, CONFIG, { lane: "solo" })).toEqual({ projects: [], issues: [], prs: [] });
    expect(askLinks(S, CONFIG, { lane: null })).toEqual({ projects: [], issues: [], prs: [] });
    expect(askLinks({ ...S, rooms: [room("old", "solo", { archivedAt: 9 })] }, CONFIG, { lane: "solo" }).projects).toEqual([]);
    expect(issueLink({}, "REL-1").href).toBeNull();
    expect(prLink({}, "12").href).toBeNull();
    expect(prLink({}, "acme-example/app#7").href).toBe("https://github.com/acme-example/app/pull/7");
    expect(prLink(CONFIG, "#12").key).toBe("12");
  });
});

describe("the project panel's data", () => {
  test("state, open calls, who is on it and the linked work with its board state", () => {
    const v = projectView(S, CONFIG, "release")!;
    expect(v.state).toBe("waiting");
    expect(v.calls.map((a: any) => a.id)).toEqual([1]);
    expect(v.lanes.map((l: any) => [l.name, l.owner, l.help])).toEqual([["pm", true, null], ["api", false, null], ["web", false, "blocked"]]);
    expect(v.issues[0]).toMatchObject({ key: "REL-1", board: { state: "ci" } });
    expect(v.prs[0]).toMatchObject({ key: "acme-example/app#7", num: "7", pr: { state: "OPEN" }, board: { issue: "REL-1" } });
    expect(v.floor).toBe("hq");
  });

  test("no panel for a room that is archived or does not exist", () => {
    expect(projectView(S, CONFIG, "old")).toBeNull();
    expect(projectView(S, CONFIG, "nope")).toBeNull();
    expect(projectView({ ...S, rooms: undefined }, CONFIG, "release")).toBeNull();
  });
});

describe("Escape", () => {
  const idle = { stage: false, settings: false, dialog: false, typing: false, panel: false };
  const scoped = { floor: "g", agent: "g-pm", all: false };

  test("an open panel closes before the scope is touched, then the scope steps out", () => {
    expect(escapeAction(scoped, { ...idle, panel: true })).toBe("panel");
    expect(escapeAction(scoped, idle)).toBe("out");
    expect(escapeAction({ floor: null, agent: null, all: false }, { ...idle, panel: true })).toBe("panel");
  });

  test("a room on the stage, SETTINGS, a dialog or a text field keep the key even with a panel open", () => {
    for (const busy of ["stage", "settings", "dialog", "typing"]) expect(escapeAction(scoped, { ...idle, panel: true, [busy]: true })).toBeNull();
  });
});
