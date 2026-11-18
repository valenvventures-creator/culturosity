// Create (or promote) the first Culturosity super admin. Credentials come from env vars.
import { loadConfig } from "../server/env";
import { createDbFromConfig } from "../server/db";
import { passwordAuth } from "../server/lib/auth";
import { passwordSchema, emailSchema } from "../shared/schemas";

const email = emailSchema.parse(process.env.BOOTSTRAP_ADMIN_EMAIL ?? "");
const db = await createDbFromConfig(loadConfig());
const existing = await db.query<{ id: string }>(`select id from app_users where lower(email) = lower($1)`, [email]);
let userId = existing.rows[0]?.id;
if (!userId) {
  const password = passwordSchema.parse(process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "");
  userId = await db.tx((q) => passwordAuth.createPasswordUser(q, { email, password, displayName: "Culturosity Admin", verified: true }));
}
await db.query(`insert into platform_grants (user_id, grant_name) values ($1,'super_admin') on conflict do nothing`, [userId]);
const org = await db.query<{ id: string }>(`select id from organizations where slug = 'culturosity'`);
if (org.rows[0]) {
  const m = await db.query<{ id: string }>(
    `insert into memberships (user_id, org_id, role) values ($1,$2,'owner') on conflict (user_id, org_id) do update set role = 'owner', status = 'active' returning id`,
    [userId, org.rows[0].id],
  );
  const p = await db.query<{ id: string }>(`select id from programs where org_id = $1 and is_default`, [org.rows[0].id]);
  if (p.rows[0]) await db.query(`insert into program_memberships (program_id, membership_id) values ($1,$2) on conflict do nothing`, [p.rows[0].id, m.rows[0].id]);
}
console.log(`[admin] ${email} is a Culturosity super admin. Remove BOOTSTRAP_ADMIN_PASSWORD from the environment now.`);
await db.close();
