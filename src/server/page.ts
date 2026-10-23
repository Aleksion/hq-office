// The page, with no build step: the shell (public/index.html) and the client files under src/client, served as
// they are. The shell links every stylesheet it finds (core/ first, then by path) and loads every feature folder
// (src/client/<name>/index.js) after main.js, so adding either is adding a file. When any page file changes, the
// stamp changes, it rides on the next state, and every open page reloads itself.
import { readdirSync, statSync, watch } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { DIR } from "./config.ts";
import { bump } from "./push.ts";

const SHELL = join(DIR, "public", "index.html");
const CLIENT = join(DIR, "src", "client");
const TYPES: Record<string, string> = { ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

function clientFiles(dir = CLIENT): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...clientFiles(p));
    else if (TYPES[extname(e.name)]) out.push(p);
  }
  return out;
}

export async function shell() {
  const files = clientFiles().map((f) => relative(DIR, f).split(sep).join("/")).sort();
  const css = files.filter((f) => f.endsWith(".css"));
  const ordered = [...css.filter((f) => f.startsWith("src/client/core/")), ...css.filter((f) => !f.startsWith("src/client/core/"))];
  const features = files.filter((f) => /^src\/client\/[^/]+\/index\.js$/.test(f));
  const html = await Bun.file(SHELL).text();
  return html
    .replace("<!-- styles -->", ordered.map((f) => `<link rel="stylesheet" href="/${f}">`).join("\n"))
    .replace("<!-- features -->", features.map((f) => `<script type="module" src="/${f}"></script>`).join("\n"));
}

// A client file, revalidated on every load (no-cache) so an edit shows on reload; unchanged files answer 304.
export async function clientFile(path: string, req: Request): Promise<Response | null> {
  const rel = decodeURIComponent(path.slice(1));
  if (!/^src\/client\/[\w./-]+$/.test(rel) || rel.includes("..") || !TYPES[extname(rel)]) return null;
  const file = Bun.file(join(DIR, rel));
  if (!(await file.exists())) return null;
  const tag = `"${file.lastModified.toString(36)}-${file.size.toString(36)}"`;
  const headers = { "content-type": TYPES[extname(rel)], "cache-control": "no-cache", etag: tag };
  if (req.headers.get("if-none-match") === tag) return new Response(null, { status: 304, headers });
  return new Response(file, { headers });
}

let stamp = 0;
function restamp() {
  try {
    let h = 2166136261;
    for (const f of [SHELL, ...clientFiles()].sort()) for (const c of `${f}:${statSync(f).mtimeMs};`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    stamp = h >>> 0;
  } catch {
    stamp = 0;
  }
}
export function pageStamp() {
  return stamp;
}
restamp();
for (const dir of [join(DIR, "public"), CLIENT]) {
  watch(dir, { recursive: true }, () => {
    restamp();
    bump();
  });
}
