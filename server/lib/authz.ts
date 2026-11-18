// Server-derived authorisation. Every route resolves identity, membership and ownership here;
// client-submitted org/program/provider IDs are never trusted on their own.
import type { Ctx } from "../context";
import type { Queryable } from "../db";
import { forbidden, notFound, AppError } from "./errors";
import { requireUser } from "./auth";

export type OrgRole = "owner" | "admin" | "provider_manager" | "member";
export type Grant = "super_admin" | "sales_admin";

export interface OrgRow {
  id: string;
  slug: string;
  name: string;
  kind: "culturosity" | "client";
  is_demo: boolean;
  status: string;
  logo_asset_id: string | null;
  program_display_name: string | null;
  welcome_copy: string | null;
  accent_color: string | null;
  contact_name: string | null;
  contact_email: string | null;
  coverage: string | null;
  approx_member_count: number | null;
  delivery_preference: string | null;
}

export async function grantsFor(q: Queryable, userId: string): Promise<Set<Grant>> {
  const r = await q.query<{ grant_name: Grant }>(`select grant_name from platform_grants where user_id = $1 and revoked_at is null`, [userId]);
  return new Set(r.rows.map((x) => x.grant_name));
}

export async function isSuperAdmin(q: Queryable, userId: string) {
  return (await grantsFor(q, userId)).has("super_admin");
}

export async function activeMembership(q: Queryable, userId: string, orgId: string) {
  const r = await q.query<{ id: string; role: OrgRole }>(
    `select id, role from memberships
      where user_id = $1 and org_id = $2 and status = 'active'
        and (eligible_from is null or eligible_from <= current_date)
        and (eligible_until is null or eligible_until >= current_date)`,
    [userId, orgId],
  );
  return r.rows[0] ?? null;
}

export async function orgBySlug(q: Queryable, slug: string): Promise<OrgRow | null> {
  const r = await q.query<OrgRow>(`select * from organizations where slug = $1 and status <> 'archived'`, [slug]);
  return r.rows[0] ?? null;
}

/**
 * Resolve an org the caller may act in with one of `roles`.
 * Super admins may manage any workspace; sales admins only demo workspaces.
 * Missing access returns 404 so org existence is not revealed.
 */
export async function requireOrgRole(c: Ctx, slug: string, roles: OrgRole[]) {
  const user = requireUser(c);
  const { db } = c.get("deps");
  const org = await orgBySlug(db, slug);
  if (!org) throw notFound("Workspace not found.");
  const m = await activeMembership(db, user.id, org.id);
  if (m && roles.includes(m.role)) return { user, org, membership: m, elevated: false as const };
  const grants = await grantsFor(db, user.id);
  if (grants.has("super_admin")) return { user, org, membership: m, elevated: true as const };
  if (grants.has("sales_admin") && org.is_demo) return { user, org, membership: m, elevated: true as const };
  if (m) throw forbidden("Your role in this workspace does not allow that.");
  throw notFound("Workspace not found.");
}

export async function requireGrant(c: Ctx, allowed: Grant[]) {
  const user = requireUser(c);
  const grants = await grantsFor(c.get("deps").db, user.id);
  if (!allowed.some((g) => grants.has(g))) throw notFound();
  return { user, grants };
}

/** Internal research/sales endpoints: internal grant AND an active session-bound unlock. */
export async function requireUnlock(c: Ctx, allowed: Grant[] = ["super_admin", "sales_admin"]) {
  const { user, grants } = await requireGrant(c, allowed);
  const { db, config } = c.get("deps");
  const sid = c.get("sessionId");
  const r = await db.query<{ id: string }>(
    `update admin_unlocks set last_activity_at = now()
      where session_id = $1 and user_id = $2 and revoked_at is null and expires_at > now()
        and last_activity_at > now() - make_interval(mins => $3)
      returning id`,
    [sid, user.id, config.gateIdleMinutes],
  );
  if (!r.rows[0]) throw new AppError(423, "locked", "The internal portal is locked. Enter the access code to continue.");
  return { user, grants, unlockId: r.rows[0].id };
}

export interface ProgramAccess {
  program_id: string;
  program_name: string;
  program_slug: string;
  org_id: string;
  org_slug: string;
  org_name: string;
  org_kind: string;
  is_demo: boolean;
  membership_id: string;
  role: OrgRole;
}

/** Programs the user is an eligible member of (drives catalogue visibility). */
export async function memberPrograms(q: Queryable, userId: string): Promise<ProgramAccess[]> {
  const r = await q.query<ProgramAccess>(
    `select p.id as program_id, p.name as program_name, p.slug as program_slug, o.id as org_id, o.slug as org_slug,
            o.name as org_name, o.kind as org_kind, p.is_demo, m.id as membership_id, m.role
       from program_memberships pm
       join programs p on p.id = pm.program_id and p.status = 'active'
       join memberships m on m.id = pm.membership_id and m.status = 'active'
            and (m.eligible_from is null or m.eligible_from <= current_date)
            and (m.eligible_until is null or m.eligible_until >= current_date)
       join organizations o on o.id = p.org_id and o.status = 'active'
      where m.user_id = $1
      order by (o.kind = 'culturosity') desc, o.name, p.name`,
    [userId],
  );
  return r.rows;
}

export async function requireProgramMember(c: Ctx, programId: string): Promise<ProgramAccess> {
  const user = requireUser(c);
  const progs = await memberPrograms(c.get("deps").db, user.id);
  const p = progs.find((x) => x.program_id === programId);
  if (!p) throw notFound("Offer not found or not available to you.");
  return p;
}

/** SQL fragment: offer currently claimable (enforced at read and redeem time). */
export const LIVE_PERK_SQL = `pk.status in ('published','scheduled') and pk.archived_at is null
  and (pk.starts_at is null or pk.starts_at <= now()) and (pk.ends_at is null or pk.ends_at > now())`;
