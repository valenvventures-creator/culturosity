// Create (or promote) a Culturosity super admin. Idempotent: an existing account is promoted,
// and its password is never changed.
import type { Db } from "../db";
import { passwordAuth } from "../lib/auth";
import { passwordSchema, emailSchema } from "../../shared/schemas";
import { claimPrimaryIfUnset } from "../lib/primaryAdmin";

export async function bootstrapAdmin(db: Db, rawEmail: string, rawPassword: string | undefined): Promise<{ email: string; created: boolean }> {
  const email = emailSchema.parse(rawEmail);
  const existing = await db.query<{ id: string }>(`select id from app_users where lower(email) = lower($1)`, [email]);
  let userId = existing.rows[0]?.id;
  const created = !userId;
  if (!userId) {
    const password = passwordSchema.parse(rawPassword ?? "");
    userId = await db.tx((q) => passwordAuth.createPasswordUser(q, { email, password, displayName: "Culturosity Admin", verified: true }));
  }
  await db.query(`insert into platform_grants (user_id, grant_name) values ($1,'super_admin') on conflict do nothing`, [userId]);
  const org = await db.query<{ id: string }>(`select id from organizations where slug = 'culturosity'`);
  if (org.rows[0]) {
    const m = await db.query<{ id: string }>(
      `insert into memberships (user_id, org_id, role) values ($1,$2,'owner')
       on conflict (user_id, org_id) do update set role = 'owner', status = 'active' returning id`,
      [userId, org.rows[0].id],
    );
    const p = await db.query<{ id: string }>(`select id from programs where org_id = $1 and is_default`, [org.rows[0].id]);
    if (p.rows[0]) await db.query(`insert into program_memberships (program_id, membership_id) values ($1,$2) on conflict do nothing`, [p.rows[0].id, m.rows[0].id]);
  }
  if (!/@demo\.culturosity\.test$/i.test(email)) await claimPrimaryIfUnset(db, userId);
  return { email, created };
}
