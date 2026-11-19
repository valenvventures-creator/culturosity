import { Hono } from "hono";
import type { AppEnv } from "../context";
import { requireUser } from "../lib/auth";
import { grantsFor, LIVE_PERK_SQL } from "../lib/authz";
import { badRequest } from "../lib/errors";
import { audit, rateLimit, track } from "../lib/security";
import { normaliseCode, sha256 } from "../lib/crypto";

export const providerRoutes = new Hono<AppEnv>();

/** Providers this user may verify for: explicit assignments, or owner/admin of the provider's org. */
async function verifiableProviders(db: any, userId: string, superAdmin: boolean): Promise<Set<string>> {
  if (superAdmin) return new Set(["*"]);
  const r = await db.query(
    `select pa.provider_id as id from provider_assignments pa where pa.user_id = $1 and pa.revoked_at is null
     union
     select p.id from providers p join memberships m on m.org_id = p.org_id and m.user_id = $1 and m.status = 'active' and m.role in ('owner','admin')`,
    [userId],
  );
  return new Set(r.rows.map((x: any) => x.id));
}

providerRoutes.get("/provider/me", async (c) => {
  const user = requireUser(c);
  const { db } = c.get("deps");
  const r = await db.query(
    `select p.id, p.name, p.provider_ref, p.pos_reference, o.slug as org_slug, o.name as org_name, o.is_demo,
            (select count(*)::int from perks k where k.provider_id = p.id and k.archived_at is null) as offer_count,
            (select count(*)::int from redemptions r where r.provider_id = p.id and r.verified_at > now() - interval '30 days') as verified_30d
       from providers p join organizations o on o.id = p.org_id
      where p.status = 'active' and (
        exists (select 1 from provider_assignments pa where pa.provider_id = p.id and pa.user_id = $1 and pa.revoked_at is null)
        or exists (select 1 from memberships m where m.org_id = p.org_id and m.user_id = $1 and m.status = 'active' and m.role in ('owner','admin')))
      order by p.name`,
    [user.id],
  );
  return c.json({ providers: r.rows });
});

/**
 * Verify a member's redemption reference (QR payload or manual code).
 * Checks: token exists & unexpired, verifier assigned to the token's provider, membership still
 * active, perk still live and still distributed to the program, per-member usage limit.
 * The usage increment is a single conditional UPDATE inside a transaction holding an advisory
 * lock per member+offer, so simultaneous scans cannot both succeed.
 */
