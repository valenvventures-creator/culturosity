// Local API server (development and the isolated local demo).
import { serve } from "@hono/node-server";
import { resolve } from "node:path";
import { createApp } from "./app";
import { createDeps } from "./bootstrap";
import { loadConfig } from "./env";
import { migrate } from "./db/migrate";
import { seedBase } from "./seed/base";
import { seedResearch } from "./seed/research";

const cfg = loadConfig();
const deps = await createDeps(cfg);
const ran = await migrate(deps.db, resolve(process.cwd(), "server/db/migrations"));
if (ran.length) console.log(`[db] applied migrations: ${ran.join(", ")}`);
if (deps.db.kind === "pglite") {
  await seedBase(deps.db, { gateCode: process.env.GATE_INITIAL_CODE || null });
  const n = await seedResearch(deps.db);
  if (n) console.log(`[seed] research starting set: ${n} records`);
  if (cfg.mode === "demo" && process.env.SKIP_DEMO_SEED !== "1") {
    const { seedDemo } = await import("./seed/demo");
    const r = await seedDemo(deps.db, deps.storage, { password: process.env.SEED_DEMO_PASSWORD || null });
    if (r.created) console.log("[seed] demo workspaces created");
  }
}

const app = createApp(deps);
const port = Number(process.env.API_PORT ?? 8787);
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => {
  console.log(`[api] Culturosity API on http://127.0.0.1:${port}/api  (mode=${cfg.mode}, db=${deps.db.kind}, storage=${deps.storage.driver})`);
});
