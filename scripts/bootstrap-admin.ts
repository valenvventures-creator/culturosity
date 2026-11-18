// Create (or promote) the first Culturosity super admin. Credentials come from env vars.
import { loadConfig } from "../server/env";
import { createDbFromConfig } from "../server/db";
import { bootstrapAdmin } from "../server/seed/bootstrap";

const db = await createDbFromConfig(loadConfig());
const r = await bootstrapAdmin(db, process.env.BOOTSTRAP_ADMIN_EMAIL ?? "", process.env.BOOTSTRAP_ADMIN_PASSWORD);
console.log(`[admin] ${r.email} is a Culturosity super admin. Remove BOOTSTRAP_ADMIN_PASSWORD from the environment now.`);
await db.close();
