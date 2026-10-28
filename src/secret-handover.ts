// The secret handover, the plugin's half: before a planned restart it takes every live secret from the running
// server over loopback, holds them in this process's memory only, and gives them to the new server once it answers.
// The server's half is the export and import routes in src/server/secrets.ts; secret-ledger.ts writes the token.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// A fresh random token per server start, in the data dir, readable by this user only. Not a secret value: it only
// proves the caller can read the data dir, which a web page cannot.
export const TOKEN_FILE = "secret-handover.token";

type Carried = { name: string; value: string; by: string; setAt: number; expiresAt: number };
export type Held = { secrets: Carried[]; names: string[]; token: string };

function token(dataDir: string): string | null {
  const f = join(dataDir, TOKEN_FILE);
  try {
    return existsSync(f) ? readFileSync(f, "utf8").trim() || null : null;
  } catch {
    return null;
  }
}

async function post(base: string, path: string, tok: string, body: unknown) {
  const res = await fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hud": "1", "x-hud-handover": tok },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  const data: any = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// What the running server lists: names, setters and deadlines, never values.
async function listed(base: string): Promise<{ name: string; by: string; setAt: number; expiresAt: number }[]> {
  try {
    const res = await fetch(`${base}/api/secrets`, { signal: AbortSignal.timeout(1500) });
    const list = res.ok ? await res.json() : [];
    return Array.isArray(list) ? list.filter((s: any) => !s?.lostAt && s?.name) : [];
  } catch {
    return [];
  }
}

// A server from before the handover (no token, no export): each value is read the way `hud secret get` reads it, from
// this machine and not a browser, into this process's memory. Whatever cannot be read is named as lost.
async function takeOneByOne(base: string): Promise<{ held: Held | null; note: string | null }> {
  const secrets: Carried[] = [];
  const lost: string[] = [];
  for (const s of await listed(base)) {
    try {
      const res = await fetch(`${base}/api/secrets/get`, { method: "POST", headers: { "content-type": "application/json", "x-hud": "1" }, body: JSON.stringify({ name: s.name }), signal: AbortSignal.timeout(5000) });
      const data: any = await res.json().catch(() => ({}));
      if (res.ok && typeof data?.value === "string") secrets.push({ name: s.name, value: data.value, by: s.by, setAt: s.setAt, expiresAt: s.expiresAt });
      else lost.push(s.name);
    } catch {
      lost.push(s.name);
    }
  }
  return {
    held: secrets.length ? { secrets, names: secrets.map((s) => s.name), token: "" } : null,
    note: lost.length ? `could not read ${lost.join(", ")} from the running server; lost in this restart` : null,
  };
}

// Takes the running server's secrets. `held` is null when there is nothing to carry; `note` says what went wrong.
export async function takeSecrets(base: string, dataDir: string): Promise<{ held: Held | null; note: string | null }> {
  const tok = token(dataDir);
  if (!tok) return takeOneByOne(base);
  try {
    const r = await post(base, "/api/secrets/export", tok, {});
    if (!r.ok) return { held: null, note: `could not take the secrets from the running server (${r.data?.error ?? `HTTP ${r.status}`}); they are lost in this restart` };
    const secrets: Carried[] = Array.isArray(r.data?.secrets) ? r.data.secrets : [];
    return { held: secrets.length ? { secrets, names: secrets.map((s) => s.name), token: tok } : null, note: null };
  } catch (e) {
    // Nothing answering: no server, so nothing to carry.
    return { held: null, note: null };
  }
}

// Gives held secrets to the new server, then forgets them whatever happens. Returns a line for the person.
export async function giveSecrets(base: string, dataDir: string, held: Held | null): Promise<string | null> {
  if (!held) return null;
  const names = held.names.join(", ");
  try {
    const tok = token(dataDir);
    if (!tok) return `could not hand the secrets to the new server (no handover token); lost: ${names}. The page lists them as lost.`;
    // Same token: the same process still runs (it was never stopped), and it still holds them.
    if (tok === held.token) return null;
    const r = await post(base, "/api/secrets/import", tok, { secrets: held.secrets });
    if (!r.ok) return `could not hand the secrets to the new server (${r.data?.error ?? `HTTP ${r.status}`}); lost: ${names}. The page lists them as lost.`;
    const restored: string[] = Array.isArray(r.data?.restored) ? r.data.restored : [];
    return `Handed ${restored.length} secret${restored.length === 1 ? "" : "s"} over to the new server${restored.length ? `: ${restored.join(", ")}` : ""}.`;
  } catch (e) {
    return `could not hand the secrets to the new server (${(e as Error).message}); lost: ${names}. The page lists them as lost.`;
  } finally {
    for (const s of held.secrets) s.value = "";
    held.secrets.length = 0;
  }
}
