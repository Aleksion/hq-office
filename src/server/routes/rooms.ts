// Routes for conference rooms (see src/server/rooms.ts), and the files on their shelves.
import { bump } from "../push.ts";
import { json } from "../json.ts";
import { ROOM_FILES, addFile, addLink, archive, createRoom, ownerPost, readOwner, retry, roomView, roomsView, say, seen, setBrief } from "../rooms.ts";
import type { Route } from "../router.ts";

const S = "([a-z0-9][a-z0-9-]{0,47})";
const at = (tail: string) => new RegExp(`^/api/rooms/${S}${tail}$`);

const routes: Route[] = [
  { method: "GET", path: "/api/rooms", handle: ({ url }) => json(roomsView(!!url.searchParams.get("all"))) },
  { method: "GET", pattern: at(""), handle: ({ m }) => json(roomView(m[1])) },
  // hud room read: the owner's messages after ?since=ID; with ?wait=S it waits up to S seconds (at most 240) for one.
  { method: "GET", pattern: at("/read"), handle: async ({ m, url }) => json(await readOwner(m[1], url.searchParams.get("since"), Math.min(Number(url.searchParams.get("wait") ?? 0) || 0, 240) * 1000)) },
  { method: "POST", path: "/api/rooms", handle: ({ body }) => createRoom(body) },
  { method: "POST", pattern: at("/brief"), handle: ({ body, m }) => setBrief(m[1], body) },
  { method: "POST", pattern: at("/artifacts"), handle: ({ body, m }) => addLink(m[1], body) },
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
  { method: "POST", pattern: at("/archive"), handle: ({ m }) => archive(m[1]) },
  // A file on a shelf. Sandboxed: whatever a lane uploads (an HTML report, an SVG) can show here but never run.
  { method: "GET", prefix: "/room-files/", handle: async ({ path }) => {
    const name = decodeURIComponent(path.slice("/room-files/".length));
    if (!/^[\w.-]+$/.test(name) || name.startsWith(".")) return json({ error: "not found" }, 404);
    const file = Bun.file(`${ROOM_FILES}/${name}`);
    if (!(await file.exists())) return json({ error: "not found" }, 404);
    return new Response(file, { headers: { "content-security-policy": "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; media-src 'self'", "x-content-type-options": "nosniff" } });
  } },
];
export default routes;
