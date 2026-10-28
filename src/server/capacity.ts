// The capacity guard: can a machine take another agent? Asked before every start; the last answer per machine goes to the page.
// This machine always reports go. The other machine runs the guard script named by HUD_CAPACITY_GUARD (exit 0 go, 1 hold,
// 2 stop). A guard that cannot run or answer in time is a hold, never a go: a start must not slip past a silent guard.
import { LOCAL } from "./config.ts";
import { addStatePart } from "./state.ts";

export type Capacity = { state: "go" | "hold" | "stop"; reason: string; at: number };

const STATES = ["go", "hold", "stop"] as const;
const last = new Map<string, Capacity>();

async function runGuard(guard: string): Promise<Omit<Capacity, "at">> {
  const limit = Number(process.env.HUD_CAPACITY_TIMEOUT_MS ?? 30_000);
  let proc;
  try {
    proc = Bun.spawn([guard, "hub"], { stdout: "pipe", stderr: "pipe" });
  } catch (e) {
    return { state: "hold", reason: `the capacity guard could not run: ${(e as Error).message}` };
  }
  let timer: Timer | undefined;
  const code = await Promise.race([
    proc.exited,
    new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), limit); }),
  ]);
  clearTimeout(timer);
  if (code === "timeout") {
    proc.kill("SIGKILL");
    return { state: "hold", reason: `the capacity guard gave no answer in ${Math.round(limit / 1000)} s` };
  }
  const text = (await new Response(proc.stdout).text()).trim() || (await new Response(proc.stderr).text()).trim();
  const reason = text.split("\n").pop()?.trim() || `the capacity guard exited ${code}`;
  const state = STATES[code];
  // Any other exit code (a crash, 127 for a missing interpreter) is a guard that failed, not an answer.
  if (!state) return { state: "hold", reason: `the capacity guard failed (exit ${code}): ${reason}` };
  return { state, reason };
}

export async function capacity(machine: string): Promise<Capacity> {
  const guard = process.env.HUD_CAPACITY_GUARD;
  const answer =
    machine === LOCAL ? { state: "go" as const, reason: "this machine is not gated" }
    : !guard ? { state: "go" as const, reason: "no capacity guard is set (HUD_CAPACITY_GUARD)" }
    : await runGuard(guard);
  const result = { ...answer, at: Date.now() };
  last.set(machine, result);
  return result;
}

// Never runs the guard: the page shows what the last start asked.
addStatePart("capacity", () => Object.fromEntries(last));
