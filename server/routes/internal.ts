import { Hono } from "hono";
import type { AppEnv, Ctx } from "../context";
import { requireGrant, requireUnlock, grantsFor } from "../lib/authz";
import { requireVerified } from "../lib/auth";
import { AppError, badRequest, conflict, forbidden, fromZod, notFound } from "../lib/errors";
import { audit, rateLimit, sourceHash } from "../lib/security";
import { hashSecret, verifySecret } from "../lib/crypto";
import { getSetting, setSetting } from "../lib/settings";
import { researchOrgSchema, outreachRequestSchema, PIPELINE_STAGES, OUTREACH_OBJECTIVES } from "../../shared/schemas";
import { parseCsvObjects, toCsv } from "../../shared/csv";
import { templateOutreach, type OutreachContext } from "../lib/outreach";
import { z } from "zod";

export const internalRoutes = new Hono<AppEnv>();

// ================= Numerical-code gate =================
internalRoutes.get("/internal/gate", async (c) => {
  const { user } = await requireGrant(c, ["super_admin", "sales_admin"]);
  const { db, config } = c.get("deps");
  const configured = Boolean(await getSetting<string>(db, "gate_code_hash"));
  const u = await db.query<{ expires_at: string; last_activity_at: string }>(
    `select expires_at, last_activity_at from admin_unlocks where session_id = $1 and user_id = $2 and revoked_at is null and expires_at > now()
        and last_activity_at > now() - make_interval(mins => $3) order by created_at desc limit 1`,
    [c.get("sessionId"), user.id, config.gateIdleMinutes],
  );
  c.header("Cache-Control", "no-store");
  return c.json({ configured, unlocked: Boolean(u.rows[0]), expiresAt: u.rows[0]?.expires_at ?? null, idleMinutes: config.gateIdleMinutes });
});

internalRoutes.post("/internal/gate/unlock", async (c) => {
  const { user } = await requireGrant(c, ["super_admin", "sales_admin"]);
  const { db, config } = c.get("deps");
  const src = sourceHash(c);
  const fails = await db.query<{ acct: number; source: number }>(
    `select count(*) filter (where user_id = $1)::int as acct, count(*) filter (where source_hash = $2)::int as source
       from gate_attempts where not success and created_at > now() - interval '15 minutes'`,
    [user.id, src],
  );
  if (fails.rows[0].acct >= 5 || fails.rows[0].source >= 20)
    throw new AppError(429, "rate_limited", "Too many incorrect codes. Wait 15 minutes and try again.");
  const { code } = (await c.req.json().catch(() => ({}))) as { code?: string };
  const digits = String(code ?? "");
  const stored = await getSetting<string>(db, "gate_code_hash");
  if (!stored) throw new AppError(503, "gate_not_configured", "The access code has not been initialised. Run npm run gate:init on the server.");
  const ok = /^\d{4,20}$/.test(digits) && (await verifySecret(digits, stored));
  // The entered code is never stored or logged.
  await db.query(`insert into gate_attempts (user_id, source_hash, success) values ($1,$2,$3)`, [user.id, src, ok]);
  await audit(db, { actor: user.id, action: ok ? "gate.unlocked" : "gate.failed_attempt" });
  if (!ok) {
    const remaining = Math.max(0, 4 - fails.rows[0].acct);
    throw new AppError(401, "invalid_code", remaining ? `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} left before a 15-minute pause.` : "Incorrect code.");
  }
  await db.query(`update admin_unlocks set revoked_at = now() where session_id = $1 and revoked_at is null`, [c.get("sessionId")]);
  const expires = new Date(Date.now() + config.gateAbsoluteMinutes * 60_000);
  await db.query(`insert into admin_unlocks (session_id, user_id, expires_at) values ($1,$2,$3)`, [c.get("sessionId"), user.id, expires]);
  return c.json({ ok: true, expiresAt: expires.toISOString(), idleMinutes: config.gateIdleMinutes });
});

internalRoutes.post("/internal/gate/lock", async (c) => {
  const { user } = await requireGrant(c, ["super_admin", "sales_admin"]);
  const { db } = c.get("deps");
  await db.query(`update admin_unlocks set revoked_at = now() where session_id = $1 and revoked_at is null`, [c.get("sessionId")]);
  await audit(db, { actor: user.id, action: "gate.locked" });
  return c.json({ ok: true });
});

internalRoutes.post("/internal/gate/rotate", async (c) => {
  const { user } = await requireUnlock(c, ["super_admin"]);
  const { db } = c.get("deps");
  await rateLimit(db, `gate-rotate:${user.id}`, 5, 3600);
  const { currentCode, newCode } = (await c.req.json().catch(() => ({}))) as { currentCode?: string; newCode?: string };
  const stored = await getSetting<string>(db, "gate_code_hash");
  if (!(await verifySecret(String(currentCode ?? ""), stored))) throw new AppError(401, "invalid_code", "Current code is incorrect.");
  if (!/^\d{6,20}$/.test(String(newCode ?? ""))) throw badRequest("New code must be 6–20 digits.", { newCode: "6–20 digits" });
  await setSetting(db, "gate_code_hash", await hashSecret(String(newCode)), user.id);
  await db.query(`update admin_unlocks set revoked_at = now() where revoked_at is null and session_id <> $1`, [c.get("sessionId")]);
  await audit(db, { actor: user.id, action: "gate.code_rotated" });
  return c.json({ ok: true });
});

