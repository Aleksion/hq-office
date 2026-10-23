// Secret drop: a value the owner pastes in, readable by HQ's CLI until its deadline, then gone.
// Values live in this process's memory only. Nothing here writes to the database, a log or a listing:
// a listing carries the name, who set it, when, and when it expires. A restart clears everything.

export type Clock = {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(t: unknown): void;
};
export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
};

export type SecretMeta = { name: string; by: string; setAt: number; expiresAt: number };
type Entry = SecretMeta & { value: string; timer: unknown };

export const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const BY_RE = /^[\w-]{1,32}$/;
export const MAX_MINUTES = 7 * 24 * 60;
const MAX_VALUE = 64 * 1024;

export function checkName(name: unknown): string {
  const n = String(name ?? "");
  if (!NAME_RE.test(n)) throw new Error("name must be letters, digits and _ (up to 64), starting with a letter or _");
  return n;
}
export function checkMinutes(minutes: unknown): number {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m <= 0 || m > MAX_MINUTES) throw new Error(`minutes must be more than 0 and at most ${MAX_MINUTES}`);
  return m;
}
// The error never quotes the value.
export function checkValue(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("value is empty");
  if (value.length > MAX_VALUE) throw new Error("value is over 64 KB");
  return value;
}

export function createSecretStore(opts: { clock?: Clock; onChange?: () => void } = {}) {
  const clock = opts.clock ?? systemClock;
  const onChange = opts.onChange ?? (() => {});
  const items = new Map<string, Entry>();
  const meta = ({ name, by, setAt, expiresAt }: Entry): SecretMeta => ({ name, by, setAt, expiresAt });

  function drop(name: string) {
    const e = items.get(name);
    if (!e) return false;
    clock.clearTimeout(e.timer);
    items.delete(name);
    return true;
  }
  // The deadline is checked on every access, so a late or lost timer never lets a value outlive it.
  function live(name: string): Entry | null {
    const e = items.get(name);
    if (!e) return null;
    if (clock.now() >= e.expiresAt) {
      drop(name);
      return null;
    }
    return e;
  }

  return {
    set(name: string, value: string, minutes: number, by: string): SecretMeta {
      checkName(name);
      checkValue(value);
      const m = checkMinutes(minutes);
      if (!BY_RE.test(by)) throw new Error("by must be a short word");
      drop(name);
      const setAt = clock.now();
      const expiresAt = setAt + Math.round(m * 60_000);
      const timer = clock.setTimeout(() => {
        if (items.get(name)?.expiresAt === expiresAt && drop(name)) onChange();
      }, expiresAt - setAt);
      const e: Entry = { name, by, setAt, expiresAt, value, timer };
      items.set(name, e);
      onChange();
      return meta(e);
    },
    get(name: string, once = false): string | null {
      const e = live(name);
      if (!e) return null;
      if (once) {
        drop(name);
        onChange();
      }
      return e.value;
    },
    remove(name: string): boolean {
      const gone = drop(name);
      if (gone) onChange();
      return gone;
    },
    list(): SecretMeta[] {
      for (const name of [...items.keys()]) live(name);
      return [...items.values()].map(meta).sort((a, b) => a.expiresAt - b.expiresAt);
    },
  };
}
export type SecretStore = ReturnType<typeof createSecretStore>;

// ---- who may talk to the secret routes ----

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export function isLoopbackAddress(addr: string | undefined | null): boolean {
  if (!addr) return false;
  const a = addr.toLowerCase();
  return a === "::1" || /^127\.\d+\.\d+\.\d+$/.test(a) || /^::ffff:127\.\d+\.\d+\.\d+$/.test(a);
}

// A request with no Origin is not from a browser page on another site. One with an Origin must be this
// server's own page: Origin equal to http://<Host>, with Host a loopback name or the bound address. That
// also stops a rebound DNS name, whose Host is the attacker's name.
export function originAllowed(req: Request, boundHost: string): boolean {
  const origin = req.headers.get("origin");
  if (origin === null) return true;
  const host = req.headers.get("host") ?? "";
  if (origin !== `http://${host}`) return false;
  const hostname = host.replace(/:\d+$/, "").toLowerCase();
  return LOOPBACK_HOSTS.has(hostname) || hostname === boundHost.toLowerCase();
}

const FORBIDDEN = () => json({ error: "forbidden" }, 403);
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

// Every secret route: from this machine only, never from another origin.
export function secretGuard(req: Request, ip: string | undefined | null, boundHost: string): Response | null {
  if (!isLoopbackAddress(ip)) return FORBIDDEN();
  if (!originAllowed(req, boundHost)) return FORBIDDEN();
  return null;
}

export const isSecretPath = (path: string) => path === "/api/secrets" || path.startsWith("/api/secrets/");

// GET  /api/secrets          listing (names and times only)
// POST /api/secrets          set {name, value, minutes, by}
// POST /api/secrets/rm       remove {name}
// POST /api/secrets/get      read {name, once}: the local CLI only, so no browser page, not even this one
export async function secretRoute(
  req: Request,
  path: string,
  ip: string | undefined | null,
  store: SecretStore,
  opts: { host: string; onSet?: (m: SecretMeta) => void },
): Promise<Response> {
  const refused = secretGuard(req, ip, opts.host);
  if (refused) return refused;
  if (req.method === "GET" && path === "/api/secrets") return json(store.list());
  if (req.method !== "POST" || req.headers.get("x-hud") !== "1") return FORBIDDEN();
  const body = await req.json().catch(() => ({}));
  try {
    if (path === "/api/secrets") {
      const m = store.set(checkName(body.name), checkValue(body.value), checkMinutes(body.minutes), String(body.by ?? "hq"));
      opts.onSet?.(m);
      return json(m);
    }
    if (path === "/api/secrets/rm") return json({ removed: store.remove(checkName(body.name)) });
    if (path === "/api/secrets/get") {
      if (req.headers.has("origin") || req.headers.has("sec-fetch-site") || req.headers.has("sec-fetch-mode")) return FORBIDDEN();
      const name = checkName(body.name);
      const value = store.get(name, body.once === true);
      if (value === null) return json({ error: `no secret ${name} (expired, removed or never set)` }, 404);
      return json({ value });
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
  return json({ error: "not found" }, 404);
}
