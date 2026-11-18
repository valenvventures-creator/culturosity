// Delete the local PGlite demo database and uploads. Local demo only.
import { rm } from "node:fs/promises";
import { loadConfig } from "../server/env";

const cfg = loadConfig();
if (cfg.databaseUrl || cfg.mode === "production") {
  console.error("Refusing: this only resets the local PGlite demo database.");
  process.exit(1);
}
for (const dir of [cfg.pgliteDir, cfg.uploadDir]) {
  if (!dir.startsWith(".data")) throw new Error(`Refusing to delete unexpected path ${dir}`);
  await rm(dir, { recursive: true, force: true });
}
console.log("[reset] local demo data removed; it will be recreated on next `npm run dev`.");