internalRoutes.get("/internal/overview", async (c) => {
  await requireUnlock(c);
  const { db } = c.get("deps");
  const [orgs, pipeline, services, activity] = await Promise.all([
    db.query<any>(`select count(*)::int as n, count(*) filter (where verification_status = 'source_reviewed')::int as verified, max(last_checked_at) as last_checked from research_organizations where legacy_of is null`),
    db.query<any>(`select stage, count(*)::int as n from prospects group by stage`),
    db.query<any>(`select status, count(*)::int as n from service_requests where not is_demo group by status`),
    db.query<any>(`select a.kind, a.summary, a.occurred_at, r.display_name from sales_activities a join research_organizations r on r.id = a.research_org_id order by a.occurred_at desc limit 8`),
  ]);
  return c.json({ research: orgs.rows[0], pipeline: pipeline.rows, services: services.rows, recentActivity: activity.rows });
});

// ================= Research directory =================
function researchFilters(c: Ctx, params: unknown[]) {
  const q = c.req.query();
  const parts: string[] = ["r.legacy_of is null"];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    parts.push(sql.replaceAll("?", `$${params.length}`));
  };
  if (q.q) add(`(r.display_name ilike ? or array_to_string(r.aliases, ' ') ilike ? or coalesce(r.primary_domain,'') ilike ? or exists (select 1 from research_programs p where p.organization_id = r.id and (p.name ilike ? or p.summary ilike ?)))`, `%${q.q}%`);
  if (q.country) add(`? = any(r.country)`, q.country);
  if (q.region) add(`r.region ilike ?`, `%${q.region}%`);
  if (q.industry) add(`r.industry ilike ?`, `%${q.industry}%`);
  if (q.type) add(`? = any(r.prospect_types)`, q.type);
  if (q.category) add(`exists (select 1 from research_programs p where p.organization_id = r.id and ? = any(p.perk_categories))`, q.category);
  if (q.operator) add(`exists (select 1 from research_programs p join research_organizations op on op.id = p.operator_org_id where p.organization_id = r.id and op.display_name ilike ?)`, `%${q.operator}%`);
  if (q.letter && /^[A-Z#]$/.test(q.letter))
    q.letter === "#" ? parts.push(`r.display_name !~* '^[a-z]'`) : add(`upper(left(r.display_name, 1)) = ?`, q.letter);
  if (q.stage) add(`coalesce(pr.stage, 'researching') = ?`, q.stage);
  if (q.freshness === "stale") parts.push(`(r.last_checked_at is null or r.last_checked_at < now() - interval '90 days')`);
  if (q.freshness === "fresh") parts.push(`r.last_checked_at >= now() - interval '90 days'`);
  if (q.verification) add(`r.verification_status = ?`, q.verification);
  return parts.join(" and ");
}

internalRoutes.get("/internal/research", async (c) => {
  await requireUnlock(c);
  const { db } = c.get("deps");
  const params: unknown[] = [];
  const where = researchFilters(c, params);
  const page = Math.max(1, Number(c.req.query("page") || 1));
  const size = Math.min(200, Math.max(10, Number(c.req.query("pageSize") || 100)));
  const r = await db.query<any>(
    `select r.id, r.display_name, r.aliases, r.primary_domain, r.country, r.region, r.industry, r.prospect_types, r.verification_status,
            r.last_checked_at, r.research_focus, coalesce(pr.stage, 'researching') as stage, pr.do_not_contact, pr.next_action, pr.due_date,
            (select json_agg(json_build_object('id', p.id, 'name', p.name, 'program_url', p.program_url, 'operator', op.display_name) order by p.name)
               from research_programs p left join research_organizations op on op.id = p.operator_org_id where p.organization_id = r.id) as programs,
            (select count(*)::int from research_sources s where s.organization_id = r.id) as source_count,
            count(*) over() as total
       from research_organizations r left join prospects pr on pr.research_org_id = r.id
      where ${where}
      order by lower(r.display_name), r.id
      limit ${size} offset ${(page - 1) * size}`,
    params,
  );
  const stats = await db.query<any>(
    `select count(*)::int as total, count(*) filter (where verification_status = 'source_reviewed')::int as verified,
            count(*) filter (where 'CA' = any(country))::int as canada, count(*) filter (where 'US' = any(country))::int as usa,
            max(last_checked_at) as last_research
       from research_organizations where legacy_of is null`,
  );
  c.header("Cache-Control", "private, no-store");
  return c.json({ records: r.rows.map(({ total, ...x }) => x), total: r.rows[0]?.total ?? 0, page, pageSize: size, stats: stats.rows[0] });
});

internalRoutes.get("/internal/research/connector", async (c) => {
  await requireUnlock(c);
  const { research } = c.get("deps");
  return c.json({
    liveSearch: research.searchConfigured ? "configured" : "not_configured",
    urlRecheck: "available",
    note: research.searchConfigured
      ? "Live search proposals require admin review before they become research records."
      : "Live web search is not configured. Use manual entry, CSV import, and URL recheck. No results are simulated.",
  });
});

internalRoutes.get("/internal/research/export.csv", async (c) => {
  const { user } = await requireUnlock(c);
  const { db } = c.get("deps");
  const params: unknown[] = [];
  const where = researchFilters(c, params);
  const r = await db.query<any>(
    `select r.display_name as organization, p.name as program, op.display_name as operator, array_to_string(r.prospect_types, '; ') as prospect_types,
            array_to_string(r.country, '; ') as country, r.region, r.industry, r.audience, p.summary as program_summary,
            array_to_string(p.perk_categories, '; ') as perk_categories, p.eligibility, p.pricing, p.official_website, p.program_url, p.contact_url,
            p.public_email, p.public_phone,
            (select string_agg(s.url || ' (' || s.review_level || ' ' || to_char(s.reviewed_at, 'YYYY-MM-DD') || ')', ' | ') from research_sources s where s.organization_id = r.id) as sources,
            r.verification_status, r.last_checked_at, coalesce(pr.stage, 'researching') as stage
       from research_organizations r left join research_programs p on p.organization_id = r.id
       left join research_organizations op on op.id = p.operator_org_id left join prospects pr on pr.research_org_id = r.id
      where ${where} order by lower(r.display_name), p.name`,
    params,
  );
  await audit(db, { actor: user.id, action: "export.research", meta: { rows: r.rows.length } });
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="culturosity-research-${new Date().toISOString().slice(0, 10)}.csv"`);
  c.header("Cache-Control", "no-store");
  const headers = ["organization", "program", "operator", "prospect_types", "country", "region", "industry", "audience", "program_summary", "perk_categories", "eligibility", "pricing", "official_website", "program_url", "contact_url", "public_email", "public_phone", "sources", "verification_status", "last_checked_at", "stage"];
  return c.body(toCsv(headers, r.rows));
});

internalRoutes.get("/internal/research/:id", async (c) => {
  await requireUnlock(c);
  const { db } = c.get("deps");
  const id = c.req.param("id");
  const r = await db.query<any>(`select r.*, l.display_name as legacy_of_name from research_organizations r left join research_organizations l on l.id = r.legacy_of where r.id = $1`, [id]);
  if (!r.rows[0]) throw notFound();
  const [programs, operated, sources, prospect, contacts, drafts, activities, aliases] = await Promise.all([
    db.query(`select p.*, op.display_name as operator_name from research_programs p left join research_organizations op on op.id = p.operator_org_id where p.organization_id = $1 order by p.name`, [id]),
    db.query(`select p.id, p.name, o.id as organization_id, o.display_name as organization from research_programs p join research_organizations o on o.id = p.organization_id where p.operator_org_id = $1`, [id]),
    db.query(`select * from research_sources where organization_id = $1 order by reviewed_at desc`, [id]),
    db.query(`select p.*, u.email as owner_email from prospects p left join app_users u on u.id = p.owner_user_id where p.research_org_id = $1`, [id]),
    db.query(`select * from business_contacts where research_org_id = $1 order by created_at`, [id]),
    db.query(`select d.id, d.version, d.objective, d.channel, d.generator, d.model, d.created_at, d.content, d.parent_id, u.email as author from outreach_drafts d left join app_users u on u.id = d.author_id where d.research_org_id = $1 order by d.created_at desc limit 30`, [id]),
    db.query(`select a.*, u.email as user_email from sales_activities a left join app_users u on u.id = a.user_id where a.research_org_id = $1 order by a.occurred_at desc limit 50`, [id]),
    db.query(`select id, display_name, primary_domain from research_organizations where legacy_of = $1`, [id]),
  ]);
  c.header("Cache-Control", "private, no-store");
  return c.json({
    record: r.rows[0],
    programs: programs.rows,
    operatedPrograms: operated.rows,
    sources: sources.rows,
    prospect: prospect.rows[0] ?? null,
    contacts: contacts.rows,
    drafts: drafts.rows,
    activities: activities.rows,
    legacyAliases: aliases.rows,
  });
});

async function findDuplicate(c: Ctx, name: string, domain?: string | null, excludeId?: string) {
  const r = await c.get("deps").db.query<{ id: string; display_name: string }>(
    `select id, display_name from research_organizations
      where (lower(display_name) = lower($1) or lower($1) = any(select lower(a) from unnest(aliases) a) or ($2::text is not null and lower(primary_domain) = lower($2)))
        and ($3::uuid is null or id <> $3) limit 1`,
    [name, domain ?? null, excludeId ?? null],
  );
  return r.rows[0] ?? null;
}

internalRoutes.post("/internal/research", async (c) => {
  const { user } = await requireUnlock(c);
  const parsed = researchOrgSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw fromZod(parsed.error);
  const b = parsed.data;
  const dup = await findDuplicate(c, b.displayName, b.primaryDomain);
  if (dup) throw new AppError(409, "duplicate", `A record for “${dup.display_name}” already exists.`, { id: dup.id });
  const { db } = c.get("deps");
  const id = await db.tx(async (q) => {
    const r = await q.query<{ id: string }>(
      `insert into research_organizations (display_name, aliases, primary_domain, country, region, industry, prospect_types, audience, research_focus,
         internal_notes, fit_assessment, verification_status, last_checked_at, created_by)
       values ($1,$2::text[],$3,$4::text[],$5,$6,$7::text[],$8,$9,$10,$11,$12,$13,$14) returning id`,
      [b.displayName, b.aliases, b.primaryDomain ?? null, b.country, b.region, b.industry, b.prospectTypes, b.audience, b.researchFocus, b.internalNotes, b.fitAssessment,
       b.source ? "source_reviewed" : "unverified", b.source ? new Date(b.source.reviewedAt) : null, user.id],
    );
    const orgId = r.rows[0].id;
    let programId: string | null = null;
    if (b.program) {
      const p = await q.query<{ id: string }>(
        `insert into research_programs (organization_id, name, summary, coverage, perk_categories, eligibility, pricing, official_website, program_url,
           contact_url, public_email, public_phone, verification_status, last_checked_at)
         values ($1,$2,$3,$4,$5::text[],$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
        [orgId, b.program.name, b.program.summary, b.program.coverage, b.program.perkCategories, b.program.eligibility, b.program.pricing, b.program.officialWebsite ?? null,
         b.program.programUrl ?? null, b.program.contactUrl ?? null, b.program.publicEmail ?? null, b.program.publicPhone ?? null,
         b.source ? "source_reviewed" : "unverified", b.source ? new Date(b.source.reviewedAt) : null],
      );
      programId = p.rows[0].id;
    }
    if (b.source)
      await q.query(`insert into research_sources (organization_id, program_id, url, title, review_level, reviewed_at, note, created_by) values ($1,$2,$3,$4,'page_reviewed',$5,$6,$7)`, [
        orgId, programId, b.source.url, b.source.title, new Date(b.source.reviewedAt), b.source.note, user.id,
      ]);
    await audit(q, { actor: user.id, action: "research.created", targetType: "research_organization", targetId: orgId });
    return orgId;
  });
  return c.json({ id }, 201);
});

