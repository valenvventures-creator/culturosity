// Runs before `npm run build` on Netlify (see package.json "netlify:build").
// When a database is configured it: applies migrations, runs the safe base seed (Culturosity
// workspace, settings, sourced research records — no demo data), and, only if the variables are
// present, stores the hashed gate code (never overwriting an existing one) and creates/promotes the
// bootstrap super admin. Every step is idempotent, so it is safe on every deploy.
// Remove GATE_INITIAL_CODE and BOOTSTRAP_ADMIN_PASSWORD from Netlify after the first successful deploy.
import { resolve } from "node:path";
import { loadConfig } from "../server/env";
import { createDbFromConfig } from "../server/db";
import { migrate } from "../server/db/migrate";
import { seedBase, initGate } from "../server/seed/base";
import { seedResearch } from "../server/seed/research";
import { bootstrapAdmin } from "../server/seed/bootstrap";

const cfg = loadConfig();
if (!cfg.databaseUrl) {
  console.log("[prebuild] No DATABASE_URL / NETLIFY_DATABASE_URL — skipping database setup. The deployed API will report that it is not configured.");
  process.exit(0);
}
const db = await createDbFromConfig(cfg);
try {
  const ran = await migrate(db, resolve(process.cwd(), "server/db/migrations"));
  console.log(ran.length ? `[prebuild] migrations applied: ${ran.join(", ")}` : "[prebuild] schema up to date");
  await seedBase(db);
  const added = await seedResearch(db);
  console.log(`[prebuild] base workspace ready; research records added: ${added}`);
  if (process.env.GATE_INITIAL_CODE) {
    const r = await initGate(db, process.env.GATE_INITIAL_CODE, false);
    console.log(r === "set" ? "[prebuild] gate code hash stored" : "[prebuild] gate code already configured (unchanged)");
  }
  if (process.env.BOOTSTRAP_ADMIN_EMAIL) {
    const r = await bootstrapAdmin(db, process.env.BOOTSTRAP_ADMIN_EMAIL, process.env.BOOTSTRAP_ADMIN_PASSWORD);
    console.log(`[prebuild] super admin ${r.created ? "created" : "confirmed"} (${r.email.replace(/^(.).*@/, "$1***@")})`);
  }
} finally {
  await db.close();
}
