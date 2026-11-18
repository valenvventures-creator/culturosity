// Safe seed: base Culturosity workspace + sourced research records. `--demo` adds the isolated demo.
import { resolve } from "node:path";
import { loadConfig } from "../server/env";
import { createDbFromConfig } from "../server/db";
import { migrate } from "../server/db/migrate";
import { seedBase } from "../server/seed/base";
import { seedResearch } from "../server/seed/research";
import { createStorageFromConfig } from "../server/adapters/storage";

const cfg = loadConfig();
const demo = process.argv.includes("--demo");
if (demo && cfg.mode === "production" && !process.argv.includes("--allow-demo-in-production")) {
  console.error("Refusing to seed demo accounts into a production database. Use a separate demo database.");
  process.exit(1);
}
const db = await createDbFromConfig(cfg);
await migrate(db, resolve(process.cwd(), "server/db/migrations"));
await seedBase(db, { gateCode: process.env.GATE_INITIAL_CODE || null });
console.log(`[seed] base workspace ready; research records added: ${await seedResearch(db)}`);
if (demo) {
  const { seedDemo } = await import("../server/seed/demo");
  const r = await seedDemo(db, await createStorageFromConfig(cfg), { password: process.env.SEED_DEMO_PASSWORD || null });
  console.log(r.created ? "[seed] demo workspaces created" : "[seed] demo workspaces already present");
}
await db.close();
