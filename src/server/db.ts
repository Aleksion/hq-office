// The SQLite database. Each table's schema is a file in schema/, applied at startup in name order.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { DATA } from "./config.ts";

export const db = new Database(`${DATA}/hud.db`, { create: true });
db.exec("PRAGMA journal_mode = WAL;");
const SCHEMA = join(import.meta.dir, "schema");
for (const f of readdirSync(SCHEMA).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(SCHEMA, f), "utf8"));
// Migrations for databases made before a column existed; they run after the tables exist.
// What an idle agent still has running in the background (for example "2 shells still running"), from its pane.
if (!(db.query("PRAGMA table_info(lanes)").all() as { name: string }[]).some((c) => c.name === "bg")) db.exec("ALTER TABLE lanes ADD COLUMN bg TEXT");
// Who must answer a request (see requests.ts). Rows filed before the column existed stay NULL and read as HQ.
if (!(db.query("PRAGMA table_info(requests)").all() as { name: string }[]).some((c) => c.name === "lead")) db.exec("ALTER TABLE requests ADD COLUMN lead TEXT");
// Names of the secrets an ask requests (JSON array). Names only: values never reach the database.
if (!(db.query("PRAGMA table_info(asks)").all() as { name: string }[]).some((c) => c.name === "secrets")) db.exec("ALTER TABLE asks ADD COLUMN secrets TEXT");
// The lane a lane reports to; empty means straight under HQ. Depth is computed from the chain, never stored.
if (!(db.query("PRAGMA table_info(lanes)").all() as { name: string }[]).some((c) => c.name === "parent")) db.exec("ALTER TABLE lanes ADD COLUMN parent TEXT");
