// Routes for uploads. The router loads every file in this folder; see src/server/router.ts.
import { IMAGE_EXT, MAX_UPLOAD, UPLOADS } from "../config.ts";
import { json } from "../json.ts";
import type { Route } from "../router.ts";

const routes: Route[] = [
  { method: "GET", prefix: "/uploads/", handle: async ({ path }) => {
    const name = decodeURIComponent(path.slice("/uploads/".length));
    if (!/^[\w.-]+$/.test(name)) return json({ error: "not found" }, 404);
    const file = Bun.file(`${UPLOADS}/${name}`);
    return (await file.exists()) ? new Response(file) : json({ error: "not found" }, 404);
  } },
  // Images travel as raw bytes, so this route reads the body itself before the JSON parse below.
  { method: "POST", path: "/api/uploads", raw: true, handle: async ({ req, url }) => {
    const ext = IMAGE_EXT[req.headers.get("content-type") ?? ""];
    if (!ext) throw new Error("only png, jpeg, gif or webp images");
    const bytes = await req.arrayBuffer();
    if (bytes.byteLength > MAX_UPLOAD) throw new Error("image is over 10 MB");
    const stem = (url.searchParams.get("name") ?? "image").replace(/\.[^.]*$/, "").replace(/[^\w-]+/g, "-").slice(0, 40) || "image";
    const name = `${Date.now()}-${stem}.${ext}`;
    await Bun.write(`${UPLOADS}/${name}`, bytes);
    return json({ path: `${UPLOADS}/${name}`, url: `/uploads/${name}` });
  } },
];
export default routes;
