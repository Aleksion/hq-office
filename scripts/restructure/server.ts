// The plan for server.ts: which statement goes to which module under src/server, the request handler cut into
// route files, and the schema cut into one .sql file per table.
import { posix } from "node:path";
import ts from "typescript";
import { emit } from "./emit.ts";
import { type Analysis, checkOrder, comment, cut, dedent, link, parse, type Piece, pos, slug, subPiece } from "./split.ts";

const NAMES: Record<string, string[]> = {
  "config.ts": ["DIR", "DATA", "UPLOADS", "IMAGE_EXT", "MAX_UPLOAD", "PORT", "HOST", "HERDR", "LOCAL", "MACHINES", "CONFIG", "SYNC_MS", "STALE_MS"],
  "db.ts": ["db"],
  "types.ts": ["Lane", "Ask"],
  "push.ts": ["version", "listeners", "bump"],
  "events.ts": ["event"],
  "updates.ts": ["postUpdate"],
  "herdr.ts": ["untracked", "lastSync", "herdrList", "syncHerdr", "HQ_AGENT", "notifyHq"],
  "lanes.ts": ["laneStatus", "LANE_FIELDS", "upsertLane"],
  "score.ts": ["startOfDay", "score"],
  "state.ts": ["state"],
  "inbox.ts": ["inbox", "waitForInbox"],
  "asks.ts": ["createAsk", "answerAsk"],
  "machines.ts": ["STATS_MS", "STATS_KEEP_MS", "STATS_SCRIPT", "sshTarget", "readStats", "sampleMachines", "machineHealth", "machineHistory"],
  "json.ts": ["json"],
  // replaced by page.ts, which serves the page shell and the client files and watches them
  "page.ts": ["pageStamp", "page"],
};

const SECTIONS: Record<string, string> = {
  "herdr sync: which lanes are live, idle or gone": "herdr.ts",
  "derived view": "state.ts",
  "writes": "lanes.ts",
  "machine health: CPU, memory and load per machine, sampled once a minute": "machines.ts",
  "http": "json.ts",
};

export const DOCS: Record<string, string> = {
  "main.ts": "Starts the server: loads every module in the order server.ts ran them, then the herdr sync and the machine sampler.",
  "config.ts": "Settings from the environment: ports, paths, machines, the owner and links shown on the page.",
  "db.ts": "The SQLite database. Each table's schema is a file in schema/, applied at startup in name order.",
  "types.ts": "Row types shared by the modules.",
  "push.ts": "The state version and its listeners: bump() after a write, and every open stream and wait hears it.",
  "events.ts": "The event log (who did what), shown on the page.",
  "updates.ts": "Updates from HQ: information, no reply asked.",
  "herdr.ts": "herdr: which lanes are live, idle or gone, polled every 20 s, and typing answers and notes into HQ.",
  "lanes.ts": "Lanes: their status as the page shows it, and HQ's writes to them.",
  "score.ts": "The daily bank: points lost to waiting asks, won by quick answers.",
  "state.ts": "/api/state: everything the page draws, in one object. A feature adds its part with addStatePart.",
  "inbox.ts": "HQ's inbox: answers and notes it has not acked, and the long poll that waits for them.",
  "asks.ts": "Asks: HQ's questions, and answering them.",
  "machines.ts": "Machine health: CPU, memory and load per machine, sampled once a minute (machine-stats.sh).",
  "json.ts": "The JSON response helper every route uses.",
  "http.ts": "Bun.serve: hands every request to the router.",
};

// A route goes to routes/<first path segment>.ts; these segments join another file.
const GROUP_ALIAS: Record<string, string> = { wait: "inbox" };

const LOCAL_PARAMS = new Set(["req", "url", "path", "body", "m"]);

export type Route = { piece: Piece; method: "GET" | "POST"; raw: boolean; match: string; group: string; comment: string };

