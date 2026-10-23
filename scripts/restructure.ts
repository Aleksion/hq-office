#!/usr/bin/env bun
// Splits the two big files into the src/ tree, mechanically, so it can run again on a main that has moved on.
//
//   cd scripts && bun install && cd ..      (once: the TypeScript parser this script uses)
//   bun scripts/restructure.ts [--root=DIR] [--dry-run]
//
// It reads index.html and server.ts, writes public/, src/client/, src/server/, the new tests and docs, moves
// machine-stats.sh and any root module server.ts imports, and replaces server.ts with a one-line entry. It never
// touches git, hud.db or uploads. It stops before writing anything when the split finds a problem it cannot
// solve, and prints a checklist for what is left to do by hand.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { DOCS as CLIENT_DOCS, splitClient } from "./restructure/client.ts";
import { splitCss } from "./restructure/css.ts";
import { splitServer } from "./restructure/server.ts";
import { comment } from "./restructure/split.ts";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const ROOT = resolve(arg("root") ?? join(import.meta.dir, ".."));
const DRY = process.argv.includes("--dry-run");
const TEMPLATES = join(import.meta.dir, "restructure", "templates");
const r = (p: string) => join(ROOT, p);
const read = (p: string) => readFileSync(r(p), "utf8");

const notes: string[] = [];
const checklist: string[] = [];
const problems: string[] = [];
const writes = new Map<string, string>();
const moves: [string, string][] = [];

if (existsSync(r("src"))) die("src/ already exists: this tree looks restructured already.");
if (!existsSync(r("index.html")) || !existsSync(r("server.ts"))) die("index.html and server.ts must both be at the root.");

// ---- client ----
const html = read("index.html");
const parts = html.match(/^([\s\S]*?)<style>\n([\s\S]*?)<\/style>\n([\s\S]*?)<script>\n([\s\S]*?)<\/script>\n([\s\S]*)$/);
if (!parts) die("index.html: expected one <style> block in the head and one <script> block at the end of the body.");
const [, htmlHead, css, htmlBody, js, htmlTail] = parts;
if ((htmlBody + htmlHead).includes("<script")) problems.push("index.html: there is another <script> tag besides the big one; move it by hand.");
if (/\son[a-z]+="/.test(htmlBody)) problems.push("index.html: an inline on...= handler in the markup would not see module functions; move it into a module.");

const client = splitClient(js);
notes.push(...client.notes.map((n) => `client: ${n}`));
problems.push(...client.problems.map((p) => `client load order: ${p}`));
for (const [m, text] of client.files) writes.set(`src/client/${m}`, text);

// The hooks a feature listens to (core/bus.js). Each is one line in a built-in module; a missing anchor is left to the checklist.
const hook = (file: string, find: RegExp, replace: string, importLine: string, what: string) => {
  const t = writes.get(file);
  if (!t || !find.test(t)) { checklist.push(`Add the "${what}" hook by hand in ${file} (its anchor moved): ${replace.trim()}`); return; }
  const lines = t.replace(find, replace).split("\n");
  if (importLine && !lines.includes(importLine)) lines.splice(lines.findIndex((l) => !l.startsWith("//")), 0, importLine);
  writes.set(file, lines.join("\n"));
};
hook("src/client/core/boot.js", /(\n( *)renderStats\(\); renderHud\(\);[^\n]*\n)/, `$1$2emit("state", S);\n`, `import { emit } from "./bus.js";`, "state");
hook("src/client/core/boot.js", /setInterval\(\(\) => \{ if \(S\) \{ tick\(\); renderStats\(\); \} \}, 1000\);/, `setInterval(() => { if (S) { tick(); renderStats(); emit("tick"); } }, 1000);`, `import { emit } from "./bus.js";`, "tick");
hook("src/client/room/loop.js", /\n  requestAnimationFrame\(loop\);\n\}\n(?![\s\S]*\n  requestAnimationFrame\(loop\);\n\}\n)/, `\n  emit("room:draw", now);\n  requestAnimationFrame(loop);\n}\n`, `import { emit } from "../core/bus.js";`, "room:draw");

writes.set("src/client/main.js", `${comment(CLIENT_DOCS["main.js"])}${client.mainOrder.map((m) => `import "./${m}";`).join("\n")}\n`);

const cssOut = splitCss(css);
notes.push(...cssOut.notes.map((n) => `css: ${n}`));
for (const [f, text] of cssOut.files) writes.set(`src/client/${f}`, text);
for (const f of cssOut.files.keys()) if (!f.startsWith("core/") && !client.files.has(f.replace(/\.css$/, ".js")) && ![...client.files.keys()].some((m) => m.startsWith(f.split("/")[0] + "/"))) notes.push(`css: ${f} has no module beside it`);

const shell = `${htmlHead.replace(/\n$/, "")}\n<!-- styles: every .css under src/client, linked by the server (core/ first, then by path) -->\n<!-- styles -->\n${htmlBody}<script type="module" src="/src/client/main.js"></script>\n<!-- features: every src/client/<name>/index.js, loaded by the server after main.js -->\n<!-- features -->\n${htmlTail}`;
writes.set("public/index.html", shell);

