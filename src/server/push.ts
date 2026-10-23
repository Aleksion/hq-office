// The state version and its listeners: bump() after a write, and every open stream and wait hears it.
import { createSecretStore } from "./secrets.ts";

export let version = 1;
export const listeners = new Set<() => void>();
export function bump() {
  version++;
  for (const fn of [...listeners]) fn();
}

// Secrets live in this process only (see secrets.ts). A change bumps, so the page's countdowns stay current.
export const secrets = createSecretStore({ onChange: bump });
