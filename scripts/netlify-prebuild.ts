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
import { emailSchema } from "../shared/schemas";
import { ZodError } from "zod";

/** Trim whitespace and one pair of surrounding quotes from a pasted env value. */
const clean = (v: string | undefined) => v?.trim().replace(/^(["'])(.*)\1$/, "$2").trim() || undefined;

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
  const gateCode = clean(process.env.GATE_INITIAL_CODE);
  if (gateCode && !/^\d{4,20}$/.test(gateCode)) {
    // Never fail the deploy (or echo the value) over a malformed first-deploy variable.
    console.warn(
      "[prebuild] WARNING: GATE_INITIAL_CODE is set but is not 4–20 digits (the value must contain only the digits, " +
        "e.g. 1234567890 — not the variable name, spaces or other characters). Skipping gate setup; fix the variable " +
        "and redeploy, or run `npm run gate:init` against the database.",
    );
  } else if (gateCode) {
    const r = await initGate(db, gateCode, false);
    console.log(r === "set" ? "[prebuild] gate code hash stored" : "[prebuild] gate code already configured (unchanged)");
  }
  const adminEmail = clean(process.env.BOOTSTRAP_ADMIN_EMAIL);
  if (adminEmail) {
    if (!emailSchema.safeParse(adminEmail).success) {
      console.warn(
        "[prebuild] WARNING: BOOTSTRAP_ADMIN_EMAIL is set but is not a valid email address (the value must be only the " +
          "address, e.g. admin@example.com — no variable name, spaces or other text). Skipping super admin setup.",
      );
    } else {
      try {
        const r = await bootstrapAdmin(db, adminEmail, process.env.BOOTSTRAP_ADMIN_PASSWORD || undefined);
        console.log(`[prebuild] super admin ${r.created ? "created" : "confirmed"} (${r.email.replace(/^(.).*@/, "$1***@")})`);
      } catch (e) {
        if (!(e instanceof ZodError)) throw e;
        console.warn(
          "[prebuild] WARNING: could not create the super admin — BOOTSTRAP_ADMIN_PASSWORD is missing or does not meet " +
            "the password rules. Skipping super admin setup; set a valid password and redeploy.",
        );
      }
    }
  }
} finally {
  await db.close();
}