// ---- server ----
const serverSrc = read("server.ts");
const movedRoot = new Map<string, string>();
for (const m of serverSrc.matchAll(/from "\.\/([\w.-]+\.ts)"/g)) {
  if (m[1] === "hud.ts") continue;
  movedRoot.set(m[1], `src/server/${m[1]}`);
  moves.push([m[1], `src/server/${m[1]}`]);
}
const server = splitServer(serverSrc, { movedRootModules: movedRoot });
notes.push(...server.notes.map((n) => `server: ${n}`));
problems.push(...server.problems.map((p) => `server: ${p}`));
for (const [m, text] of server.files) writes.set(`src/server/${m}`, text);
for (const [table, sql] of server.schema) writes.set(`src/server/schema/${table}.sql`, `-- The ${table} table. Applied at every start; IF NOT EXISTS keeps existing data.\n${sql}`);

const patch = (file: string, find: string | RegExp, replace: string, why: string) => {
  const t = writes.get(file);
  if (t === undefined || !(typeof find === "string" ? t.includes(find) : find.test(t))) { problems.push(`${file}: could not ${why}; do it by hand`); return; }
  writes.set(file, t.replace(find, replace));
};
const addImport = (file: string, line: string) => {
  const t = writes.get(file);
  if (t === undefined) return;
  const lines = t.split("\n");
  const at = lines.findIndex((l) => !l.startsWith("//"));
  lines.splice(at, 0, line);
  writes.set(file, lines.join("\n"));
};
patch("src/server/config.ts", /\n(export )?const DIR = import\.meta\.dir;/, `\n// The repo root: the server is started from there (bun server.ts) and serves the page from there.\n$1const DIR = resolve(import.meta.dir, "..", "..");`, "point DIR at the repo root");
addImport("src/server/config.ts", `import { resolve } from "node:path";`);
patch("src/server/machines.ts", "`${DIR}/machine-stats.sh`", "`${DIR}/src/server/machine-stats.sh`", "move the machine-stats.sh path");
moves.push(["machine-stats.sh", "src/server/machine-stats.sh"]);
patch("src/server/routes/page.ts", /import \{ page \} from "\.\.\/page\.ts";/, `import { shell } from "../page.ts";`, "serve the shell from page.ts");
patch("src/server/routes/page.ts", /handle: \(\) => new Response\(page, /, `handle: async () => new Response(await shell(), `, "serve the shell from page.ts");
// db.ts: the pragma, then every table's schema file
writes.set("src/server/db.ts", (writes.get("src/server/db.ts") ?? "").replace(/\n?$/, "\n") + `db.exec("PRAGMA journal_mode = WAL;");\nconst SCHEMA = join(import.meta.dir, "schema");\nfor (const f of readdirSync(SCHEMA).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(SCHEMA, f), "utf8"));\n`);
addImport("src/server/db.ts", `import { join } from "node:path";`);
addImport("src/server/db.ts", `import { readdirSync, readFileSync } from "node:fs";`);
// state.ts: a feature's own part of the state, without editing state()
patch("src/server/state.ts", /(\n( +)machines: machineHealth\(\),\n)/, `$1$2...stateParts(),\n`, "add the stateParts() hook to state()");
writes.set("src/server/state.ts", writes.get("src/server/state.ts") + `\n// A feature adds its own part of the state here instead of editing state(): addStatePart("board", () => board.view()).\nconst parts = new Map<string, () => unknown>();\nexport function addStatePart(key: string, value: () => unknown) {\n  parts.set(key, value);\n}\nfunction stateParts() {\n  return Object.fromEntries([...parts].map(([k, value]) => [k, value()]));\n}\n`);
// main.ts runs every module in the old order, then its own statements
{
  const t = writes.get("src/server/main.ts") ?? "";
  const lines = t.split("\n");
  const header = lines.filter((l) => l.startsWith("//") && lines.indexOf(l) < 2);
  const named = lines.filter((l) => l.startsWith("import "));
  const rest = lines.filter((l) => !l.startsWith("import ") && !header.includes(l)).join("\n").replace(/^\n+/, "");
  const side = server.mainOrder.filter((m) => m !== "main.ts").map((m) => `import "./${m}";`);
  writes.set("src/server/main.ts", `${header.join("\n")}\n${side.join("\n")}\n${named.join("\n")}\n\n${rest}`);
}
writes.set("server.ts", `// HQ Office server. The code is in src/server/ (see AGENTS.md); this file stays so \`bun server.ts\` keeps\n// working for the service, the herdr plugin and the tests.\nimport "./src/server/main.ts";\n`);

// ---- templates: hand-written modules, tests and docs ----
const SKIP = new Set(["node_modules", ".git", "uploads", ".data"]);
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (SKIP.has(e.name) ? [] : e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
for (const f of walk(TEMPLATES)) {
  // templates end in .tmpl so bun test and the type checker leave them alone inside scripts/
  const rel = relative(TEMPLATES, f).split("\\").join("/").replace(/\.tmpl$/, "");
  if (rel.startsWith("AGENTS.")) continue;
  if (writes.has(rel)) problems.push(`template ${rel} would overwrite a generated file`);
  writes.set(rel, readFileSync(f, "utf8"));
}

// AGENTS.md: the old file map becomes the new one; every rule stays.
{
  let agents = read("AGENTS.md");
  const section = readFileSync(join(TEMPLATES, "AGENTS.section.md.tmpl"), "utf8");
  const before = agents;
  agents = agents
    .replace(/^- `server\.ts`:.*\n/m, "- `server.ts`, `public/`, `src/`: the server and the page, one file per concern (see the map below).\n")
    .replace(/^- `index\.html`:.*\n/m, "");
  agents = agents.replace(
    /After a server\.ts change: (`launchctl kickstart [^`]+`)\. index\.html is read on every request; a reload is enough\./,
    "After a change under src/server/ (or server.ts): $1. The page's files (public/, src/client/) are read on every request; a reload is enough, and open pages reload themselves.",
  );
  if (agents === before) checklist.push("AGENTS.md: the old server.ts/index.html lines were not found; check the file map by hand.");
  if (/`index\.html`|server\.ts change/.test(agents)) checklist.push("AGENTS.md still names the old single files somewhere; update those lines.");
  writes.set("AGENTS.md", agents.replace(/\s*$/, "\n\n") + section);
}

// README: a pointer to the map
{
  const readme = read("README.md");
  const anchor = "Run the tests with `bun test`.";
  if (readme.includes(anchor)) {
    writes.set("README.md", readme.replace(anchor, `${anchor}\n\n## Working on it\n\nNo build step: \`public/index.html\` is the page shell, \`src/client/\` the page as plain ES modules (one folder per area), \`src/server/\` the server (one file per concern, routes in \`src/server/routes/\`, one schema file per table in \`src/server/schema/\`). \`AGENTS.md\` has the map and the rules for working on it in parallel; \`docs/structure.md\` explains the layout and its trade-offs.`));
  } else checklist.push("README.md: add a pointer to AGENTS.md and docs/structure.md.");
}

// Tests and root modules that import a module that moves get the new path.
const importers = walk(ROOT).filter((f) => /\.(ts|js)$/.test(f) && !/^(scripts|src|public)\//.test(relative(ROOT, f)) && relative(ROOT, f) !== "server.ts");
for (const f of importers) {
  let t = readFileSync(f, "utf8");
  const before = t;
  for (const [from, to] of movedRoot) {
    t = t.replace(/(from\s+|import\(\s*)"(\.{1,2}\/[^"]+)"/g, (all, kw, spec) => {
      const abs = posix.normalize(posix.join(posix.dirname(relative(ROOT, f)), spec));
      if (abs !== from) return all;
      let n = posix.relative(posix.dirname(relative(ROOT, f)), to);
      if (!n.startsWith(".")) n = `./${n}`;
      return `${kw}"${n}"`;
    });
  }
  if (t !== before) { writes.set(relative(ROOT, f), t); notes.push(`imports: ${relative(ROOT, f)} now imports the moved module from src/server/`); }
}

// ---- report, then write ----
const section = (title: string, lines: string[]) => lines.length && console.log(`\n${title}\n${lines.map((l) => `  - ${l}`).join("\n")}`);
const srcCount = [...writes.keys()].filter((k) => k.startsWith("src/"));
console.log(`restructure: ${ROOT}`);
console.log(`  ${[...client.files.keys()].length} client modules, ${cssOut.files.size} stylesheets, ${[...server.files.keys()].length} server modules, ${server.schema.size} schema files, ${srcCount.length} files under src/`);
console.log(`  routes: ${[...server.routes].map(([k, v]) => `${k} -> ${v}`).join("; ")}`);
section("Notes (check these placements):", notes);
if (problems.length) {
  section("Problems (nothing was written):", problems);
  process.exit(1);
}
checklist.push(
  "Run `bun test`: the existing tests, the module link check, the server start check and the room pixel check (needs Chrome).",
  "Open the page against a temporary server at 1440x900: no console errors, no page scroll, the question panel answers.",
  "Move any test that is really a server or client test into test/server/ or test/client/ when you next touch it (paths inside it are relative).",
  "Commit: `git add -A && git commit` (index.html and the old server.ts body are gone; their content is under public/ and src/).",
  "Restart the service (the launchctl kickstart line in AGENTS.md): the server's code moved.",
);
if (DRY) {
  console.log(`\nDry run: would write ${writes.size} files and move ${moves.map(([a, b]) => `${a} -> ${b}`).join(", ")}.`);
  section("Then by hand:", checklist);
  process.exit(0);
}
for (const [from, to] of moves) {
  if (!existsSync(r(from))) { checklist.push(`${from} was expected at the root (for ${to}); it was not there.`); continue; }
  mkdirSync(dirname(r(to)), { recursive: true });
  renameSync(r(from), r(to));
}
for (const [f, text] of writes) {
  mkdirSync(dirname(r(f)), { recursive: true });
  writeFileSync(r(f), text);
}
rmSync(r("index.html"));
section("Then by hand:", checklist);

function die(msg: string): never {
  console.error(`restructure: ${msg}`);
  process.exit(1);
}