providerRoutes.post("/provider/verify", async (c) => {
  const user = requireUser(c);
  const { db } = c.get("deps");
  await rateLimit(db, `verify:${user.id}`, 120, 600);
  const { code } = (await c.req.json().catch(() => ({}))) as { code?: string };
  const raw = String(code || "").trim();
  if (!raw) throw badRequest("Scan a member code or type the manual code.");
  let hashField = "code_hash";
  let hashValue = sha256(normaliseCode(raw));
  let scannedProviderRef: string | null = null;
  const m = raw.match(/^CUL1:([A-Z0-9-]+):([A-Za-z0-9_-]{20,64})$/);
  if (m) {
    hashField = "token_hash";
    hashValue = sha256(m[2]);
    scannedProviderRef = m[1];
  }
  const grants = await grantsFor(db, user.id);
  const allowed = await verifiableProviders(db, user.id, grants.has("super_admin"));

  const result = await db.tx(async (q) => {
    const t = await q.query<any>(
      `select t.*, p.title, p.value_label, p.usage_limit_per_member, p.is_demo, p.org_id as perk_org_id, pv.provider_ref, pv.name as provider_name,
              u.display_name as member_name
         from redemption_tokens t join perks p on p.id = t.perk_id join providers pv on pv.id = t.provider_id
         join app_users u on u.id = t.user_id
        where t.${hashField} = $1`,
      [hashValue],
    );
    const tok = t.rows[0];
    if (!tok) {
      // Promo codes and perk QR links are used at checkout, not here. Say so instead of a bare "not recognised".
      const looksLikeMemberCode = Boolean(m) || /^[2-9A-HJKMNP-Z]{10}$/.test(normaliseCode(raw));
      return {
        result: "not_found" as const,
        message: looksLikeMemberCode
          ? "This code was not recognised. Check it with the member, or ask them to get a new one-time code."
          : "That isn't a member's one-time code. Promo codes (like CULTURE10) and a perk's own QR code are used at your checkout, not here. Ask the member for their one-time code — 10 characters, like ABCDE-FGHJK.",
      };
    }
    if (!allowed.has("*") && !allowed.has(tok.provider_id))
      return { result: "wrong_provider" as const, message: "This code is for a different provider. You are not authorised to verify it." };
    if (scannedProviderRef && scannedProviderRef !== tok.provider_ref) return { result: "not_found" as const, message: "This code was not recognised." };
    const base = { offer: { title: tok.title, value: tok.value_label, provider: tok.provider_name }, memberFirstName: String(tok.member_name || "").split(" ")[0] || "Member" };
    if (tok.revoked_at) return { result: "expired" as const, message: "This code was replaced or revoked. Ask the member to refresh their card.", ...base };
    if (new Date(tok.expires_at) <= new Date()) return { result: "expired" as const, message: "This code has expired. Ask the member to generate a new one.", ...base };
    if (tok.uses >= tok.max_uses) return { result: "already_used" as const, message: "This code has already been used.", ...base };

    const elig = await q.query(
      `select 1 from memberships m
         join program_memberships pm on pm.membership_id = m.id and pm.program_id = $2
         join program_perks pp on pp.program_id = $2 and pp.perk_id = $3 and pp.status = 'active'
         join perks pk on pk.id = pp.perk_id
        where m.id = $1 and m.status = 'active'
          and (m.eligible_from is null or m.eligible_from <= current_date) and (m.eligible_until is null or m.eligible_until >= current_date)
          and ${LIVE_PERK_SQL}`,
      [tok.membership_id, tok.program_id, tok.perk_id],
    );
    if (!elig.rows.length) return { result: "not_eligible" as const, message: "The member is not currently eligible, or the offer is not available.", ...base };

    await q.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [`${tok.user_id}:${tok.perk_id}`]);
    if (tok.usage_limit_per_member) {
      const used = await q.query<{ n: number }>(`select count(*)::int as n from redemptions where user_id = $1 and perk_id = $2`, [tok.user_id, tok.perk_id]);
      if (used.rows[0].n >= tok.usage_limit_per_member)
        return { result: "already_used" as const, message: "The member has reached the usage limit for this offer.", ...base };
    }
    const upd = await q.query(
      `update redemption_tokens set uses = uses + 1 where id = $1 and uses < max_uses and revoked_at is null and expires_at > now() returning id`,
      [tok.id],
    );
    if (!upd.rows.length) return { result: "already_used" as const, message: "This code has already been used.", ...base };
    const snap = await q.query<any>(`select id, title, value_label, value_type, provider_id, starts_at, ends_at, redemption_method from perks where id = $1`, [tok.perk_id]);
    const r = await q.query<{ id: string; verified_at: string }>(
      `insert into redemptions (token_id, user_id, perk_id, program_id, provider_id, org_id, verified_by, perk_snapshot, is_demo)
       select $1, $2, $3, $4, $5, pr.org_id, $6, $7::jsonb, $8 from programs pr where pr.id = $4 returning id, verified_at`,
      [tok.id, tok.user_id, tok.perk_id, tok.program_id, tok.provider_id, user.id, JSON.stringify(snap.rows[0]), tok.is_demo],
    );
    const prog = await q.query<{ org_id: string }>(`select org_id from programs where id = $1`, [tok.program_id]);
    await track(q, { event: "redemption_verified", userId: tok.user_id, orgId: prog.rows[0].org_id, programId: tok.program_id, perkId: tok.perk_id, providerId: tok.provider_id, isDemo: tok.is_demo });
    await audit(q, { actor: user.id, orgId: prog.rows[0].org_id, action: "redemption.verified", targetType: "redemption", targetId: r.rows[0].id });
    return { result: "valid" as const, message: "Valid — redemption recorded.", redemptionId: r.rows[0].id, verifiedAt: r.rows[0].verified_at, ...base };
  });
  c.header("Cache-Control", "no-store");
  return c.json(result);
});

providerRoutes.get("/provider/redemptions", async (c) => {
  const user = requireUser(c);
  const { db } = c.get("deps");
  const grants = await grantsFor(db, user.id);
  const allowed = await verifiableProviders(db, user.id, grants.has("super_admin"));
  const ids = allowed.has("*") ? null : [...allowed];
  const r = await db.query(
    `select r.id, r.verified_at, r.perk_snapshot->>'title' as title, r.perk_snapshot->>'value_label' as value_label, pv.name as provider_name
       from redemptions r join providers pv on pv.id = r.provider_id
      where ($1::uuid[] is null or r.provider_id = any($1::uuid[])) order by r.verified_at desc limit 50`,
    [ids],
  );
  return c.json({ redemptions: r.rows });
});
