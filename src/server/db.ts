// The SQLite database. Each table's schema is a file in schema/, applied at startup in name order.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { DATA } from "./config.ts";

export const db = new Database(`${DATA}/hud.db`, { create: true });
db.exec("PRAGMA journal_mode = WAL;");
// Another connection may hold the write lock for a moment (a second process, a test's setup): wait for it rather than fail.
db.exec("PRAGMA busy_timeout = 5000;");
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
// blocked-prompts: the excerpt of the prompt a lane's agent waits on in herdr (null when none); see prompt.ts.
if (!(db.query("PRAGMA table_info(lanes)").all() as { name: string }[]).some((c) => c.name === "prompt")) db.exec("ALTER TABLE lanes ADD COLUMN prompt TEXT");
// floors v4 G1: the time (ms) until which the owner deferred a question; NULL means never deferred. Once past, the question is
// back, and it stays on top of the open list until it is answered.
if (!(db.query("PRAGMA table_info(asks)").all() as { name: string }[]).some((c) => c.name === "defer_until")) db.exec("ALTER TABLE asks ADD COLUMN defer_until INTEGER");
// floors v4 G3: the lane that handed a question in (hud ask --from LANE); NULL when none did.
if (!(db.query("PRAGMA table_info(asks)").all() as { name: string }[]).some((c) => c.name === "handed_by")) db.exec("ALTER TABLE asks ADD COLUMN handed_by TEXT");
// floors: the room (its slug) a question is about, set by hud ask --room; NULL when it names none. Never inferred from the lane.
if (!(db.query("PRAGMA table_info(asks)").all() as { name: string }[]).some((c) => c.name === "room")) db.exec("ALTER TABLE asks ADD COLUMN room TEXT");
// floors v4 G2: who wrote a comment (NULL = HQ, as every row made before the column) and the lane it is addressed to (NULL = HQ).
if (!(db.query("PRAGMA table_info(ask_comments)").all() as { name: string }[]).some((c) => c.name === "author")) db.exec("ALTER TABLE ask_comments ADD COLUMN author TEXT");
if (!(db.query("PRAGMA table_info(ask_comments)").all() as { name: string }[]).some((c) => c.name === "to_lane")) db.exec("ALTER TABLE ask_comments ADD COLUMN to_lane TEXT");
// floors v4 G2: how an owner's comment to a lane reached it (NULL for a comment to HQ: the outbox holds those; else sending, sent
// or failed) and why it failed.
if (!(db.query("PRAGMA table_info(ask_comments)").all() as { name: string }[]).some((c) => c.name === "delivery")) db.exec("ALTER TABLE ask_comments ADD COLUMN delivery TEXT");
if (!(db.query("PRAGMA table_info(ask_comments)").all() as { name: string }[]).some((c) => c.name === "error")) db.exec("ALTER TABLE ask_comments ADD COLUMN error TEXT");
