// The top bar: waiting count, oldest wait, working, on HQ, bank, FROM HQ, machines.
import { $ } from "../core/dom.js";
import { S } from "../core/state.js";
import { dur, esc, setClass, setHTML, setText } from "../core/format.js";

// All machines in one small box: one square per machine, and a word. It only speaks up when one is past 90% CPU or
// memory, or offline. The per-machine numbers are in the tooltip.
export function renderMachines() {
  const ms = S.machines ?? [];
  const rows = ms.map(({ machine, sample, age, ok }) => {
    const name = machine.toUpperCase();
    if (!sample || !ok) return { name, state: "off", tip: `${name}: offline${sample?.error ? ` (${sample.error})` : ""}` };
    const bad = sample.cpu_busy > 90 || sample.mem_used > 90;
    return { name, state: bad ? "bad" : "", cpu: Math.round(sample.cpu_busy), mem: Math.round(sample.mem_used), tip: `${name}: CPU ${Math.round(sample.cpu_busy)}% · MEM ${Math.round(sample.mem_used)}% · load ${sample.load1.toFixed(1)} on ${sample.cores} cores, ${dur(age)} ago` };
  });
  const bad = rows.find((r) => r.state === "bad"), off = rows.find((r) => r.state === "off");
  const word = bad ? `${bad.name} ${Math.max(bad.cpu, bad.mem)}%` : off ? `${off.name} OFF` : rows.length ? "OK" : "-";
  const box = $("machines");
  setClass(box, "box health " + (bad ? "bad" : off ? "off" : ""));
  const tip = rows.map((r) => r.tip).join("\n");
  if (box.title !== tip) box.title = tip;
  setHTML(box, `<span class="k">MACHINES</span><span class="v">${rows.map((r) => `<i class="${r.state}"></i>`).join("")}${esc(word)}</span>`);
}

// The top bar. The oldest wait ticks with the page clock (tick), the rest changes only with the state.
export function renderStats() {
  const n = S.open.length;
  const sw = $("sWait");
  setClass(sw, "box urgent " + (n ? "alert" : "ok"));
  setText(sw.querySelector(".count"), n);
  const live = S.lanes.filter((l) => !["done", "parked"].includes(l.status));
  setText($("sMove"), `${S.lanes.filter((l) => l.status === "moving").length}/${live.length}`);
  setText($("sHq"), S.lanes.filter((l) => ["hq_turn", "stale", "gone"].includes(l.status)).length);
  setText($("sBank"), S.score.bank);
  const unread = S.updatesUnread ?? 0;
  setClass($("sFrom"), "box fromhq" + (unread ? " unread" : ""));
  setText($("sFrom").querySelector(".v"), `${unread} NEW`);
  const title = (S.hq?.ok === false ? "HQ ISN'T RECEIVING · " : "") + (n ? `(${n}) HQ Office` : "HQ Office");
  if (document.title !== title) document.title = title;
}
