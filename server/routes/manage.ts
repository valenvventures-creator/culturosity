import { Hono } from "hono";
import type { AppEnv, Ctx } from "../context";
import { requireOrgRole, type OrgRole } from "../lib/authz";
import { badRequest, forbidden, fromZod, notFound, conflict } from "../lib/errors";
import { audit, rateLimit } from "../lib/security";
import { createPerk, updatePerk, newProviderRef } from "../lib/publish";
import { perkInputSchema, emailSchema } from "../../shared/schemas";
import { canTransition, effectiveStatus, statusForWindow, type PerkStatus } from "../../shared/perk";
import { utcToZoned } from "../../shared/time";
import { parseCsvObjects, toCsv } from "../../shared/csv";
import { randomToken, sha256 } from "../lib/crypto";
import { z } from "zod";

export const manageRoutes = new Hono<AppEnv>();
const ADMIN: OrgRole[] = ["owner", "admin"];
const CONTRIB: OrgRole[] = ["owner", "admin", "provider_manager"];

async function assignedProviderIds(c: Ctx, orgId: string, userId: string): Promise<string[]> {
  const r = await c.get("deps").db.query<{ provider_id: string }>(
    `select provider_id from provider_assignments where org_id = $1 and user_id = $2 and revoked_at is null`,
    [orgId, userId],
  );
  return r.rows.map((x) => x.provider_id);
}

/** Owner/admin => all offers. Provider manager => only assigned providers' offers. */
async function contributorScope(c: Ctx, slug: string) {
  const ctx = await requireOrgRole(c, slug, CONTRIB);
  const restricted = !ctx.elevated && ctx.membership?.role === "provider_manager";
  return { ...ctx, allowedProviderIds: restricted ? await assignedProviderIds(c, ctx.org.id, ctx.user.id) : null };
}

manageRoutes.get("/orgs/:slug", async (c) => {
  const { org, membership, elevated } = await requireOrgRole(c, c.req.param("slug"), ["owner", "admin", "provider_manager", "member"]);
  const { db } = c.get("deps");
  const programs = await db.query(`select id, slug, name, description, is_default, is_demo, moderation_required, status from programs where org_id = $1 order by is_default desc, name`, [org.id]);
  return c.json({
    org: { ...org, logo_url: org.logo_asset_id ? `/api/assets/${org.logo_asset_id}` : null },
    role: membership?.role ?? null,
    elevated,
    programs: programs.rows,
  });
});

manageRoutes.get("/orgs/:slug/dashboard", async (c) => {
  const { org } = await requireOrgRole(c, c.req.param("slug"), CONTRIB);
  const { db } = c.get("deps");
  const [perks, members, events, redemptions, pending, expiring, services] = await Promise.all([
    db.query<any>(`select status, starts_at, ends_at from perks where org_id = $1 and archived_at is null`, [org.id]),
    db.query<{ n: number }>(`select count(*)::int as n from memberships where org_id = $1 and status = 'active'`, [org.id]),
    db.query<any>(
      `select event, count(*)::int as n from analytics_events where org_id = $1 and created_at > now() - interval '30 days' group by event`,
      [org.id],
    ),
    db.query<{ n: number }>(`select count(*)::int as n from redemptions where org_id = $1 and verified_at > now() - interval '30 days'`, [org.id]),
    db.query<{ n: number }>(`select count(*)::int as n from perk_submissions where destination_org_id = $1 and status = 'pending_review'`, [org.id]),
    db.query<any>(
      `select p.id, p.title, p.ends_at, pv.name as provider_name from perks p join providers pv on pv.id = p.provider_id
        where p.org_id = $1 and p.status in ('published','scheduled') and p.ends_at between now() and now() + interval '21 days' order by p.ends_at limit 10`,
      [org.id],
    ),
    db.query<any>(`select id, status, created_at, service_needs from service_requests where org_id = $1 order by created_at desc limit 5`, [org.id]),
  ]);
  const counts: Record<string, number> = {};
  for (const p of perks.rows) {
    const s = effectiveStatus(p);
    counts[s] = (counts[s] ?? 0) + 1;
  }
  const ev: Record<string, number> = {};
  for (const e of events.rows) ev[e.event] = e.n;
  const daily = await db.query<any>(
    `select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day, event, count(*)::int as n
       from analytics_events where org_id = $1 and created_at > now() - interval '14 days'
        and event in ('perk_view','use_perk_click','redemption_verified') group by 1, 2 order by 1`,
    [org.id],
  );
  return c.json({
    isDemo: org.is_demo,
    offers: { live: counts.published ?? 0, scheduled: counts.scheduled ?? 0, paused: counts.paused ?? 0, drafts: counts.draft ?? 0, expired: counts.expired ?? 0 },
    activeMembers: members.rows[0].n,
    last30: {
      catalogueViews: ev.catalogue_view ?? 0,
      perkViews: ev.perk_view ?? 0,
      usePerkClicks: ev.use_perk_click ?? 0,
      redemptionsInitiated: ev.redemption_initiated ?? 0,
      redemptionsVerified: redemptions.rows[0].n,
      favourites: ev.favourite_add ?? 0,
    },
    daily: daily.rows,
    pendingReviews: pending.rows[0].n,
    expiringSoon: expiring.rows,
    serviceRequests: services.rows,
  });
});

// ---- Offers ----
manageRoutes.get("/orgs/:slug/perks", async (c) => {
  const { org, allowedProviderIds } = await contributorScope(c, c.req.param("slug"));
  const { db } = c.get("deps");
  const r = await db.query<any>(
    `select p.id, p.title, p.value_label, p.status, p.starts_at, p.ends_at, p.is_ongoing, p.timezone, p.published_at, p.updated_at,
            p.category, p.redemption_method, p.is_demo, p.provider_id, pv.name as provider_name, p.image_asset_id,
            coalesce((select json_agg(json_build_object('id', pr.id, 'name', pr.name, 'status', pp.status))
                        from program_perks pp join programs pr on pr.id = pp.program_id where pp.perk_id = p.id), '[]') as programs,
            (select count(*)::int from redemptions r where r.perk_id = p.id) as verified_redemptions
       from perks p join providers pv on pv.id = p.provider_id
      where p.org_id = $1 and ($2::uuid[] is null or p.provider_id = any($2::uuid[]))
      order by p.updated_at desc`,
    [org.id, allowedProviderIds],
  );
  const filter = c.req.query("status");
  const rows = r.rows
    .map((p) => ({ ...p, effective_status: effectiveStatus(p), image_url: p.image_asset_id ? `/api/assets/${p.image_asset_id}` : null }))
    .filter((p) => !filter || p.effective_status === filter);
  return c.json({ perks: rows });
});