const researchPatchSchema = z.object({
  displayName: z.string().trim().min(2).max(200).optional(),
  aliases: z.array(z.string().trim().max(200)).max(20).optional(),
  primaryDomain: z.string().trim().toLowerCase().max(200).nullable().optional(),
  country: z.array(z.enum(["CA", "US"])).min(1).optional(),
  region: z.string().max(200).optional(),
  industry: z.string().max(120).optional(),
  prospectTypes: z.array(z.enum(["employer", "association", "operator", "merchant"])).min(1).optional(),
  audience: z.string().max(500).optional(),
  researchFocus: z.string().max(300).optional(),
  internalNotes: z.string().max(5000).optional(),
  fitAssessment: z.string().max(2000).optional(),
  verificationStatus: z.enum(["source_reviewed", "url_rechecked", "unverified", "needs_review"]).optional(),
  legacyOf: z.string().uuid().nullable().optional(),
});

internalRoutes.patch("/internal/research/:id", async (c) => {
  const { user } = await requireUnlock(c);
  const parsed = researchPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw fromZod(parsed.error);
  const b = parsed.data;
  const id = c.req.param("id");
  if (b.displayName || b.primaryDomain) {
    const dup = await findDuplicate(c, b.displayName ?? "", b.primaryDomain, id);
    if (dup && !b.legacyOf) throw new AppError(409, "duplicate", `Conflicts with existing record “${dup.display_name}”.`, { id: dup.id });
  }
  if (b.legacyOf === id) throw badRequest("A record cannot be a legacy alias of itself.");
  const map: Record<string, string> = {
    displayName: "display_name", aliases: "aliases", primaryDomain: "primary_domain", country: "country", region: "region", industry: "industry",
    prospectTypes: "prospect_types", audience: "audience", researchFocus: "research_focus", internalNotes: "internal_notes",
    fitAssessment: "fit_assessment", verificationStatus: "verification_status", legacyOf: "legacy_of",
  };
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const [k, v] of Object.entries(b)) {
    if (v === undefined) continue;
    params.push(v);
    const cast = ["aliases", "country", "prospectTypes"].includes(k) ? "::text[]" : "";
    sets.push(`${map[k]} = $${params.length}${cast}`);
  }
  if (!sets.length) return c.json({ ok: true });
  const { db } = c.get("deps");
  const r = await db.query(`update research_organizations set ${sets.join(", ")}, updated_at = now() where id = $1 returning id`, params);
  if (!r.rows.length) throw notFound();
  await audit(db, { actor: user.id, action: "research.updated", targetType: "research_organization", targetId: id, meta: { fields: Object.keys(b) } });
  return c.json({ ok: true });
});

