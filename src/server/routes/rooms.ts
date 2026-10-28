// Routes for conference rooms (see src/server/rooms.ts), and the files in their folders (src/server/room-folder.ts).
import { bump } from "../push.ts";
import { json } from "../json.ts";
import { addFile, addLink, archive, createRoom, ownerPost, readOwner, removeArtifact, retry, roomView, roomsView, say, seen, setBrief } from "../rooms.ts";
import { LEGACY_FILES, RASTER, movedTo, servedFile } from "../room-folder.ts";
import type { Route } from "../router.ts";

const S = "([a-z0-9][a-z0-9-]{0,47})";
const at = (tail: string) => new RegExp(`^/api/rooms/${S}${tail}$`);

// A file from a room's folder is shown, never run. Every answer is sandboxed and never sniffed; a raster image shows
// inline, text shows as plain text, and anything else (HTML, SVG, a PDF, an unknown type) is a download.
const IMAGE_TYPE: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif" };
const TEXT = /\.(txt|md|markdown|log|csv|tsv|json|jsonl|ya?ml|toml|ini|env\.example|diff|patch|sql|sh|ts|tsx|js|jsx|mjs|py|rb|go|rs|java|kt|swift|c|h|cpp|css)$/i;
const SAFE = { "content-security-policy": "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; media-src 'self'", "x-content-type-options": "nosniff" };
function fileResponse(path: string, name: string) {
  const ext = name.split(".").pop()!.toLowerCase();
  const quoted = encodeURIComponent(name);
  const headers: Record<string, string> = { ...SAFE };
  if (RASTER.test(name)) Object.assign(headers, { "content-type": IMAGE_TYPE[ext], "content-disposition": `inline; filename*=UTF-8''${quoted}` });
  else if (TEXT.test(name)) Object.assign(headers, { "content-type": "text/plain; charset=utf-8", "content-disposition": `inline; filename*=UTF-8''${quoted}` });
  else Object.assign(headers, { "content-type": "application/octet-stream", "content-disposition": `attachment; filename*=UTF-8''${quoted}` });
  return new Response(Bun.file(path), { headers });
}
const notFound = () => new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { "content-type": "application/json", ...SAFE } });

const routes: Route[] = [
  { method: "GET", path: "/api/rooms", handle: ({ url }) => json(roomsView(!!url.searchParams.get("all"))) },
  { method: "GET", pattern: at(""), handle: ({ m }) => json(roomView(m[1])) },
  // hud room read: the owner's messages after ?since=ID; with ?wait=S it waits up to S seconds (at most 240) for one.
  { method: "GET", pattern: at("/read"), handle: async ({ m, url }) => json(await readOwner(m[1], url.searchParams.get("since"), Math.min(Number(url.searchParams.get("wait") ?? 0) || 0, 240) * 1000)) },
  { method: "POST", path: "/api/rooms", handle: ({ body }) => createRoom(body) },
  { method: "POST", pattern: at("/brief"), handle: ({ body, m }) => setBrief(m[1], body) },
  { method: "POST", pattern: at("/artifacts"), handle: ({ body, m }) => addLink(m[1], body) },
  // The owner takes an item off the shelf (an image removed from the send box): a file in the folder goes too.
  { method: "POST", pattern: at("/artifacts/(\\d+)/remove"), handle: ({ m }) => removeArtifact(m[1], Number(m[2])) },
  // A file travels as raw bytes, so this route reads the body itself; ?name= ?title= ?kind= ?as= describe it.
  { method: "POST", pattern: at("/files"), raw: true, handle: async ({ req, url, m }) => {
    try {
      const out = await addFile(m[1], req, url);
      bump();
      return json(out);
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }
  } },
  { method: "POST", pattern: at("/say"), handle: ({ body, m }) => say(m[1], body) },
  { method: "POST", pattern: at("/post"), handle: ({ body, m }) => ownerPost(m[1], body) },
  { method: "POST", pattern: at("/messages/(\\d+)/retry"), handle: ({ m }) => retry(m[1], Number(m[2])) },
  { method: "POST", pattern: at("/seen"), handle: ({ m }) => seen(m[1]) },
  { method: "POST", pattern: at("/archive"), handle: ({ body, m }) => archive(m[1], body.by) },
  // A file in a room's folder: /rooms/SLUG/files/NAME.
  { method: "GET", prefix: "/rooms/", handle: ({ path }) => {
    const m = path.match(/^\/rooms\/([^/]+)\/files\/([^/]+)$/);
    const f = m && servedFile(m[1], m[2]);
    return f ? fileResponse(f.path, f.name) : notFound();
  } },
  // A link from before rooms had folders: to where its file moved, or the file itself if it never moved.
  { method: "GET", prefix: "/room-files/", handle: async ({ path }) => {
    let name = "";
    try { name = decodeURIComponent(path.slice("/room-files/".length)); } catch {}
    if (!/^[\w.-]+$/.test(name) || name.startsWith(".")) return notFound();
    const to = movedTo(name);
    if (to) return new Response(null, { status: 301, headers: { location: to, ...SAFE } });
    const file = Bun.file(`${LEGACY_FILES}/${name}`);
    return (await file.exists()) ? fileResponse(`${LEGACY_FILES}/${name}`, name) : notFound();
  } },
];
export default routes;
