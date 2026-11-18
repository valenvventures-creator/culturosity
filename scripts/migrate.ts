// Apply SQL migrations. `--if-configured` skips quietly when no DATABASE_URL (e.g. preview builds).
import { resolve } from "node:path";
import { loadConfig } from "../server/env";
import { createDbFromConfig } from "../server/db";
import { migrate } from "../server/db/migrate";

const cfg = loadConfig();
if (process.argv.includes("--if-configured") && !cfg.databaseUrl) {
  console.log("[migrate] DATABASE_URL not set — skipping migrations.");
  process.exit(0);
}
const db = await createDbFromConfig(cfg);
const ran = await migrate(db, resolve(process.cwd(), "server/db/migrations"));
console.log(ran.length ? `[migrate] applied: ${ran.join(", ")}` : "[migrate] schema up to date");
await db.close();
