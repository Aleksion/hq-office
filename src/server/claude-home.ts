// A Claude home is one account: ~/.claude is "default", ~/.claude-<name> the rest. This file makes a home, seeds its
// .claude.json, builds the command that starts a lane on it, and spots a dialog on a lane's screen. It reads and
// writes no login: a new home links everything except the login files, and its .claude.json is seeded from an
// allow-list of keys that are not identity.
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT = "default";
export const NAME = /^[a-z0-9][a-z0-9-]{0,30}$/;
// HOME as the environment says, as account-stats.py reads it (os.homedir() would not follow a changed HOME).
const home = () => process.env.HOME || homedir();
export const homeDir = (account: string) => (account === DEFAULT ? join(home(), ".claude") : join(home(), `.claude-${account}`));

// Files of the default home that are a login (or a copy of one): a new home never links them.
const LOGIN_FILE = /^(\.credentials[^/]*|\.claude\.json.*)$/;

// The keys of ~/.claude.json a new home starts with: MCP servers, trust and onboarding. An allow-list, so a key
// Claude adds later is not copied until someone reads its name and adds it here. Identity (oauthAccount, userID,
// anything about accounts, tokens or keys) is never on it.
export const SEED_KEYS = ["mcpServers", "projects", "hasCompletedOnboarding", "lastOnboardingVersion", "theme", "shiftEnterKeyBindingInstalled", "hasCompletedClaudeInChromeOnboarding"];
// Of each project's entry only its trust and tool approvals cross (not its last session, cost or timings).
export const PROJECT_KEYS = ["allowedTools", "disabledMcpServers", "disabledMcpjsonServers", "enabledMcpjsonServers", "hasClaudeMdExternalIncludesApproved", "hasClaudeMdExternalIncludesWarningShown", "hasTrustDialogAccepted", "mcpContextUris"];

const pick = (from: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.filter((k) => k in from).map((k) => [k, from[k]]));

export function seedFor(source: Record<string, any>): Record<string, unknown> {
  const out = pick(source, SEED_KEYS) as Record<string, any>;
  if (out.projects && typeof out.projects === "object") {
    out.projects = Object.fromEntries(Object.entries(out.projects as Record<string, any>).map(([path, entry]) => [path, pick(entry ?? {}, PROJECT_KEYS)]));
  }
  return out;
}

// Make a home: links to everything in the default home except the login files, and a seeded .claude.json.
// Undo: delete the folder.
export function makeHome(account: string): string {
  if (!NAME.test(account) || account === DEFAULT) throw new Error("a home's name is lowercase letters, digits and dashes");
  const target = homeDir(account);
  if (existsSync(target)) throw new Error(`${target} already exists`);
  const source = homeDir(DEFAULT);
  mkdirSync(target, { mode: 0o700 });
  for (const entry of readdirSync(source)) {
    if (LOGIN_FILE.test(entry) || entry === ".DS_Store") continue;
    symlinkSync(join(source, entry), join(target, entry));
  }
  let config: Record<string, any> = {};
  try {
    config = JSON.parse(readFileSync(join(home(), ".claude.json"), "utf8"));
  } catch {}
  writeFileSync(join(target, ".claude.json"), JSON.stringify(seedFor(config), null, 2), { mode: 0o600 });
  return target;
}

export const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

export function relaunchCommand(account: string, session: string, settings: string): string {
  const env = account === DEFAULT ? "env -u CLAUDE_CONFIG_DIR" : `CLAUDE_CONFIG_DIR=${quote(homeDir(account))}`;
  return `${env} claude --resume ${quote(session)} --settings ${quote(settings)}`;
}

// A limit, extra-usage or credits dialog is the owner's alone: nothing is typed into it. The signal is the pane's
// visible text, since herdr's status calls these panes idle or blocked without saying which dialog; only the bottom
// of the screen counts, where a dialog sits.
const DIALOG = [
  /you(?:'|’)ve (?:hit|reached) your .{0,40}limit/i,
  /stop and wait for limit to reset/i,
  /add funds to continue with/i,
  /upgrade your plan/i,
  /extra[- ]usage/i,
  /usage[- ]credits/i,
];
export function showsDialog(screen: string): boolean {
  const tail = screen.split("\n").filter((l) => l.trim()).slice(-25).join("\n");
  return DIALOG.some((p) => p.test(tail));
}

