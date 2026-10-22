#!/usr/bin/env bun
// HQ's side of the command centre.
//   hud ask --lane L --title T [--body B] [--opt A --opt B] [--rec A] [--kind decision|action|info] [--link URL] [--due HH:MM]
//   hud lane NAME [--title T] [--machine M] [--pane P] [--issue ENG-1] [--pr 123] [--phase running|waiting|parked|done] [--note N]
//   hud rm-lane NAME
//   hud withdraw ID [--reason R]
//   hud event [--lane L] TEXT
//   hud inbox            answers and notes HQ has not acted on
//   hud ack a:ID | n:ID  mark an answer or note as acted on
//   hud wait             block until Nico answers or writes (exits with the inbox)
//   hud state            the board as JSON
//   hud sync             refresh herdr status now
const BASE = process.env.HUD_URL ?? "http://127.0.0.1:4747";

function parse(argv: string[]) {
  const flags: Record<string, string[]> = {};
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) (flags[a.slice(2)] ??= []).push(argv[++i] ?? "");
    else rest.push(a);
  }
  const one = (k: string) => flags[k]?.at(-1);
  return { flags, rest, one };
}

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json", "x-hud": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(data.error ?? res.statusText);
    process.exit(1);
  }
  return data;
}

function dueAt(hhmm?: string) {
  if (!hhmm) return undefined;
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m ?? 0, 0, 0);
  return d.getTime();
}

const [cmd, ...argv] = process.argv.slice(2);
const { flags, rest, one } = parse(argv);

switch (cmd) {
  case "ask": {
    const out = await call("POST", "/api/asks", {
      lane: one("lane"),
      kind: one("kind"),
      title: one("title"),
      body: one("body"),
      options: flags.opt ?? [],
      recommended: one("rec"),
      link: one("link"),
      due: dueAt(one("due")),
    });
    console.log(`ask #${out.id}`);
    break;
  }
  case "lane":
    await call("POST", "/api/lanes", {
      name: rest[0],
      title: one("title"),
      machine: one("machine"),
      pane: one("pane"),
      issue: one("issue"),
      pr: one("pr"),
      phase: one("phase"),
      note: one("note"),
    });
    console.log(`lane ${rest[0]}`);
    break;
  case "rm-lane":
    await call("POST", "/api/lanes/delete", { name: rest[0] });
    break;
  case "withdraw":
    await call("POST", `/api/asks/${rest[0]}/withdraw`, { reason: one("reason") });
    break;
  case "event":
    await call("POST", "/api/events", { lane: one("lane"), text: rest.join(" ") });
    break;
  case "inbox":
    console.log(JSON.stringify(await call("GET", "/api/inbox"), null, 2));
    break;
  case "ack":
    for (const ref of rest) {
      const [kind, id] = ref.split(":");
      await call("POST", `/api/${kind === "n" ? "notes" : "asks"}/${id}/ack`, {});
    }
    break;
  case "wait": {
    for (;;) {
      const box = await call("GET", "/api/wait?s=240");
      if (box.answers.length || box.notes.length) {
        console.log(JSON.stringify(box, null, 2));
        break;
      }
    }
    break;
  }
  case "state":
    console.log(JSON.stringify(await call("GET", "/api/state"), null, 2));
    break;
  case "sync":
    await call("POST", "/api/sync", {});
    break;
  default:
    console.log("usage: hud ask|lane|rm-lane|withdraw|event|inbox|ack|wait|state|sync");
}
