// Bun.serve: every request passes the checks that need the raw request (its origin and the caller's address),
// then goes to the router.
import { HOST, LEGACY_OWNER_WHO, OWNER, PORT, TRUSTED_ORIGINS } from "./config.ts";
import { handle } from "./router.ts";
import { json } from "./json.ts";
import { bump, secrets } from "./push.ts";
import { notifyHq } from "./hq-link.ts";
import { answerWithSecrets } from "./asks.ts";
import { isSecretPath, originAllowed, secretGuard, secretRoute } from "./secrets.ts";

Bun.serve({
  port: PORT,
  hostname: HOST,
  idleTimeout: 255,
  async fetch(req, server) {
    const path = new URL(req.url).pathname;
    // A page on another origin gets nothing, not even a read, unless the owner listed it in HUD_TRUSTED_ORIGINS.
    if (!originAllowed(req, HOST) && !TRUSTED_ORIGINS.includes(req.headers.get("origin") ?? "")) return json({ error: "forbidden" }, 403);
    const ip = server.requestIP(req)?.address;
    if (isSecretPath(path)) {
      return secretRoute(req, path, ip, secrets, {
        host: HOST,
        onSet: (m) => {
          if (m.by === "owner" || m.by === LEGACY_OWNER_WHO) notifyHq(`HUD secret from ${OWNER}: ${m.name}, readable for ${Math.round((m.expiresAt - m.setAt) / 60_000)} min with: hud secret get ${m.name} | <command>`);
        },
      });
    }
    // Secrets filled in on a question card: checked against the caller's address, which only this level knows.
    const askSecrets = req.method === "POST" ? path.match(/^\/api\/asks\/(\d+)\/secrets$/) : null;
    if (askSecrets) {
      if (req.headers.get("x-hud") !== "1") return json({ error: "forbidden" }, 403);
      const refused = secretGuard(req, ip, HOST);
      if (refused) return refused;
      try {
        answerWithSecrets(Number(askSecrets[1]), await req.json().catch(() => ({})));
      } catch (e) {
        return json({ error: (e as Error).message }, 400);
      }
      bump();
      return json({ ok: true });
    }
    return handle(req);
  },
});
