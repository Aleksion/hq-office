// Redacting a secret's value from everything stored: `hud secret redact NAME`, for a value that was typed where it
// should not be (an answer, a note, an update). The server holds the value, so it never passes through the command.
// Every text column of every table, replaced with [secret NAME]; overwritten pages zeroed (secure_delete) and the WAL
// truncated, so the value is gone from the files too.
import { db } from "./db.ts";

export function redactEverywhere(value: string, name: string): { rows: number; tables: Record<string, number> } {
  if (value.length < 4) throw new Error("the value is too short to redact safely");
  const label = `[secret ${name}]`;
  const tables: Record<string, number> = {};
  let rows = 0;
  db.exec("PRAGMA secure_delete = ON");
  try {
    db.transaction(() => {
      for (const { name: t } of db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]) {
        for (const c of db.query(`PRAGMA table_info("${t}")`).all() as { name: string; type: string }[]) {
          if (!/TEXT/i.test(c.type)) continue;
          const n = db.query(`UPDATE "${t}" SET "${c.name}" = replace("${c.name}", ?1, ?2) WHERE instr("${c.name}", ?1) > 0`).run(value, label).changes;
          if (n) { tables[`${t}.${c.name}`] = n; rows += n; }
        }
      }
    })();
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } finally {
    db.exec("PRAGMA secure_delete = OFF");
  }
  return { rows, tables };
}
