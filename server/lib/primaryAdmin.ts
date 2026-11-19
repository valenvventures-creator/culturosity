// The primary owner: the one super admin account other super admins can't delete or demote.
// Stored as a setting (a user id, never an email). It is recorded automatically:
//   - when there is exactly one real (non-demo) super admin, that account is the primary;
//   - otherwise the first super admin to promote someone else (or the first account set up by
//     BOOTSTRAP_ADMIN_EMAIL at deploy time) becomes the primary, if none is recorded yet.
import type { Queryable } from "../db";
import { getSetting, setSetting } from "./settings";

export const PRIMARY_SUPER_ADMIN_KEY = "primary_super_admin";

async function isActiveSuperAdmin(q: Queryable, userId: string) {
  const r = await q.query(
    `select 1 from platform_grants g join app_users u on u.id = g.user_id
      where g.user_id = $1 and g.grant_name = 'super_admin' and g.revoked_at is null and u.status = 'active'`,
    [userId],
  );
  return r.rows.length > 0;
}

export async function primarySuperAdminId(q: Queryable): Promise<string | null> {
  const saved = await getSetting<string>(q, PRIMARY_SUPER_ADMIN_KEY);
  if (saved && (await isActiveSuperAdmin(q, saved))) return saved;
  const r = await q.query<{ user_id: string }>(
    `select distinct g.user_id from platform_grants g join app_users u on u.id = g.user_id
      where g.grant_name = 'super_admin' and g.revoked_at is null and u.status = 'active' and not u.is_demo`,
  );
  if (r.rows.length === 1) {
    await setSetting(q, PRIMARY_SUPER_ADMIN_KEY, r.rows[0].user_id);
    return r.rows[0].user_id;
  }
  return null;
}

/** Record `userId` as the primary owner if no primary is recorded yet. */
export async function claimPrimaryIfUnset(q: Queryable, userId: string) {
  if (await primarySuperAdminId(q)) return;
  if (await isActiveSuperAdmin(q, userId)) await setSetting(q, PRIMARY_SUPER_ADMIN_KEY, userId, userId);
}