internalRoutes.put("/internal/research/:id/programs/:programId?", async (c) => {
  const { user } = await requireUnlock(c);
  const schema = researchOrgSchema.shape.program.unwrap().extend({ operatorOrgId: z.string().uuid().nullable().optional() });
  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw fromZod(parsed.error);
  const p = parsed.data;
  const { db } = c.get("deps");
  const pid = c.req.param("programId");
  const vals = [p.name, p.summary, p.coverage, p.perkCategories, p.eligibility, p.pricing, p.officialWebsite ?? null, p.programUrl ?? null, p.contactUrl ?? null, p.publicEmail ?? null, p.publicPhone ?? null, p.operatorOrgId ?? null];
  if (pid) {
    const r = await db.query(
      `update research_programs set name=$3, summary=$4, coverage=$5, perk_categories=$6::text[], eligibility=$7, pricing=$8, official_website=$9,
              program_url=$10, contact_url=$11, public_email=$12, public_phone=$13, operator_org_id=$14, updated_at=now()
        where id = $1 and organization_id = $2 returning id`,
      [pid, c.req.param("id"), ...vals],
    );
    if (!r.rows.length) throw notFound();
  } else {
    await db.query(
      `insert into research_programs (organization_id, name, summary, coverage, perk_categories, eligibility, pricing, official_website, program_url,
         contact_url, public_email, public_phone, operator_org_id) values ($1,$2,$3,$4,$5::text[],$6,$7,$8,$9,$10,$11,$12,$13)`,
      [c.req.param("id"), ...vals],
    );
  }
  await audit(db, { actor: user.id, action: "research.program_saved", targetId: c.req.param("id") });
  return c.json({ ok: true });
});

internalRoutes.post("/internal/research/:id/sources", async (c) => {
  const { user } = await requireUnlock(c);
  const parsed = researchOrgSchema.shape.source.unwrap().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw fromZod(parsed.error);
  const s = parsed.data;
  const { db } = c.get("deps");
  await db.query(
    `insert into research_sources (organization_id, url, title, review_level, reviewed_at, note, created_by) values ($1,$2,$3,'page_reviewed',$4,$5,$6)`,
    [c.req.param("id"), s.url, s.title, new Date(s.reviewedAt), s.note, user.id],
  );
  await db.query(
    `update research_organizations set last_checked_at = greatest(coalesce(last_checked_at, $2), $2), verification_status = 'source_reviewed', updated_at = now() where id = $1`,
    [c.req.param("id"), new Date(s.reviewedAt)],
  );
  return c.json({ ok: true }, 201);
});

