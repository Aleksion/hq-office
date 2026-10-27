// The daily bank: points lost to waiting asks, won by quick answers.
import { db } from "./db.ts";
import type { Ask } from "./types.ts";

function startOfDay(now: number) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// The minutes an ask waited between `from` and `to`, leaving out the spans the owner deferred it for.
export function waitedMinutes(from: number, to: number, defers: { from_at: number; to_at: number }[]) {
  const off = defers.reduce((ms, d) => ms + Math.max(0, Math.min(to, d.to_at) - Math.max(from, d.from_at)), 0);
  return Math.floor((to - from - off) / 60_000);
}

// The game: a daily bank of 1000. Every minute an ask waits past a
// 5-minute grace costs one point; an answer inside 10 minutes earns 20.
// A deferred ask does not wait: the owner chose when it comes back.
export function score(now: number) {
  const asks = db
    .query("SELECT id, created_at, answered_at, status, defer_until FROM asks WHERE status != 'withdrawn' AND (created_at >= ? OR status = 'open' OR answered_at >= ?)")
    .all(startOfDay(now), startOfDay(now)) as Ask[];
  const defers = db.query("SELECT from_at, to_at FROM ask_defers WHERE ask_id = ?");
  let lost = 0;
  let bonus = 0;
  let fast = 0;
  for (const a of asks) {
    const from = Math.max(a.created_at, startOfDay(now));
    const to = a.answered_at ?? now;
    lost += Math.max(0, waitedMinutes(from, to, defers.all(a.id) as { from_at: number; to_at: number }[]) - 5);
    if (a.answered_at && a.answered_at - a.created_at <= 10 * 60_000) {
      bonus += 20;
      fast++;
    }
  }
  const open = asks.filter((a) => a.status === "open" && !((a.defer_until ?? 0) > now)).length;
  return { bank: 1000 - lost + bonus, lost, bonus, fast, burnPerMin: open };
}
