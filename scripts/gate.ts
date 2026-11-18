// Server-only numerical gate setup. Reads the code from GATE_INITIAL_CODE / GATE_NEW_CODE env vars
// so it never appears in shell history arguments, source code, or the browser bundle.
import { loadConfig } from "../server/env";
import { createDbFromConfig } from "../server/db";
import { initGate } from "../server/seed/base";

const cmd = process.argv[2];
const db = await createDbFromConfig(loadConfig());
if (cmd === "init") {
  const code = process.env.GATE_INITIAL_CODE;
  if (!code) throw new Error("Set GATE_INITIAL_CODE in the environment (see README).");
  console.log(`[gate] ${await initGate(db, code, false) === "set" ? "code hash stored" : "a code is already configured (use gate:rotate to change it)"}`);
} else if (cmd === "rotate") {
  const code = process.env.GATE_NEW_CODE;
  if (!code) throw new Error("Set GATE_NEW_CODE in the environment.");
  await initGate(db, code, true);
  console.log("[gate] code rotated; all existing unlocks revoked");
} else {
  console.log("Usage: npm run gate:init | npm run gate:rotate");
}
await db.close();