/** Recheck a stored source URL. This confirms reachability/redirects only — not every claim on the page. */
internalRoutes.post("/internal/research/:id/sources/:sourceId/recheck", async (c) => {
  const { user } = await requireUnlock(c);
  const { db, research } = c.get("deps");
  await rateLimit(db, `recheck:${user.id}`, 60, 3600);
  const s = await db.query<any>(`select * from research_sources where id = $1 and organization_id = $2`, [c.req.param("sourceId"), c.req.param("id")]);
  if (!s.rows[0]) throw notFound();
  const result = await research.recheck(s.rows[0].url);
  const origHost = new URL(s.rows[0].url).hostname.replace(/^www\./, "");
  const finalHost = result.finalUrl ? new URL(result.finalUrl).hostname.replace(/^www\./, "") : null;
  const crossDomain = Boolean(finalHost && finalHost !== origHost);
  await db.query(
    `insert into research_sources (organization_id, program_id, url, title, review_level, reviewed_at, http_status, redirected_to, note, created_by)
     values ($1,$2,$3,$4,'url_rechecked',now(),$5,$6,$7,$8)`,
    [c.req.param("id"), s.rows[0].program_id, s.rows[0].url, result.title, result.status, result.redirected ? result.finalUrl : null,
     result.ok ? (crossDomain ? "Redirected to a different domain — review before relying on this source." : "Reachable. Page claims were not re-verified.") : `Recheck failed: ${result.error ?? result.status}`,
     user.id],
  );
  await db.query(
    `update research_organizations set last_checked_at = now(),
            verification_status = case when $2 then verification_status when $3 then 'needs_review' else verification_status end, updated_at = now()
      where id = $1`,
    [c.req.param("id"), result.ok && !crossDomain, !result.ok || crossDomain],
  );
  return c.json({ result, crossDomain });
});

const IMPORT_COLUMNS = ["organization", "program", "operator", "prospect_types", "country", "region", "industry", "audience", "program_summary", "official_website", "program_url", "contact_url", "public_email", "public_phone", "source_url", "reviewed_at"];