/** Load an offer back into the submission form shape for editing / duplication. */
manageRoutes.get("/orgs/:slug/perks/:id", async (c) => {
  const { org, allowedProviderIds } = await contributorScope(c, c.req.param("slug"));
  const { db } = c.get("deps");
  const r = await db.query<any>(`select p.*, pv.name as provider_name, pv.description as provider_description, pv.category as provider_category,
      pv.website as provider_website, pv.public_email as provider_email, pv.public_phone as provider_phone, pv.logo_asset_id as provider_logo,
      pv.provider_ref, pv.pos_reference as provider_pos_reference
    from perks p join providers pv on pv.id = p.provider_id where p.id = $1 and p.org_id = $2`, [c.req.param("id"), org.id]);
  const p = r.rows[0];
  if (!p || (allowedProviderIds && !allowedProviderIds.includes(p.provider_id))) throw notFound("Offer not found.");
  const [occ, imgs, programs] = await Promise.all([
    db.query<any>(`select starts_at, ends_at, venue, notes from perk_occurrences where perk_id = $1 order by starts_at`, [p.id]),
    db.query<any>(`select asset_id, alt from perk_images where perk_id = $1 order by sort`, [p.id]),
    db.query<any>(`select pp.program_id, pp.status, pr.name from program_perks pp join programs pr on pr.id = pp.program_id where pp.perk_id = $1`, [p.id]),
  ]);
  const tz = p.timezone;
  const start = p.starts_at ? utcToZoned(p.starts_at, tz) : null;
  // ends_at is exclusive; an end at local midnight means "through the previous day".
  let endDate: string | undefined, endTime: string | undefined;
  if (p.ends_at) {
    const e = utcToZoned(p.ends_at, tz);
    if (e.time === "00:00") {
      const d = new Date(`${e.date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 1);
      endDate = d.toISOString().slice(0, 10);
    } else {
      endDate = e.date;
      endTime = e.time;
    }
  }
  const form = {
    provider: {
      existingId: p.provider_id,
      name: p.provider_name,
      description: p.provider_description,
      category: p.provider_category,
      website: p.provider_website ?? "",
      publicEmail: p.provider_email ?? "",
      publicPhone: p.provider_phone ?? "",
      logoAssetId: p.provider_logo ?? undefined,
    },
    title: p.title,
    shortDescription: p.short_description,
    fullDescription: p.full_description,
    category: p.category,
    tags: p.tags,
    value: {
      type: p.value_type,
      label: p.value_label,
      percent: p.value_percent != null ? Number(p.value_percent) : undefined,
      amount: p.value_amount_minor != null ? p.value_amount_minor / 100 : undefined,
      currency: p.currency ?? undefined,
      conditions: p.conditions,
    },
    availability: {
      ongoing: p.is_ongoing,
      startDate: start?.date,
      startTime: start && start.time !== "00:00" ? start.time : undefined,
      endDate,
      endTime,
      timezone: tz,
      bookingDeadline: p.booking_deadline ? utcToZoned(p.booking_deadline, tz).date : undefined,
      blackoutDates: p.blackout_dates ?? [],
    },
    occurrences: occ.rows.map((o) => {
      const s = utcToZoned(o.starts_at, tz);
      return { date: s.date, startTime: s.time, endTime: o.ends_at ? utcToZoned(o.ends_at, tz).time : undefined, venue: o.venue, notes: o.notes };
    }),
    media: { imageAssetId: p.image_asset_id ?? undefined, imageAlt: p.image_alt, additional: imgs.rows.map((i) => ({ assetId: i.asset_id, alt: i.alt })) },
    redemption: {
      method: p.redemption_method,
      url: p.redemption_url ?? "",
      instructions: p.redemption_instructions,
      promoCode: p.promo_code ?? "",
      usageLimitPerMember: p.usage_limit_per_member ?? undefined,
      posReference: p.pos_reference ?? "",
    },
    location: {
      onlineOnly: p.is_online_only,
      addressLine: p.address_line ?? "",
      city: p.city ?? "",
      region: p.region ?? "",
      postalCode: p.postal_code ?? "",
      country: p.country ?? "",
      lat: p.lat ?? undefined,
      lng: p.lng ?? undefined,
    },
    eligibility: { groups: p.eligibility_text, householdAllowed: p.household_allowed, exclusions: p.exclusions, terms: p.terms },
    allowDistribution: p.allow_distribution,
  };
  return c.json({
    perk: { id: p.id, status: p.status, effective_status: effectiveStatus(p), provider_ref: p.provider_ref, provider_pos_reference: p.provider_pos_reference, is_demo: p.is_demo, programs: programs.rows, published_at: p.published_at },
    form,
  });
});

manageRoutes.put("/orgs/:slug/perks/:id", async (c) => {
  const { org, user, allowedProviderIds } = await contributorScope(c, c.req.param("slug"));
  const parsed = perkInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw fromZod(parsed.error);
  const { db } = c.get("deps");
  const out = await db.tx(async (q) => {
    const r = await updatePerk(q, c.req.param("id"), org.id, parsed.data, user.id, allowedProviderIds);
    await audit(q, { actor: user.id, orgId: org.id, action: "perk.updated", targetType: "perk", targetId: r.perkId });
    return r;
  });
  return c.json(out);
});

manageRoutes.post("/orgs/:slug/perks/:id/status", async (c) => {
  const { org, user, allowedProviderIds } = await contributorScope(c, c.req.param("slug"));
  const { action } = (await c.req.json().catch(() => ({}))) as { action?: string };
  const { db } = c.get("deps");
  const out = await db.tx(async (q) => {
    const r = await q.query<any>(`select id, status, starts_at, ends_at, provider_id from perks where id = $1 and org_id = $2 for update`, [c.req.param("id"), org.id]);
    const p = r.rows[0];
    if (!p || (allowedProviderIds && !allowedProviderIds.includes(p.provider_id))) throw notFound("Offer not found.");
    const from = effectiveStatus(p) as PerkStatus;
    let to: PerkStatus;
    if (action === "pause") to = "paused";
    else if (action === "archive") to = "archived";
    else if (action === "publish" || action === "resume") {
      to = statusForWindow(p.starts_at ? new Date(p.starts_at) : null, p.ends_at ? new Date(p.ends_at) : null);
      if (to === "expired") throw badRequest("This offer has ended. Edit its dates before publishing again.");
    } else throw badRequest("Unknown action.");
    if (!canTransition(from, to)) throw badRequest(`An offer that is ${from.replace("_", " ")} cannot be moved to ${to.replace("_", " ")}.`);
    await q.query(
      `update perks set status = $3, updated_at = now(), archived_at = case when $3 = 'archived' then now() else archived_at end,
              published_at = case when $3 in ('published','scheduled') and published_at is null then now() else published_at end
        where id = $1 and org_id = $2`,
      [p.id, org.id, to],
    );
    if (to === "published" || to === "scheduled") {
      const has = await q.query(`select 1 from program_perks where perk_id = $1`, [p.id]);
      if (!has.rows.length) {
        const def = await q.query<{ id: string }>(`select id from programs where org_id = $1 and is_default`, [org.id]);
        if (def.rows[0]) await q.query(`insert into program_perks (program_id, perk_id, granted_by) values ($1,$2,$3)`, [def.rows[0].id, p.id, user.id]);
      }
    }
    await audit(q, { actor: user.id, orgId: org.id, action: `perk.${to}`, targetType: "perk", targetId: p.id, meta: { from } });
    return { status: to };
  });
  return c.json(out);
});

manageRoutes.post("/orgs/:slug/perks/:id/duplicate", async (c) => {
  const { org, user, allowedProviderIds } = await contributorScope(c, c.req.param("slug"));
  const { db } = c.get("deps");
  const src = await db.query<any>(`select provider_id from perks where id = $1 and org_id = $2`, [c.req.param("id"), org.id]);
  if (!src.rows[0] || (allowedProviderIds && !allowedProviderIds.includes(src.rows[0].provider_id))) throw notFound();
  const out = await db.tx(async (q) => {
    const cols = `provider_id, title, short_description, full_description, category, tags, value_type, value_label, value_percent,
      value_amount_minor, currency, conditions, is_ongoing, starts_at, ends_at, timezone, booking_deadline, blackout_dates, redemption_method,
      redemption_url, redemption_instructions, promo_code, usage_limit_per_member, pos_reference, is_online_only, address_line, city, region,
      postal_code, country, lat, lng, eligibility_text, household_allowed, exclusions, terms, image_asset_id, image_alt, allow_distribution, public_teaser, is_demo`;
    const r = await q.query<{ id: string }>(
      `insert into perks (org_id, status, created_by, ${cols})
       select org_id, 'draft', $3, ${cols.replace("title,", "title || ' (copy)',")} from perks where id = $1 and org_id = $2 returning id`,
      [c.req.param("id"), org.id, user.id],
    );
    const id = r.rows[0].id;
    await q.query(`insert into perk_occurrences (perk_id, starts_at, ends_at, venue, notes) select $2, starts_at, ends_at, venue, notes from perk_occurrences where perk_id = $1`, [c.req.param("id"), id]);
    await q.query(`insert into perk_images (perk_id, asset_id, sort, alt) select $2, asset_id, sort, alt from perk_images where perk_id = $1`, [c.req.param("id"), id]);
    await audit(q, { actor: user.id, orgId: org.id, action: "perk.duplicated", targetType: "perk", targetId: id, meta: { source: c.req.param("id") } });
    return { perkId: id };
  });
  return c.json(out, 201);
});

// Distribute an existing offer into another program of the same org.
manageRoutes.post("/orgs/:slug/perks/:id/programs", async (c) => {
  const { org, user } = await requireOrgRole(c, c.req.param("slug"), ADMIN);
  const { programId, status } = (await c.req.json().catch(() => ({}))) as { programId?: string; status?: string };
  const { db } = c.get("deps");
  const ok = await db.query(
    `select 1 from programs pr, perks p where pr.id = $1 and pr.org_id = $3 and p.id = $2 and p.org_id = $3`,
    [programId, c.req.param("id"), org.id],
  );
  if (!ok.rows.length) throw notFound();
  const st = status === "paused" || status === "revoked" ? status : "active";
  await db.query(
    `insert into program_perks (program_id, perk_id, status, granted_by) values ($1,$2,$3,$4)
     on conflict (program_id, perk_id) do update set status = excluded.status`,
    [programId, c.req.param("id"), st, user.id],
  );
  return c.json({ ok: true });
});

// ---- CSV import / export of offers ----
const IMPORT_FIELDS = [
  "provider_name", "title", "short_description", "full_description", "category", "value_type", "value_label", "value_percent",
  "value_amount", "currency", "ongoing", "start_date", "end_date", "timezone", "redemption_method", "redemption_url",
  "redemption_instructions", "promo_code", "online_only", "address_line", "city", "region", "postal_code", "country", "eligibility",
] as const;

function rowToInput(row: Record<string, string>, providerId: string | undefined) {
  const yes = (v: string) => /^(1|true|yes|y)$/i.test(v || "");
  return {
    provider: { existingId: providerId, name: row.provider_name, description: "", category: row.category || "" },
    title: row.title,
    shortDescription: row.short_description,
    fullDescription: row.full_description || row.short_description,
    category: row.category,
    tags: [],
    value: { type: row.value_type, label: row.value_label, percent: row.value_percent, amount: row.value_amount, currency: row.currency, conditions: "" },
    availability: { ongoing: yes(row.ongoing), startDate: row.start_date, endDate: row.end_date, timezone: row.timezone || "America/Toronto", blackoutDates: [] },
    occurrences: [],
    media: { imageAlt: "", additional: [] },
    redemption: { method: row.redemption_method, url: row.redemption_url, instructions: row.redemption_instructions, promoCode: row.promo_code },
    location: { onlineOnly: yes(row.online_only), addressLine: row.address_line, city: row.city, region: row.region, postalCode: row.postal_code, country: row.country },
    eligibility: { groups: row.eligibility || "All eligible program members", householdAllowed: false, exclusions: "", terms: "" },
    allowDistribution: false,
  };
}

manageRoutes.post("/orgs/:slug/import/perks", async (c) => {
  const { org, user } = await requireOrgRole(c, c.req.param("slug"), ADMIN);
  const { db } = c.get("deps");
  const body = (await c.req.json().catch(() => ({}))) as { csv?: string; mapping?: Record<string, string>; dryRun?: boolean; programId?: string; duplicates?: "skip" | "update" };
  if (!body.csv || body.csv.length > 2_000_000) throw badRequest("Paste or upload a CSV file (max 2 MB).");
  const { headers, rows } = parseCsvObjects(body.csv);
  if (rows.length > 1000) throw badRequest("Import up to 1,000 rows at a time.");
  const mapping = body.mapping ?? Object.fromEntries(IMPORT_FIELDS.map((f) => [f, headers.find((h) => h.toLowerCase().replace(/\s+/g, "_") === f) ?? ""]));
  const program = await db.query<{ id: string }>(
    `select id from programs where org_id = $1 and ${body.programId ? "id = $2" : "is_default"}`,
    body.programId ? [org.id, body.programId] : [org.id],
  );
  if (!program.rows[0]) throw badRequest("Choose a program to import into.");
  const results: { row: number; status: "valid" | "invalid" | "duplicate" | "created" | "updated" | "skipped"; title: string; errors?: Record<string, string> }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const mapped: Record<string, string> = {};
    for (const f of IMPORT_FIELDS) mapped[f] = mapping[f] ? rows[i][mapping[f]] ?? "" : "";
    const key = `${mapped.provider_name}|${mapped.title}`.toLowerCase();
    const prov = await db.query<{ id: string }>(`select id from providers where org_id = $1 and lower(name) = lower($2)`, [org.id, mapped.provider_name || ""]);
    const parsed = perkInputSchema.safeParse(rowToInput(mapped, prov.rows[0]?.id));
    if (!parsed.success) {
      results.push({ row: i + 2, status: "invalid", title: mapped.title, errors: fromZod(parsed.error).fields });
      continue;
    }
    const dup = await db.query<{ id: string }>(
      `select p.id from perks p join providers pv on pv.id = p.provider_id
        where p.org_id = $1 and lower(pv.name) = lower($2) and lower(p.title) = lower($3) and p.status <> 'archived' limit 1`,
      [org.id, mapped.provider_name, mapped.title],
    );
    const isDup = dup.rows.length > 0 || seen.has(key);
    seen.add(key);
    if (body.dryRun) {
      results.push({ row: i + 2, status: isDup ? "duplicate" : "valid", title: mapped.title });
      continue;
    }
    if (isDup && (body.duplicates ?? "skip") === "skip") {
      results.push({ row: i + 2, status: "skipped", title: mapped.title });
      continue;
    }
    try {
      await db.tx(async (q) => {
        if (isDup && dup.rows[0]) await updatePerk(q, dup.rows[0].id, org.id, parsed.data, user.id);
        else await createPerk(q, { orgId: org.id, programId: program.rows[0].id, input: parsed.data, actorId: user.id, isDemo: org.is_demo, intent: "publish" });
      });
      results.push({ row: i + 2, status: isDup ? "updated" : "created", title: mapped.title });
    } catch (e: any) {
      results.push({ row: i + 2, status: "invalid", title: mapped.title, errors: e.fields ?? { _: e.message } });
    }
  }
  if (!body.dryRun) await audit(db, { actor: user.id, orgId: org.id, action: "perk.imported", meta: { rows: rows.length } });
  return c.json({ headers, mapping, fields: IMPORT_FIELDS, results });
});

manageRoutes.get("/orgs/:slug/export/perks.csv", async (c) => {
  const { org, user } = await requireOrgRole(c, c.req.param("slug"), ADMIN);
  const { db } = c.get("deps");
  const r = await db.query<any>(
    `select pv.name as provider_name, p.title, p.short_description, p.category, p.value_type, p.value_label, p.status, p.starts_at, p.ends_at,
            p.is_ongoing, p.timezone, p.redemption_method, p.redemption_url, p.city, p.region, p.country, p.published_at, p.updated_at, p.id
       from perks p join providers pv on pv.id = p.provider_id where p.org_id = $1 order by pv.name, p.title`,
    [org.id],
  );
  await audit(db, { actor: user.id, orgId: org.id, action: "export.perks" });
  const rows = r.rows.map((x) => ({ ...x, status: effectiveStatus(x) }));
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="${org.slug}-offers.csv"`);
  c.header("Cache-Control", "no-store");
  return c.body(toCsv(Object.keys(rows[0] ?? { provider_name: "", title: "" }), rows));
});

// ---- Members ----
manageRoutes.get("/orgs/:slug/members", async (c) => {
  const { org } = await requireOrgRole(c, c.req.param("slug"), ADMIN);
  const { db } = c.get("deps");
  const [members, invites, rules] = await Promise.all([
    db.query(
      `select m.id, m.role, m.status, m.created_at, m.eligible_from, m.eligible_until, u.email, u.display_name,
              coalesce((select json_agg(pm.program_id) from program_memberships pm where pm.membership_id = m.id), '[]') as program_ids
         from memberships m join app_users u on u.id = m.user_id where m.org_id = $1 and m.status <> 'removed' order by u.email`,
      [org.id],
    ),
    db.query(`select id, email, role, program_id, expires_at, created_at from invitations where org_id = $1 and accepted_at is null and revoked_at is null order by created_at desc`, [org.id]),
    db.query(`select id, email_domain, program_id, created_at from enrollment_rules where org_id = $1 and revoked_at is null`, [org.id]),
  ]);
  return c.json({ members: members.rows, invitations: invites.rows, enrollmentRules: rules.rows });
});

async function createInvitation(c: Ctx, orgId: string, orgName: string, inviterId: string, email: string, role: OrgRole, programId: string | null) {
  const { db, email: mailer, config } = c.get("deps");
  const token = randomToken(32);
  await db.query(`update invitations set revoked_at = now() where org_id = $1 and lower(email) = lower($2) and accepted_at is null and revoked_at is null`, [orgId, email]);
  await db.query(
    `insert into invitations (org_id, email, role, program_id, token_hash, invited_by, expires_at) values ($1,$2,$3,$4,$5,$6,$7)`,
    [orgId, email, role, programId, sha256(token), inviterId, new Date(Date.now() + 7 * 86400_000)],
  );
  await mailer.send(db, {
    to: email,
    subject: `You're invited to ${orgName} on Culturosity`,
    text: `You've been invited to join ${orgName} on Culturosity as ${role.replace("_", " ")}.\n\nAccept within 7 days:\n${config.baseUrl}/auth/invite/${token}\n`,
  });
  return token;
}

const inviteSchema = z.object({
  email: emailSchema,
  role: z.enum(["owner", "admin", "provider_manager", "member"]),
  programId: z.string().uuid().optional().nullable(),
});

manageRoutes.post("/orgs/:slug/invitations", async (c) => {
  const { org, user, membership, elevated } = await requireOrgRole(c, c.req.param("slug"), ADMIN);
  const parsed = inviteSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw fromZod(parsed.error);
  const { email, role, programId } = parsed.data;
  if ((role === "owner" || role === "admin") && membership?.role !== "owner" && !elevated) throw forbidden("Only owners can invite owners or administrators.");
  const { db, config } = c.get("deps");
  await rateLimit(db, `invite:${user.id}`, 200, 3600);
  if (programId) {
    const p = await db.query(`select 1 from programs where id = $1 and org_id = $2`, [programId, org.id]);
    if (!p.rows.length) throw notFound("Program not found.");
  }
  const token = await createInvitation(c, org.id, org.name, user.id, email, role, programId ?? null);
  await audit(db, { actor: user.id, orgId: org.id, action: "membership.invited", meta: { role } });
  // Demo mode returns the link so a presenter can accept without an inbox.
  return c.json({ ok: true, inviteUrl: config.mode === "demo" && org.is_demo ? `/auth/invite/${token}` : undefined }, 201);
});

manageRoutes.delete("/orgs/:slug/invitations/:id", async (c) => {
  const { org } = await requireOrgRole(c, c.req.param("slug"), ADMIN);
  await c.get("deps").db.query(`update invitations set revoked_at = now() where id = $1 and org_id = $2`, [c.req.param("id"), org.id]);
  return c.json({ ok: true });
});

manageRoutes.post("/orgs/:slug/import/members", async (c) => {
  const { org, user, membership, elevated } = await requireOrgRole(c, c.req.param("slug"), ADMIN);
  const { csv, dryRun } = (await c.req.json().catch(() => ({}))) as { csv?: string; dryRun?: boolean };
  if (!csv) throw badRequest("Upload a CSV with an email column.");
  const { rows } = parseCsvObjects(csv);
  if (rows.length > 2000) throw badRequest("Import up to 2,000 members at a time.");
  const results: any[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const email = emailSchema.safeParse(rows[i].email ?? rows[i].Email ?? "");
    const role = (rows[i].role || "member").toLowerCase();
    if (!email.success) { results.push({ row: i + 2, status: "invalid", error: "Invalid email" }); continue; }
    if (!["member", "provider_manager", "admin"].includes(role)) { results.push({ row: i + 2, email: email.data, status: "invalid", error: "Role must be member, provider_manager or admin" }); continue; }
    if (role === "admin" && membership?.role !== "owner" && !elevated) { results.push({ row: i + 2, email: email.data, status: "invalid", error: "Only owners can import admins" }); continue; }
    if (seen.has(email.data)) { results.push({ row: i + 2, email: email.data, status: "duplicate" }); continue; }
    seen.add(email.data);
    const existing = await c.get("deps").db.query(
      `select 1 from memberships m join app_users u on u.id = m.user_id where m.org_id = $1 and lower(u.email) = $2 and m.status = 'active'`,
      [org.id, email.data],
    );
    if (existing.rows.length) { results.push({ row: i + 2, email: email.data, status: "already_member" }); continue; }
    if (!dryRun) await createInvitation(c, org.id, org.name, user.id, email.data, role as OrgRole, null);
    results.push({ row: i + 2, email: email.data, role, status: dryRun ? "valid" : "invited" });
  }
  if (!dryRun) await audit(c.get("deps").db, { actor: user.id, orgId: org.id, action: "membership.bulk_invited", meta: { rows: rows.length } });
  return c.json({ results });
});

manageRoutes.patch("/orgs/:slug/members/:id", async (c) => {
  const { org, user, membership, elevated } = await requireOrgRole(c, c.req.param("slug"), ADMIN);
  const body = (await c.req.json().catch(() => ({}))) as { role?: OrgRole; status?: "active" | "suspended" | "removed"; programIds?: string[] };
  const { db } = c.get("deps");
  const out = await db.tx(async (q) => {
    const r = await q.query<any>(`select id, user_id, role from memberships where id = $1 and org_id = $2 for update`, [c.req.param("id"), org.id]);
    const target = r.rows[0];
    if (!target) throw notFound();
    if (target.user_id === user.id && (body.role || body.status)) throw badRequest("You cannot change your own role or status.");
    const isOwner = membership?.role === "owner" || elevated;
    if ((target.role === "owner" || target.role === "admin" || body.role === "owner" || body.role === "admin") && !isOwner)
      throw forbidden("Only owners can change administrator or owner roles.");
    if (target.role === "owner" && (body.role && body.role !== "owner" || body.status && body.status !== "active")) {
      const owners = await q.query<{ n: number }>(`select count(*)::int as n from memberships where org_id = $1 and role = 'owner' and status = 'active'`, [org.id]);
      if (owners.rows[0].n <= 1) throw conflict("A workspace must keep at least one active owner.");
    }
    if (body.role) {
      if (!["owner", "admin", "provider_manager", "member"].includes(body.role)) throw badRequest("Invalid role.");
      await q.query(`update memberships set role = $2, updated_at = now() where id = $1`, [target.id, body.role]);
    }
    if (body.status) {
      if (!["active", "suspended", "removed"].includes(body.status)) throw badRequest("Invalid status.");
      await q.query(`update memberships set status = $2, updated_at = now() where id = $1`, [target.id, body.status]);
      if (body.status !== "active") await q.query(`update redemption_tokens set revoked_at = now() where membership_id = $1 and revoked_at is null`, [target.id]);
    }
    if (body.programIds) {
      const valid = await q.query<{ id: string }>(`select id from programs where org_id = $1 and id = any($2::uuid[])`, [org.id, body.programIds]);
      await q.query(`delete from program_memberships where membership_id = $1`, [target.id]);
      for (const p of valid.rows) await q.query(`insert into program_memberships (program_id, membership_id) values ($1,$2)`, [p.id, target.id]);
    }
    await audit(q, { actor: user.id, orgId: org.id, action: "membership.changed", targetType: "membership", targetId: target.id, meta: { role: body.role, status: body.status } });
    return { ok: true };
  });
  return c.json(out);
});

manageRoutes.post("/orgs/:slug/enrollment-rules", async (c) => {
  const { org, user, membership, elevated } = await requireOrgRole(c, c.req.param("slug"), ADMIN);
  if (membership?.role !== "owner" && !elevated) throw forbidden("Only owners can approve domain enrollment.");
  const { domain, programId } = (await c.req.json().catch(() => ({}))) as { domain?: string; programId?: string };
  const d = String(domain || "").trim().toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) throw badRequest("Enter a domain like example.com", { domain: "Invalid domain" });
  if (/^(gmail|yahoo|outlook|hotmail|icloud|aol|proton(mail)?)\./.test(d)) throw badRequest("Public email domains cannot be used for enrollment.");
  const { db } = c.get("deps");
  await db.query(`insert into enrollment_rules (org_id, email_domain, program_id, created_by) values ($1,$2,$3,$4)`, [org.id, d, programId ?? null, user.id]);
  await audit(db, { actor: user.id, orgId: org.id, action: "enrollment_rule.created", meta: { domain: d } });
  return c.json({ ok: true }, 201);
});

manageRoutes.delete("/orgs/:slug/enrollment-rules/:id", async (c) => {
  const { org } = await requireOrgRole(c, c.req.param("slug"), ADMIN);
  await c.get("deps").db.query(`update enrollment_rules set revoked_at = now() where id = $1 and org_id = $2`, [c.req.param("id"), org.id]);
  return c.json({ ok: true });
});

// ---- Programs ----
manageRoutes.post("/orgs/:slug/programs", async (c) => {
  const { org, user } = await requireOrgRole(c, c.req.param("slug"), ADMIN);
  const { name, description = "", moderationRequired = false } = (await c.req.json().catch(() => ({}))) as any;
  const n = String(name || "").trim();
  if (n.length < 2) throw badRequest("Enter a program name.", { name: "Enter a program name" });
  const slug = n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "program";
  const { db } = c.get("deps");
  const r = await db.query<{ id: string }>(
    `insert into programs (org_id, slug, name, description, moderation_required, is_demo) values ($1,$2,$3,$4,$5,$6)
     on conflict (org_id, slug) do nothing returning id`,
    [org.id, slug, n, String(description).slice(0, 1000), Boolean(moderationRequired), org.is_demo],
  );
  if (!r.rows[0]) throw conflict("A program with that name already exists.");
  await audit(db, { actor: user.id, orgId: org.id, action: "program.created", targetId: r.rows[0].id });
  return c.json({ id: r.rows[0].id }, 201);
});

manageRoutes.patch("/orgs/:slug/programs/:id", async (c) => {
  const { org } = await requireOrgRole(c, c.req.param("slug"), ADMIN);
  const b = (await c.req.json().catch(() => ({}))) as any;
  await c.get("deps").db.query(
    `update programs set name = coalesce($3, name), description = coalesce($4, description),
        moderation_required = coalesce($5, moderation_required), status = coalesce($6, status)
      where id = $1 and org_id = $2`,
    [c.req.param("id"), org.id, b.name ?? null, b.description ?? null, b.moderationRequired ?? null, ["active", "paused"].includes(b.status) ? b.status : null],
  );
  return c.json({ ok: true });
});

// ---- Providers ----
manageRoutes.get("/orgs/:slug/providers", async (c) => {
  const { org, allowedProviderIds } = await contributorScope(c, c.req.param("slug"));
  const { db } = c.get("deps");
  const r = await db.query(
    `select p.*, (select count(*)::int from perks k where k.provider_id = p.id and k.archived_at is null) as offer_count,
            (select min(k.ends_at) from perks k where k.provider_id = p.id and k.status in ('published','scheduled') and k.ends_at > now()) as next_expiry,
            coalesce((select json_agg(json_build_object('id', pa.id, 'email', u.email, 'name', u.display_name))
                        from provider_assignments pa join app_users u on u.id = pa.user_id
                       where pa.provider_id = p.id and pa.revoked_at is null), '[]') as managers,
            coalesce((select json_agg(l) from provider_locations l where l.provider_id = p.id), '[]') as locations
       from providers p where p.org_id = $1 and ($2::uuid[] is null or p.id = any($2::uuid[])) order by p.name`,
    [org.id, allowedProviderIds],
  );
  return c.json({ providers: r.rows });
});

manageRoutes.post("/orgs/:slug/providers", async (c) => {
  const { org, user } = await requireOrgRole(c, c.req.param("slug"), ADMIN);
  const b = (await c.req.json().catch(() => ({}))) as any;
  const name = String(b.name || "").trim();
  if (name.length < 2) throw badRequest("Enter the provider name.", { name: "Required" });
  const { db } = c.get("deps");
  const r = await db.query<{ id: string }>(
    `insert into providers (org_id, name, description, category, website, public_email, public_phone, provider_ref, is_demo)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
    [org.id, name, b.description ?? "", b.category ?? "", b.website || null, b.publicEmail || null, b.publicPhone || null, await newProviderRef(db), org.is_demo],
  );
  await audit(db, { actor: user.id, orgId: org.id, action: "provider.created", targetId: r.rows[0].id });
  return c.json({ id: r.rows[0].id }, 201);
});

manageRoutes.patch("/orgs/:slug/providers/:id", async (c) => {
  const { org, user } = await requireOrgRole(c, c.req.param("slug"), ADMIN);
  const b = (await c.req.json().catch(() => ({}))) as any;
  const { db } = c.get("deps");
  const r = await db.query(
    `update providers set name = coalesce($3, name), description = coalesce($4, description), website = coalesce($5, website),
            public_email = coalesce($6, public_email), public_phone = coalesce($7, public_phone),
            pos_reference = case when $8::boolean then $9 else pos_reference end, updated_at = now()
      where id = $1 and org_id = $2 returning id`,
    [c.req.param("id"), org.id, b.name ?? null, b.description ?? null, b.website ?? null, b.publicEmail ?? null, b.publicPhone ?? null, "posReference" in b, b.posReference ? String(b.posReference).slice(0, 120) : null],
  );
  if (!r.rows.length) throw notFound();
  await audit(db, { actor: user.id, orgId: org.id, action: "provider.updated", targetId: c.req.param("id"), meta: { posReferenceChanged: "posReference" in b } });
  return c.json({ ok: true });
});

manageRoutes.post("/orgs/:slug/providers/:id/locations", async (c) => {
  const { org } = await requireOrgRole(c, c.req.param("slug"), ADMIN);
  const b = (await c.req.json().catch(() => ({}))) as any;
  const { db } = c.get("deps");
  const p = await db.query(`select 1 from providers where id = $1 and org_id = $2`, [c.req.param("id"), org.id]);
  if (!p.rows.length) throw notFound();
  await db.query(
    `insert into provider_locations (provider_id, label, address_line, city, region, postal_code, country) values ($1,$2,$3,$4,$5,$6,$7)`,
    [c.req.param("id"), b.label ?? "", b.addressLine ?? null, b.city ?? null, b.region ?? null, b.postalCode ?? null, b.country ?? null],
  );
  return c.json({ ok: true }, 201);
});

manageRoutes.post("/orgs/:slug/providers/:id/assignments", async (c) => {
  const { org, user } = await requireOrgRole(c, c.req.param("slug"), ADMIN);
  const { email } = (await c.req.json().catch(() => ({}))) as { email?: string };
  const { db } = c.get("deps");
  const target = await db.query<{ user_id: string; role: string }>(
    `select m.user_id, m.role from memberships m join app_users u on u.id = m.user_id
      where m.org_id = $1 and lower(u.email) = lower($2) and m.status = 'active'`,
    [org.id, email ?? ""],
  );
  if (!target.rows[0]) throw badRequest("That person must be an active member of this workspace first (invite them as a provider manager).");
  const prov = await db.query(`select 1 from providers where id = $1 and org_id = $2`, [c.req.param("id"), org.id]);
  if (!prov.rows.length) throw notFound();
  await db.query(
    `insert into provider_assignments (provider_id, user_id, org_id, created_by) values ($1,$2,$3,$4) on conflict do nothing`,
    [c.req.param("id"), target.rows[0].user_id, org.id, user.id],
  );
  if (target.rows[0].role === "member") await db.query(`update memberships set role = 'provider_manager' where org_id = $1 and user_id = $2`, [org.id, target.rows[0].user_id]);
  await audit(db, { actor: user.id, orgId: org.id, action: "provider.assigned", targetId: c.req.param("id") });
  return c.json({ ok: true }, 201);
});

manageRoutes.delete("/orgs/:slug/providers/:id/assignments/:assignmentId", async (c) => {
  const { org, user } = await requireOrgRole(c, c.req.param("slug"), ADMIN);
  const { db } = c.get("deps");
  await db.query(`update provider_assignments set revoked_at = now() where id = $1 and provider_id = $2 and org_id = $3`, [c.req.param("assignmentId"), c.req.param("id"), org.id]);
  await audit(db, { actor: user.id, orgId: org.id, action: "provider.unassigned", targetId: c.req.param("id") });
  return c.json({ ok: true });
});

// ---- Branding ----
function relLum(hex: string) {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
export function contrastOnBlack(hex: string) {
  return (relLum(hex) + 0.05) / 0.05;
}

manageRoutes.patch("/orgs/:slug", async (c) => {
  const { org, user } = await requireOrgRole(c, c.req.param("slug"), ADMIN);
  const b = (await c.req.json().catch(() => ({}))) as any;
  if (b.accentColor && !/^#[0-9a-fA-F]{6}$/.test(b.accentColor)) throw badRequest("Use a hex colour like #57F6C3.", { accentColor: "Invalid colour" });
  if (b.accentColor && contrastOnBlack(b.accentColor) < 4.5)
    throw badRequest("Choose a lighter accent: it must have at least 4.5:1 contrast on the dark interface.", { accentColor: "Too little contrast" });
  const { db } = c.get("deps");
  if (b.logoAssetId) {
    const a = await db.query(`select 1 from assets where id = $1 and org_id = $2`, [b.logoAssetId, org.id]);
    if (!a.rows.length) throw forbidden("Logo must be uploaded to this workspace.");
    await db.query(`update assets set status = 'attached', scope = 'public' where id = $1`, [b.logoAssetId]);
  }
  await db.query(
    `update organizations set program_display_name = coalesce($2, program_display_name), welcome_copy = coalesce($3, welcome_copy),
            accent_color = coalesce($4, accent_color), logo_asset_id = coalesce($5, logo_asset_id), contact_name = coalesce($6, contact_name),
            contact_email = coalesce($7, contact_email), coverage = coalesce($8, coverage), approx_member_count = coalesce($9, approx_member_count),
            delivery_preference = coalesce($10, delivery_preference), updated_at = now()
      where id = $1`,
    [
      org.id,
      b.programDisplayName ?? null,
      b.welcomeCopy != null ? String(b.welcomeCopy).slice(0, 2000) : null,
      b.accentColor ?? null,
      b.logoAssetId ?? null,
      b.contactName ?? null,
      b.contactEmail ?? null,
      b.coverage ?? null,
      b.approxMemberCount ?? null,
      ["self_service", "launch", "managed"].includes(b.deliveryPreference) ? b.deliveryPreference : null,
    ],
  );
  await audit(db, { actor: user.id, orgId: org.id, action: "org.settings_updated" });
  return c.json({ ok: true });
});

// ---- Reports (aggregated; no member-level behaviour) ----
manageRoutes.get("/orgs/:slug/reports", async (c) => {
  const { org } = await requireOrgRole(c, c.req.param("slug"), ADMIN);
  const { db } = c.get("deps");
  const from = /^\d{4}-\d{2}-\d{2}$/.test(c.req.query("from") || "") ? c.req.query("from")! : new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(c.req.query("to") || "") ? c.req.query("to")! : new Date().toISOString().slice(0, 10);
  const programId = c.req.query("programId") || null;
  const params = [org.id, from, to, programId];
  const [totals, byPerk, byCategory, members] = await Promise.all([
    db.query<any>(
      `select event, count(*)::int as n, count(distinct user_id)::int as people from analytics_events
        where org_id = $1 and created_at >= $2::date and created_at < ($3::date + 1) and ($4::uuid is null or program_id = $4)
        group by event`,
      params,
    ),
    db.query<any>(
      `select p.id, p.title, pv.name as provider_name,
              count(*) filter (where e.event = 'perk_view')::int as views,
              count(*) filter (where e.event = 'use_perk_click')::int as clicks,
              count(*) filter (where e.event = 'redemption_initiated')::int as initiated,
              count(*) filter (where e.event = 'redemption_verified')::int as verified,
              count(*) filter (where e.event = 'favourite_add')::int as favourites
         from analytics_events e join perks p on p.id = e.perk_id join providers pv on pv.id = p.provider_id
        where e.org_id = $1 and e.created_at >= $2::date and e.created_at < ($3::date + 1) and ($4::uuid is null or e.program_id = $4)
        group by p.id, p.title, pv.name order by views desc limit 50`,
      params,
    ),
    db.query<any>(
      `select p.category, count(*) filter (where e.event = 'perk_view')::int as views, count(*) filter (where e.event = 'redemption_verified')::int as verified
         from analytics_events e join perks p on p.id = e.perk_id
        where e.org_id = $1 and e.created_at >= $2::date and e.created_at < ($3::date + 1) and ($4::uuid is null or e.program_id = $4)
        group by p.category order by views desc`,
      params,
    ),
    db.query<{ n: number }>(`select count(*)::int as n from memberships where org_id = $1 and status = 'active'`, [org.id]),
  ]);
  return c.json({
    range: { from, to },
    isDemo: org.is_demo,
    activeMembers: members.rows[0].n,
    totals: Object.fromEntries(totals.rows.map((t) => [t.event, { count: t.n, people: t.people }])),
    byPerk: byPerk.rows,
    byCategory: byCategory.rows,
    definitions: {
      perk_view: "A signed-in eligible member opened an offer's details page.",
      use_perk_click: "A member selected Use Perk and was sent to the provider's configured redemption website. A click is not proof of purchase or saving.",
      redemption_initiated: "A member generated a short-lived redemption code (QR/manual) for an in-person or hybrid offer.",
      redemption_verified: "An authorised provider verified the member's redemption code on the server. This is the realised-use measure.",
      favourite_add: "A member saved an offer.",
      estimated_savings: "Not reported: no defensible per-redemption savings calculation is configured.",
    },
  });
});

// ---- Licensed Culturosity offers ----
manageRoutes.get("/orgs/:slug/licensed-offers", async (c) => {
  const { org } = await requireOrgRole(c, c.req.param("slug"), ADMIN);
  const { db } = c.get("deps");
  const r = await db.query<any>(
    `select pk.id, pk.title, pk.value_label, pk.ends_at, pk.is_ongoing, pv.name as provider_name, src.name as source_program,
            coalesce((select json_agg(pp2.program_id) from program_perks pp2 join programs p2 on p2.id = pp2.program_id
                       where pp2.perk_id = pk.id and p2.org_id = $1 and pp2.status = 'active'), '[]') as included_in
       from program_entitlements e join programs src on src.id = e.source_program_id
       join program_perks pp on pp.program_id = src.id and pp.status = 'active'
       join perks pk on pk.id = pp.perk_id and pk.allow_distribution and pk.status in ('published','scheduled')
       join providers pv on pv.id = pk.provider_id
      where e.org_id = $1 and e.revoked_at is null order by pv.name, pk.title`,
    [org.id],
  );
  return c.json({ offers: r.rows });
});

manageRoutes.post("/orgs/:slug/licensed-offers", async (c) => {
  const { org, user } = await requireOrgRole(c, c.req.param("slug"), ADMIN);
  const { perkId, programId, include } = (await c.req.json().catch(() => ({}))) as { perkId?: string; programId?: string; include?: boolean };
  const { db } = c.get("deps");
  const ok = await db.query(
    `select 1 from program_entitlements e join program_perks pp on pp.program_id = e.source_program_id and pp.status = 'active'
       join perks pk on pk.id = pp.perk_id and pk.allow_distribution
      where e.org_id = $1 and e.revoked_at is null and pk.id = $2`,
    [org.id, perkId],
  );
  if (!ok.rows.length) throw forbidden("This offer is not licensed for your organization, or its provider does not permit distribution.");
  const prog = await db.query(`select 1 from programs where id = $1 and org_id = $2`, [programId, org.id]);
  if (!prog.rows.length) throw notFound("Program not found.");
  if (include === false) await db.query(`update program_perks set status = 'revoked' where program_id = $1 and perk_id = $2`, [programId, perkId]);
  else
    await db.query(
      `insert into program_perks (program_id, perk_id, granted_by) values ($1,$2,$3) on conflict (program_id, perk_id) do update set status = 'active'`,
      [programId, perkId, user.id],
    );
  await audit(db, { actor: user.id, orgId: org.id, action: include === false ? "licensed_offer.removed" : "licensed_offer.included", targetId: perkId ?? null });
  return c.json({ ok: true });
});

// ---- Announcement drafts / launch materials ----
manageRoutes.get("/orgs/:slug/announcements", async (c) => {
  const { org } = await requireOrgRole(c, c.req.param("slug"), ADMIN);
  const r = await c.get("deps").db.query(`select id, title, body, updated_at from announcement_drafts where org_id = $1 order by updated_at desc`, [org.id]);
  return c.json({ drafts: r.rows });
});

manageRoutes.put("/orgs/:slug/announcements", async (c) => {
  const { org, user } = await requireOrgRole(c, c.req.param("slug"), ADMIN);
  const b = (await c.req.json().catch(() => ({}))) as { id?: string; title?: string; body?: string };
  const title = String(b.title || "").trim().slice(0, 200);
  const text = String(b.body || "").slice(0, 20000);
  if (!title) throw badRequest("Give the draft a title.", { title: "Required" });
  const { db } = c.get("deps");
  if (b.id) {
    const r = await db.query(`update announcement_drafts set title = $3, body = $4, updated_by = $5, updated_at = now() where id = $1 and org_id = $2 returning id`, [b.id, org.id, title, text, user.id]);
    if (!r.rows.length) throw notFound();
    return c.json({ id: b.id });
  }
  const r = await db.query<{ id: string }>(`insert into announcement_drafts (org_id, title, body, updated_by) values ($1,$2,$3,$4) returning id`, [org.id, title, text, user.id]);
  return c.json({ id: r.rows[0].id }, 201);
});

manageRoutes.delete("/orgs/:slug/announcements/:id", async (c) => {
  const { org } = await requireOrgRole(c, c.req.param("slug"), ADMIN);
  await c.get("deps").db.query(`delete from announcement_drafts where id = $1 and org_id = $2`, [c.req.param("id"), org.id]);
  return c.json({ ok: true });
});

manageRoutes.get("/orgs/:slug/audit", async (c) => {
  const { org } = await requireOrgRole(c, c.req.param("slug"), ["owner"]);
  const r = await c.get("deps").db.query(
    `select a.action, a.target_type, a.target_id, a.created_at, u.email as actor_email from audit_logs a
       left join app_users u on u.id = a.actor_user_id where a.org_id = $1 order by a.created_at desc limit 200`,
    [org.id],
  );
  return c.json({ entries: r.rows });
});
