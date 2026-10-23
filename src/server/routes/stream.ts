// Routes for stream. The router loads every file in this folder; see src/server/router.ts.
import { PING_MS, pages, pushTo, refreshParts } from "../the-page-stream.ts";
import type { Page } from "../the-page-stream.ts";
import type { Route } from "../router.ts";

const routes: Route[] = [
  { method: "GET", path: "/api/stream", handle: () => {
    let cleanup = () => {};
    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        const page: Page = {
          sent: new Map(),
          send: (text) => {
            try {
              controller.enqueue(enc.encode(text));
            } catch {
              cleanup();
            }
          },
        };
        refreshParts();
        pushTo(page);
        pages.add(page);
        const ping = setInterval(() => page.send(`: ping\n\n`), PING_MS);
        cleanup = () => {
          pages.delete(page);
          clearInterval(ping);
        };
      },
      cancel() {
        cleanup();
      },
    });
    return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } });
  } },
];
export default routes;