internalRoutes.post("/internal/research/import", async (c) => {
  const { user } = await requireUnlock(c);
  const { csv, dryRun } = (await c.req.json().catch(() => ({}))) as { csv?: string; dryRun?: boolean };
  if (!csv || csv.length > 3_000_000) throw badRequest("Upload a CSV (max 3 MB).");
  const { rows } = parseCsvObjects(csv);
  const { db } = c.get("deps");
  const results: any[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const types = (row.prospect_types || "").split(/[;|]/).map((t) => t.trim().toLowerCase()).filter(Boolean);
    const domain = (() => {
      try {
        return row.official_website ? new URL(row.official_website).hostname.replace(/^www\./, "") : undefined;
      } catch {
        return undefined;
      }
    })();
    const candidate = {
      displayName: row.organization,
      primaryDomain: domain,
      country: (row.country || "").split(/[;|,]/).map((x) => x.trim().toUpperCase()).filter((x) => x === "CA" || x === "US"),
      region: row.region || "",
      industry: row.industry || "",
      prospectTypes: types,
      audience: row.audience || "",
      program: row.program ? { name: row.program, summary: row.program_summary || "", officialWebsite: row.official_website || undefined, programUrl: row.program_url || undefined, contactUrl: row.contact_url || undefined, publicEmail: row.public_email || undefined, publicPhone: row.public_phone || undefined } : undefined,
      source: row.source_url ? { url: row.source_url, title: "", reviewedAt: row.reviewed_at || new Date().toISOString().slice(0, 10), note: "Imported" } : undefined,
    };
    const parsed = researchOrgSchema.safeParse(candidate);
    if (!parsed.success) {
      results.push({ row: i + 2, organization: row.organization, status: "invalid", errors: fromZod(parsed.error).fields });
      continue;
    }
    const dup = await findDuplicate(c, parsed.data.displayName, parsed.data.primaryDomain);
    if (dup) {
      results.push({ row: i + 2, organization: row.organization, status: "duplicate", existing: dup.display_name });
      continue;
    }
    if (dryRun) {
      results.push({ row: i + 2, organization: row.organization, status: "valid" });
      continue;
    }
    const b = parsed.data;
    await db.tx(async (q) => {
      const r = await q.query<{ id: string }>(
        `insert into research_organizations (display_name, primary_domain, country, region, industry, prospect_types, audience, verification_status, last_checked_at, created_by)
         values ($1,$2,$3::text[],$4,$5,$6::text[],$7,'unverified',null,$8) returning id`,
        [b.displayName, b.primaryDomain ?? null, b.country, b.region, b.industry, b.prospectTypes, b.audience, user.id],
      );
      let pid: string | null = null;
      if (b.program) {
        const p = await q.query<{ id: string }>(
          `insert into research_programs (organization_id, name, summary, official_website, program_url, contact_url, public_email, public_phone)
           values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
          [r.rows[0].id, b.program.name, b.program.summary, b.program.officialWebsite ?? null, b.program.programUrl ?? null, b.program.contactUrl ?? null, b.program.publicEmail ?? null, b.program.publicPhone ?? null],
        );
        pid = p.rows[0].id;
      }
      // Imported evidence is labelled "imported" until a person reviews it.
      if (b.source)
        await q.query(`insert into research_sources (organization_id, program_id, url, review_level, reviewed_at, note, created_by) values ($1,$2,$3,'imported',$4,'Imported — needs review',$5)`, [
          r.rows[0].id, pid, b.source.url, new Date(b.source.reviewedAt), user.id,
        ]);
    });
    results.push({ row: i + 2, organization: row.organization, status: "created" });
  }
  if (!dryRun) await audit(db, { actor: user.id, action: "research.imported", meta: { rows: rows.length } });
  return c.json({ columns: IMPORT_COLUMNS, results });
});

// ================= Pipeline, contacts, activities =================
internalRoutes.get("/internal/pipeline", async (c) => {
  await requireUnlock(c);
  const r = await c.get("deps").db.query(
    `select p.*, r.display_name, r.prospect_types, u.email as owner_email,
            (select max(a.occurred_at) from sales_activities a where a.research_org_id = r.id and a.kind <> 'stage_change') as last_activity
       from prospects p join research_organizations r on r.id = p.research_org_id left join app_users u on u.id = p.owner_user_id
      order by p.due_date nulls last, lower(r.display_name)`,
  );
  return c.json({ prospects: r.rows, stages: PIPELINE_STAGES });
});

internalRoutes.put("/internal/prospects/:researchOrgId", async (c) => {
  const { user } = await requireUnlock(c);
  const b = (await c.req.json().catch(() => ({}))) as any;
  if (b.stage && !PIPELINE_STAGES.includes(b.stage)) throw badRequest("Unknown stage.");
  if (b.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(b.dueDate)) throw badRequest("Invalid due date.");
  const { db } = c.get("deps");
  const rid = c.req.param("researchOrgId");
  const exists = await db.query(`select 1 from research_organizations where id = $1`, [rid]);
  if (!exists.rows.length) throw notFound();
  let ownerId: string | null | undefined;
  if (b.ownerEmail !== undefined) {
    ownerId = null;
    if (b.ownerEmail) {
      const o = await db.query<{ user_id: string }>(`select g.user_id from platform_grants g join app_users u on u.id = g.user_id where lower(u.email) = lower($1) and g.revoked_at is null limit 1`, [b.ownerEmail]);
      if (!o.rows[0]) throw badRequest("Owner must be a Culturosity admin.");
      ownerId = o.rows[0].user_id;
    }
  }
  await db.tx(async (q) => {
    const prev = await q.query<{ stage: string }>(`select stage from prospects where research_org_id = $1 for update`, [rid]);
    const dnc = b.stage === "do_not_contact" ? true : b.doNotContact;
    await q.query(
      `insert into prospects (research_org_id, stage, owner_user_id, next_action, due_date, notes, do_not_contact)
       values ($1, coalesce($2, 'researching'), $3, coalesce($4, ''), $5, coalesce($6, ''), coalesce($7, false))
       on conflict (research_org_id) do update set
         stage = coalesce($2, prospects.stage),
         owner_user_id = case when $8::boolean then $3 else prospects.owner_user_id end,
         next_action = coalesce($4, prospects.next_action), due_date = case when $9::boolean then $5::date else prospects.due_date end,
         notes = coalesce($6, prospects.notes), do_not_contact = coalesce($7, prospects.do_not_contact), updated_at = now()`,
      [rid, b.stage ?? null, ownerId ?? user.id, b.nextAction ?? null, b.dueDate || null, b.notes ?? null, dnc ?? null, ownerId !== undefined, "dueDate" in b],
    );
    if (b.stage && prev.rows[0]?.stage !== b.stage)
      await q.query(`insert into sales_activities (research_org_id, user_id, kind, summary) values ($1,$2,'stage_change',$3)`, [rid, user.id, `Stage → ${b.stage}`]);
  });
  return c.json({ ok: true });
});

internalRoutes.post("/internal/research/:id/activities", async (c) => {
  const { user } = await requireUnlock(c);
  const b = (await c.req.json().catch(() => ({}))) as { kind?: string; summary?: string; occurredAt?: string; advanceToContacted?: boolean };
  if (!["email", "call", "sms", "meeting", "demo", "note"].includes(b.kind || "")) throw badRequest("Choose an activity type.");
  if (!b.summary || b.summary.trim().length < 3) throw badRequest("Describe what happened.", { summary: "Required" });
  const { db } = c.get("deps");
  const rid = c.req.param("id");
  const p = await db.query<{ stage: string; do_not_contact: boolean }>(`select stage, do_not_contact from prospects where research_org_id = $1`, [rid]);
  if (p.rows[0]?.do_not_contact && b.kind !== "note") throw conflict("This organization is marked Do Not Contact. Only notes can be logged.");
  await db.query(`insert into sales_activities (research_org_id, user_id, kind, summary, occurred_at) values ($1,$2,$3,$4,$5)`, [
    rid, user.id, b.kind, b.summary.trim().slice(0, 4000), b.occurredAt ? new Date(b.occurredAt) : new Date(),
  ]);
  if (b.advanceToContacted && b.kind !== "note") {
    await db.query(
      `insert into prospects (research_org_id, stage, owner_user_id) values ($1,'contacted',$2)
       on conflict (research_org_id) do update set stage = case when prospects.stage in ('researching','qualified','contact_planned') then 'contacted' else prospects.stage end, updated_at = now()`,
      [rid, user.id],
    );
  }
  return c.json({ ok: true }, 201);
});

internalRoutes.post("/internal/research/:id/contacts", async (c) => {
  const { user } = await requireUnlock(c);
  const b = (await c.req.json().catch(() => ({}))) as any;
  if (!b.provenance || String(b.provenance).trim().length < 3) throw badRequest("Record where this contact detail came from.", { provenance: "Required" });
  if (!b.email && !b.phone && !b.name) throw badRequest("Add at least a name, email or phone.");
  const perm = (v: unknown) => (["unknown", "permitted", "opted_out"].includes(String(v)) ? v : "unknown");
  await c.get("deps").db.query(
    `insert into business_contacts (research_org_id, name, title, email, phone, provenance, source_url, email_permission, sms_permission, phone_permission, do_not_contact)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [c.req.param("id"), b.name ?? "", b.title ?? "", b.email || null, b.phone || null, String(b.provenance).slice(0, 500), b.sourceUrl || null, perm(b.emailPermission), perm(b.smsPermission), perm(b.phonePermission), Boolean(b.doNotContact)],
  );
  await audit(c.get("deps").db, { actor: user.id, action: "research.contact_added", targetId: c.req.param("id") });
  return c.json({ ok: true }, 201);
});

internalRoutes.patch("/internal/contacts/:id", async (c) => {
  await requireUnlock(c);
  const b = (await c.req.json().catch(() => ({}))) as any;
  const perm = (v: unknown) => (["unknown", "permitted", "opted_out"].includes(String(v)) ? v : null);
  await c.get("deps").db.query(
    `update business_contacts set email_permission = coalesce($2, email_permission), sms_permission = coalesce($3, sms_permission),
            phone_permission = coalesce($4, phone_permission), do_not_contact = coalesce($5, do_not_contact) where id = $1`,
    [c.req.param("id"), perm(b.emailPermission), perm(b.smsPermission), perm(b.phonePermission), typeof b.doNotContact === "boolean" ? b.doNotContact : null],
  );
  return c.json({ ok: true });
});

// ================= Outreach drafts =================
internalRoutes.post("/internal/outreach/generate", async (c) => {
  const { user } = await requireUnlock(c);
  const parsed = outreachRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw fromZod(parsed.error);
  const b = parsed.data;
  const { db, ai } = c.get("deps");
  const useAi = (c.req.query("ai") ?? "1") !== "0";
  if (useAi && ai.configured) await rateLimit(db, `ai:${user.id}`, 40, 3600);
  const rec = await db.query<any>(`select * from research_organizations where id = $1`, [b.researchOrgId]);
  if (!rec.rows[0]) throw notFound();
  const pr = await db.query<any>(`select stage, do_not_contact from prospects where research_org_id = $1`, [b.researchOrgId]);
  if (pr.rows[0]?.do_not_contact || pr.rows[0]?.stage === "do_not_contact")
    throw conflict("This organization is marked Do Not Contact. Outreach drafting is disabled.");
  const programs = await db.query<any>(`select name, summary from research_programs where organization_id = $1 order by name limit 1`, [b.researchOrgId]);
  const sources = await db.query<any>(
    `select id, url from research_sources where organization_id = $1 and ($2::uuid[] = '{}' or id = any($2::uuid[])) and review_level <> 'imported' order by reviewed_at desc limit 5`,
    [b.researchOrgId, b.sourceIds],
  );
  const ctx: OutreachContext = {
    organization: rec.rows[0].display_name,
    prospectTypes: rec.rows[0].prospect_types,
    programName: sources.rows.length ? programs.rows[0]?.name ?? null : null,
    programSummary: sources.rows.length ? programs.rows[0]?.summary ?? null : null,
    audience: rec.rows[0].audience || null,
    sourceUrls: sources.rows.map((s) => s.url),
    objective: b.objective,
    channel: b.channel,
    persona: b.persona,
    tone: b.tone,
    senderName: b.senderName || user.display_name,
  };
  let content;
  let generator: "ai" | "template" = "template";
  let model: string | null = null;
  let aiError: string | null = null;
  if (useAi && ai.configured) {
    try {
      content = await ai.draftOutreach(ctx);
      generator = "ai";
      model = ai.model;
    } catch (e) {
      aiError = (e as Error).message;
    }
  }
  if (!content) content = templateOutreach(ctx);
  if (b.channel === "sms") {
    const permitted = await db.query(`select 1 from business_contacts where research_org_id = $1 and sms_permission = 'permitted' and not do_not_contact limit 1`, [b.researchOrgId]);
    if (!permitted.rows.length) content.warnings.unshift("No contact at this organization has a recorded SMS permission. Do not send this as a text message.");
  }
  return c.json({
    generator,
    model,
    label: generator === "ai" ? "AI-assisted draft — review every line before use" : "Example template",
    aiConfigured: ai.configured,
    aiError,
    content,
    sourceIds: sources.rows.map((s) => s.id),
    sourceUrls: ctx.sourceUrls,
    objectiveLabel: OUTREACH_OBJECTIVES[b.objective],
  });
});

internalRoutes.post("/internal/outreach/drafts", async (c) => {
  const { user } = await requireUnlock(c);
  const b = (await c.req.json().catch(() => ({}))) as any;
  if (!b.researchOrgId || !b.content?.sections) throw badRequest("Nothing to save.");
  const { db } = c.get("deps");
  let version = 1;
  if (b.parentId) {
    const p = await db.query<{ version: number }>(`select version from outreach_drafts where id = $1 and research_org_id = $2`, [b.parentId, b.researchOrgId]);
    if (p.rows[0]) version = p.rows[0].version + 1;
  }
  const r = await db.query<{ id: string }>(
    `insert into outreach_drafts (research_org_id, author_id, parent_id, version, objective, persona, tone, channel, content, generator, model, source_ids, source_urls)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12::uuid[],$13::text[]) returning id`,
    [b.researchOrgId, user.id, b.parentId ?? null, version, b.objective, b.persona ?? "", b.tone ?? "", b.channel, JSON.stringify(b.content),
     b.generator === "ai" ? "ai" : "template", b.model ?? null, b.sourceIds ?? [], b.sourceUrls ?? []],
  );
  return c.json({ id: r.rows[0].id, version }, 201);
});

// ================= Client workspace administration =================
internalRoutes.get("/internal/orgs", async (c) => {
  await requireGrant(c, ["super_admin", "sales_admin"]);
  const { db } = c.get("deps");
  const grants = await grantsFor(db, c.get("user")!.id);
  const r = await db.query(
    `select o.id, o.slug, o.name, o.kind, o.is_demo, o.status, o.delivery_preference, o.approx_member_count, o.created_at,
            (select count(*)::int from memberships m where m.org_id = o.id and m.status = 'active') as members,
            (select count(*)::int from perks p where p.org_id = o.id and p.status in ('published','scheduled')) as offers,
            coalesce((select json_agg(json_build_object('id', e.id, 'source_program_id', e.source_program_id)) from program_entitlements e where e.org_id = o.id and e.revoked_at is null), '[]') as entitlements
       from organizations o where ($1 or o.is_demo) order by o.kind, o.name`,
    [grants.has("super_admin")],
  );
  const sources = await db.query(`select p.id, p.name, p.is_demo from programs p join organizations o on o.id = p.org_id where o.kind = 'culturosity' order by p.name`);
  return c.json({ orgs: r.rows, culturosityPrograms: sources.rows });
});

internalRoutes.post("/internal/entitlements", async (c) => {
  const { user } = await requireGrant(c, ["super_admin"]);
  const { orgId, sourceProgramId, revoke } = (await c.req.json().catch(() => ({}))) as { orgId?: string; sourceProgramId?: string; revoke?: boolean };
  const { db } = c.get("deps");
  const ok = await db.query(
    `select 1 from organizations o, programs p join organizations po on po.id = p.org_id and po.kind = 'culturosity' where o.id = $1 and o.kind = 'client' and p.id = $2`,
    [orgId, sourceProgramId],
  );
  if (!ok.rows.length) throw badRequest("Choose a client organization and a Culturosity program.");
  if (revoke) {
    await db.query(`update program_entitlements set revoked_at = now() where org_id = $1 and source_program_id = $2 and revoked_at is null`, [orgId, sourceProgramId]);
    await db.query(
      `update program_perks pp set status = 'revoked' from programs p, program_perks src
        where pp.program_id = p.id and p.org_id = $1 and src.program_id = $2 and src.perk_id = pp.perk_id`,
      [orgId, sourceProgramId],
    );
  } else {
    await db.query(`insert into program_entitlements (org_id, source_program_id, granted_by) values ($1,$2,$3) on conflict do nothing`, [orgId, sourceProgramId, user.id]);
  }
  await audit(db, { actor: user.id, orgId, action: revoke ? "entitlement.revoked" : "entitlement.granted", targetId: sourceProgramId ?? null });
  return c.json({ ok: true });
});

internalRoutes.post("/internal/demo/reset", async (c) => {
  const { user } = await requireUnlock(c);
  const { db, config, storage } = c.get("deps");
  const { resetDemoData } = await import("../seed/demo");
  await resetDemoData(db, { password: process.env.SEED_DEMO_PASSWORD || null, keepUsers: true, storage });
  await audit(db, { actor: user.id, action: "demo.reset" });
  return c.json({ ok: true, mode: config.mode });
});

// ================= Self-service company onboarding =================
const onboardingSchema = z.object({
  name: z.string().trim().min(2).max(160),
  contactName: z.string().trim().min(2).max(120),
  contactEmail: z.string().trim().toLowerCase().email(),
  coverage: z.string().trim().max(300).default(""),
  approxMemberCount: z.coerce.number().int().min(1).max(10_000_000).optional(),
  deliveryPreference: z.enum(["self_service", "launch", "managed"]),
  programName: z.string().trim().max(120).optional(),
});

internalRoutes.post("/orgs", async (c) => {
  const user = requireVerified(c);
  const { db } = c.get("deps");
  await rateLimit(db, `org-create:${user.id}`, 5, 86400);
  const parsed = onboardingSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw fromZod(parsed.error);
  const b = parsed.data;
  const base = b.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "company";
  const out = await db.tx(async (q) => {
    let slug = base;
    for (let i = 2; (await q.query(`select 1 from organizations where slug = $1`, [slug])).rows.length; i++) slug = `${base}-${i}`;
    const o = await q.query<{ id: string }>(
      `insert into organizations (slug, name, kind, contact_name, contact_email, coverage, approx_member_count, delivery_preference, program_display_name)
       values ($1,$2,'client',$3,$4,$5,$6,$7,$8) returning id`,
      [slug, b.name, b.contactName, b.contactEmail, b.coverage, b.approxMemberCount ?? null, b.deliveryPreference, b.programName || `${b.name} Perks`],
    );
    const p = await q.query<{ id: string }>(`insert into programs (org_id, slug, name, is_default) values ($1,'perks',$2,true) returning id`, [o.rows[0].id, b.programName || `${b.name} Perks`]);
    const m = await q.query<{ id: string }>(`insert into memberships (user_id, org_id, role) values ($1,$2,'owner') returning id`, [user.id, o.rows[0].id]);
    await q.query(`insert into program_memberships (program_id, membership_id) values ($1,$2)`, [p.rows[0].id, m.rows[0].id]);
    if (b.deliveryPreference !== "self_service") {
      await q.query(
        `insert into service_requests (org_id, organization_name, contact_name, contact_email, approx_member_count, service_needs, approach, coverage, message, submitted_by)
         values ($1,$2,$3,$4,$5,$6::text[],$7,$8,'Requested during workspace onboarding.',$9)`,
        [o.rows[0].id, b.name, b.contactName, b.contactEmail, b.approxMemberCount ?? null, ["Branded portal setup and launch"], b.deliveryPreference, b.coverage, user.id],
      );
    }
    await audit(q, { actor: user.id, orgId: o.rows[0].id, action: "org.created", meta: { delivery: b.deliveryPreference } });
    return { slug };
  });
  return c.json(out, 201);
});

export { forbidden };