function groupOf(p: { path?: string; prefix?: string; pattern?: string }) {
  const s = p.path ?? p.prefix ?? p.pattern!.replace(/^\^/, "").replace(/\\\//g, "/");
  if (s === "/") return "page";
  const parts = s.split("/").filter(Boolean);
  const seg = parts[0] === "api" ? parts[1] : parts[0];
  const group = (seg ?? "misc").replace(/[^a-z0-9-]/gi, "") || "misc";
  return GROUP_ALIAS[group] ?? group;
}

// path === "/x", path.startsWith("/x/"), (m = path.match(/re/))
function matcher(cond: ts.Expression): { path?: string; prefix?: string; pattern?: string } | null {
  let c = cond;
  while (ts.isParenthesizedExpression(c)) c = c.expression;
  if (ts.isBinaryExpression(c) && c.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken && ts.isIdentifier(c.left) && c.left.text === "path" && ts.isStringLiteral(c.right)) return { path: c.right.text };
  if (ts.isCallExpression(c) && ts.isPropertyAccessExpression(c.expression) && c.expression.name.text === "startsWith" && ts.isIdentifier(c.expression.expression) && c.expression.expression.text === "path" && ts.isStringLiteral(c.arguments[0])) return { prefix: (c.arguments[0] as ts.StringLiteral).text };
  if (ts.isBinaryExpression(c) && c.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(c.left) && c.left.text === "m" && ts.isCallExpression(c.right) && ts.isPropertyAccessExpression(c.right.expression) && c.right.expression.name.text === "match" && ts.isRegularExpressionLiteral(c.right.arguments[0])) {
    const re = (c.right.arguments[0] as ts.RegularExpressionLiteral).text;
    return { pattern: re.slice(1, re.lastIndexOf("/")) };
  }
  return null;
}

export type ServerResult = { files: Map<string, string>; schema: Map<string, string>; routes: Map<string, string>; mainOrder: string[]; notes: string[]; problems: string[]; servePiece: Piece };

export function splitServer(src: string, opts: { movedRootModules: Map<string, string> }): ServerResult {
  const notes: string[] = [];
  const problems: string[] = [];
  const byName = new Map<string, string>();
  for (const [m, names] of Object.entries(NAMES)) for (const n of names) byName.set(n, m);
  const sectionRe = /^\s*\/\/ -{4} (.*?) -{4}\s*$/;
  const { sf, checker } = parse("server.ts", src, ts.ScriptKind.TS);
  const pieces = cut(src, sf, { sectionRe, moduleOfName: (n) => byName.get(n), splitDeclarators: false });

  const serve = pieces.find((p) => /^Bun\.serve\(/.test(p.text));
  if (!serve) throw new Error("server.ts: no Bun.serve(...) statement");
  let prev = "config.ts";
  let afterServe = false;
  const schema = new Map<string, string>();
  const pragmas: string[] = [];
  for (const p of pieces) {
    if (p.kind === "import") { p.module = "(external)"; continue; }
    if (p === serve) { p.module = "http.ts"; afterServe = true; prev = "main.ts"; continue; }
    // db.exec(`CREATE TABLE ...`): one .sql file per table
    const exec = p.text.match(/^db\.exec\(`([\s\S]*)`\);?$/);
    if (exec && !exec[1].includes("${")) {
      for (const raw of exec[1].split(";").map((s) => s.trim()).filter(Boolean)) {
        const t = raw.match(/^CREATE (?:TABLE|(?:UNIQUE )?INDEX)\s+IF NOT EXISTS\s+(\w+)(?:\s+ON\s+(\w+))?/i);
        if (/^PRAGMA/i.test(raw)) pragmas.push(raw + ";");
        else if (t) {
          const table = /INDEX/i.test(raw) ? t[2] : t[1];
          schema.set(table, (schema.get(table) ?? "") + raw + ";\n");
        } else problems.push(`schema: cannot place "${raw.slice(0, 60)}" in a table file`);
      }
      p.module = "db.ts";
      p.dropped = true;
      continue;
    }
    const named = p.names.map((n) => byName.get(n)).find(Boolean);
    let m = named;
    if (!m && afterServe) m = "main.ts";
    if (!m && p.sectionStart) {
      m = SECTIONS[p.section];
      if (!m) {
        m = `${slug(p.section)}.ts`;
        notes.push(`new section "${p.section}" -> src/server/${m}`);
      }
    }
    if (!m) {
      m = prev;
      if (p.names.length) notes.push(`${p.names.join(", ")} (not in the plan) -> src/server/${m}, with the statement above`);
    }
    p.module = m;
    prev = m;
    if (m === "page.ts") p.dropped = true;
    // the old page watcher: page.ts watches the page's files now
    if (/^watch\(DIR,/.test(p.text)) { p.module = "page.ts"; p.dropped = true; }
  }
  if (pragmas.join(" ") !== "PRAGMA journal_mode = WAL;") problems.push(`schema: expected only "PRAGMA journal_mode = WAL;", found ${pragmas.join(" ")}`);

  // ---- the request handler, cut into routes ----
  const call = (serve.node as ts.ExpressionStatement).expression as ts.CallExpression;
  const opts0 = call.arguments[0] as ts.ObjectLiteralExpression;
  const fetchProp = opts0.properties.find((p) => p.name && ts.isIdentifier(p.name) && p.name.text === "fetch") as ts.MethodDeclaration;
  const fetchBody = fetchProp.body!.statements;
  const tryStmt = fetchBody.find(ts.isTryStatement);
  if (!tryStmt) throw new Error("server.ts: fetch has no try { } block");
  const routes: Route[] = [];
  const add = (st: ts.IfStatement, method: "GET" | "POST", raw: boolean) => {
    const mt = matcher(st.expression);
    if (!mt) { problems.push(`route at ${pos(sf, st)}: the condition is not path === "..", path.startsWith("..") or (m = path.match(/../)); move it by hand`); return; }
    const then = st.thenStatement;
    const comment = src.slice(st.getFullStart(), st.getStart()).split("\n").map((l) => l.trim()).filter((l) => l.startsWith("//")).join("\n");
    const group = groupOf(mt);
    const piece = subPiece(pieces, serve, then, then.getStart(), then.end, { module: `routes/${group}.ts` });
    routes.push({ piece, method, raw, group, comment, match: mt.path !== undefined ? `path: ${JSON.stringify(mt.path)}` : mt.prefix !== undefined ? `prefix: ${JSON.stringify(mt.prefix)}` : `pattern: /${mt.pattern}/` });
  };
  const expect = (cond: boolean, what: string) => { if (!cond) problems.push(`fetch: ${what} is not as expected; compare src/server/router.ts with the old handler by hand`); };
  let seenBody = false, seenGet = false;
  for (const st of tryStmt.tryBlock.statements) {
    const t = st.getText();
    if (ts.isIfStatement(st) && /^req\.method === "GET"$/.test(st.expression.getText())) {
      seenGet = true;
      for (const g of (st.thenStatement as ts.Block).statements) {
        if (ts.isIfStatement(g)) add(g, "GET", false);
        else expect(/^return json\(\{ error: "not found" \}, 404\);$/.test(g.getText()), "the GET fallback");
      }
      continue;
    }
    if (/^if \(req\.method !== "POST" \|\| req\.headers\.get\("x-hud"\) !== "1"\) return json\(\{ error: "forbidden" \}, 403\);$/.test(t)) continue;
    if (/^const body = await req\.json\(\)\.catch\(\(\) => \(\{\}\)\);$/.test(t)) { seenBody = true; continue; }
    if (/^let m: RegExpMatchArray \| null;$/.test(t) || /^let result: unknown = \{ ok: true \};$/.test(t) || /^bump\(\);$/.test(t) || /^return json\(result\);$/.test(t)) continue;
    if (ts.isIfStatement(st)) {
      if (!seenBody) { add(st, "POST", true); continue; }
      // the else-if chain of JSON writes
      let s: ts.Statement | undefined = st;
      while (s && ts.isIfStatement(s)) {
        add(s, "POST", false);
        s = s.elseStatement;
      }
      if (s) expect(/^return json\(\{ error: "not found" \}, 404\);$/.test(s.getText()), "the POST fallback");
      continue;
    }
    problems.push(`fetch: unexpected statement at ${pos(sf, st)}: ${t.slice(0, 60)}`);
  }
  expect(seenGet && seenBody, "the GET block and the body parse");
  expect(/^return json\(\{ error: \(e as Error\)\.message \}, 400\);$/.test(tryStmt.catchClause?.block.statements[0]?.getText() ?? ""), "the catch");
  // overlapping routes would depend on order across files
  for (const r of routes) for (const o of routes) {
    if (r === o || r.method !== o.method || r.raw !== o.raw) continue;
    const exact = r.match.match(/^path: "(.*)"$/)?.[1];
    if (exact === undefined) continue;
    const pre = o.match.match(/^prefix: "(.*)"$/)?.[1];
    const pat = o.match.match(/^pattern: \/(.*)\/$/)?.[1];
    if ((pre !== undefined && exact.startsWith(pre)) || (pat !== undefined && new RegExp(pat).test(exact))) problems.push(`routes: ${r.method} ${exact} is also matched by ${o.match}; the router would pick by file order`);
  }

  const a: Analysis = link({ sf, checker, text: src, pieces }, [fetchProp]);
  // what the old handler itself used (json, bump) is the router's business now
  a.refs = a.refs.filter((r) => !(r.from === serve.idx && r.node.getStart() >= fetchProp.getStart() && r.node.end <= fetchProp.end));
  // a route may use the handler's own variables only through its context
  const params = new Map<Piece, Set<string>>();
  for (const [id] of a.locals) {
    const from = routes.find((r) => id.getStart() >= r.piece.start && id.getStart() < r.piece.end);
    if (!from) continue;
    if (!LOCAL_PARAMS.has(id.text) && id.text !== "result") problems.push(`route ${from.match}: uses ${id.text} from the old handler at ${pos(sf, id)}; pass it in by hand`);
    (params.get(from.piece) ?? params.set(from.piece, new Set()).get(from.piece)!).add(id.text);
  }

  const isAsync = (n: ts.Node): boolean => { let found = false; const v = (x: ts.Node) => { if (ts.isAwaitExpression(x)) found = true; else if (!ts.isFunctionLike(x)) ts.forEachChild(x, v); }; v(n); return found; };
  const reindent = (s: string, pad: string) => {
    const lines = s.split("\n");
    const min = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)![0].length));
    return lines.map((l) => (l.trim() ? pad + l.slice(min) : "")).join("\n");
  };
  const handler = (r: Route, body: (s: number, e: number) => string) => {
    const p = r.piece, n = p.node as ts.Statement;
    const used = [...(params.get(p) ?? [])].filter((x) => LOCAL_PARAMS.has(x)).sort((x, y) => ["req", "url", "path", "body", "m"].indexOf(x) - ["req", "url", "path", "body", "m"].indexOf(y));
    const sig = `${isAsync(n) ? "async " : ""}(${used.length ? `{ ${used.join(", ")} }` : ""}) =>`;
    const col = " ".repeat(sf.getLineAndCharacterOfPosition(p.start).character);
    const text = body(p.start, p.end);
    const usesResult = params.get(p)?.has("result");
    const expr = (e: string) => {
      const out = reindent(col + e, "  ").trimStart();
      return `${sig} ${out.startsWith("{") ? `(${out})` : out}`;
    };
    if (ts.isReturnStatement(n) && n.expression) return expr(text.replace(/^return\s+/, "").replace(/;\s*$/, ""));
    if (ts.isExpressionStatement(n)) {
      const asg = n.expression;
      if (ts.isBinaryExpression(asg) && ts.isIdentifier(asg.left) && asg.left.text === "result" && asg.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        return expr(text.slice(asg.right.getStart() - p.start, asg.right.end - p.start));
      }
      return `${sig} {\n${reindent(col + text, "    ")}\n  }`;
    }
    if (ts.isBlock(n)) {
      const inner = reindent(text.slice(1, -1).replace(/^\s*\n/, "").replace(/\s+$/, ""), "    ");
      return usesResult
        ? `${sig} {\n    let result: unknown = { ok: true };\n${inner}\n    return result;\n  }`
        : `${sig} {\n${inner}\n  }`;
    }
    return `${sig} {\n${reindent(col + text, "    ")}\n  }`;
  };

  const header = (m: string) => {
    if (m.startsWith("routes/")) return `// Routes for ${m.slice(7, -3)}. The router loads every file in this folder; see src/server/router.ts.\n`;
    return comment(DOCS[m] ?? "Moved here from server.ts.");
  };
  const routeOf = new Map(routes.map((r) => [r.piece, r]));
  const handlerText = new Map<Piece, string>();
  const routeFiles = new Set(routes.map((r) => r.piece.module));
  const out = emit(a, {
    ext: ".ts",
    sectionRe,
    header,
    respec: (spec, from) => {
      if (!spec.startsWith(".")) return spec;
      const target = posix.normalize(spec).replace(/^\.\//, ""); // relative to the repo root, where server.ts was
      const moved = opts.movedRootModules.get(target) ?? target;
      const r = posix.relative(posix.dirname(`src/server/${from}`), moved);
      return r.startsWith(".") ? r : `./${r}`;
    },
    custom: (p, body) => {
      if (p === serve) {
        const keep = opts0.properties.filter((x) => x !== fetchProp).map((x) => x.getText());
        return `${src.slice(p.start, p.node.getStart())}Bun.serve({\n${keep.map((k) => `  ${k},\n`).join("")}  fetch: handle,\n});\n`;
      }
      const r = routeOf.get(p);
      if (r) { handlerText.set(p, handler(r, body)); return ""; }
      return null;
    },
    extraImports: new Map([["http.ts", [`import { handle } from "./router.ts";`]]]),
  });
  // route files: an array of { method, match, handle }, with the imports the linker found
  for (const f of routeFiles) {
    const imports = (out.files.get(f) ?? "").split("\n").filter((l) => l.startsWith("import ")).join("\n");
    const entries = routes
      .filter((r) => r.piece.module === f)
      .map((r) => `${r.comment ? `  ${r.comment.replace(/\n/g, "\n  ")}\n` : ""}  { method: "${r.method}", ${r.match}${r.raw ? ", raw: true" : ""}, handle: ${handlerText.get(r.piece)} },`)
      .join("\n");
    out.files.set(f, `${header(f)}${imports ? imports + "\n" : ""}import type { Route } from "../router.ts";\n\nconst routes: Route[] = [\n${entries}\n];\nexport default routes;\n`);
  }
  const mainOrder = [...new Set(pieces.filter((p) => p.kind !== "part" && p.module !== "(external)" && !p.dropped && !routeFiles.has(p.module)).map((p) => p.module))];
  problems.push(...checkOrder(a, mainOrder, out.deps));
  notes.push(...out.setters.map((s) => `setter ${s}`));
  const routeIndex = new Map<string, string>();
  for (const r of routes) routeIndex.set(`${r.method} ${r.match}${r.raw ? " (raw)" : ""}`, r.piece.module);
  return { files: out.files, schema, routes: routeIndex, mainOrder, notes, problems, servePiece: serve };
}
