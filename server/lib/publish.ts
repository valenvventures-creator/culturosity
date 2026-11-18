// The single publication pipeline used by direct publishing, review approval, edits and imports.
// One transaction writes provider, perk, occurrences, images and the program publication.
import type { Queryable } from "../db";
import type { PerkInput } from "../../shared/schemas";
import { defaultValueLabel, statusForWindow, type PerkStatus } from "../../shared/perk";
import { windowFromInput, zonedToUtc } from "../../shared/time";
import { badRequest, forbidden, notFound } from "./errors";
import { shortCode } from "./crypto";

export async function newProviderRef(q: Queryable): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const ref = `CUL-P-${shortCode(6)}`;
    const r = await q.query(`select 1 from providers where provider_ref = $1`, [ref]);
    if (!r.rows.length) return ref;
  }
  throw new Error("Could not allocate provider reference");
}

/** Assets referenced by an offer must belong to the destination org (or be internal Culturosity assets for the Culturosity org). */
async function assertAssets(q: Queryable, orgId: string, ids: (string | undefined)[]) {
  const list = ids.filter(Boolean) as string[];
  if (!list.length) return;
  const r = await q.query<{ id: string; org_id: string | null }>(`select id, org_id from assets where id = any($1::uuid[])`, [list]);
  if (r.rows.length !== new Set(list).size) throw badRequest("An uploaded image could not be found. Please upload it again.", { "media.imageAssetId": "Upload the image again" });
  for (const a of r.rows) if (a.org_id !== orgId) throw forbidden("An image belongs to a different workspace.");
}

export async function upsertProvider(
  q: Queryable,
  orgId: string,
  p: PerkInput["provider"],
  opts: { isDemo: boolean; allowedProviderIds?: string[] | null },
): Promise<string> {
  if (p.existingId) {
    const r = await q.query<{ id: string }>(`select id from providers where id = $1 and org_id = $2 and status = 'active'`, [p.existingId, orgId]);
    if (!r.rows[0]) throw notFound("Provider not found in this workspace.");
    if (opts.allowedProviderIds && !opts.allowedProviderIds.includes(p.existingId)) throw forbidden("You are not assigned to this provider.");
    await q.query(
      `update providers set description = coalesce(nullif($3,''), description), category = coalesce(nullif($4,''), category),
              website = coalesce($5, website), public_email = coalesce($6, public_email), public_phone = coalesce($7, public_phone),
              logo_asset_id = coalesce($8, logo_asset_id), updated_at = now()
        where id = $1 and org_id = $2`,
      [p.existingId, orgId, p.description, p.category, p.website ?? null, p.publicEmail ?? null, p.publicPhone ?? null, p.logoAssetId ?? null],
    );
    return p.existingId;
  }
  if (opts.allowedProviderIds) throw forbidden("Provider managers can only publish for their assigned providers.");
  // Re-use a provider with the same display name in this org rather than duplicating it.
  const existing = await q.query<{ id: string }>(`select id from providers where org_id = $1 and lower(name) = lower($2) and status = 'active' limit 1`, [orgId, p.name]);
  if (existing.rows[0]) return upsertProvider(q, orgId, { ...p, existingId: existing.rows[0].id }, { isDemo: opts.isDemo });
  const r = await q.query<{ id: string }>(
    `insert into providers (org_id, name, description, category, website, public_email, public_phone, logo_asset_id, provider_ref, is_demo)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
    [orgId, p.name, p.description, p.category, p.website ?? null, p.publicEmail ?? null, p.publicPhone ?? null, p.logoAssetId ?? null, await newProviderRef(q), opts.isDemo],
  );
  return r.rows[0].id;
}

function perkColumns(input: PerkInput) {
  const a = input.availability;
  const w = windowFromInput(a);
  const v = input.value;
  const amountMinor = v.type === "amount" && v.amount ? Math.round(v.amount * 100) : null;
  const label = defaultValueLabel({ type: v.type, percent: v.percent, amountMinor, currency: v.currency, label: v.label });
  return {
    window: w,
    values: {
      title: input.title,
      short_description: input.shortDescription,
      full_description: input.fullDescription,
      category: input.category,
      tags: input.tags,
      value_type: v.type,
      value_label: label,
      value_percent: v.type === "percent" ? v.percent : null,
      value_amount_minor: amountMinor,
      currency: v.type === "amount" ? v.currency : v.currency ?? null,
      conditions: v.conditions,
      is_ongoing: a.ongoing,
      starts_at: w.startsAt,
      ends_at: w.endsAt,
      timezone: a.timezone,
      booking_deadline: a.bookingDeadline ? zonedToUtc(a.bookingDeadline, "23:59", a.timezone) : null,
      blackout_dates: JSON.stringify(a.blackoutDates),
      redemption_method: input.redemption.method,
      redemption_url: input.redemption.method === "in_person" ? null : input.redemption.url ?? null,
      redemption_instructions: input.redemption.instructions,
      promo_code: input.redemption.promoCode ?? null,
      usage_limit_per_member: input.redemption.usageLimitPerMember ?? null,
      pos_reference: input.redemption.posReference ?? null,
      is_online_only: input.location.onlineOnly,
      address_line: input.location.onlineOnly ? null : input.location.addressLine ?? null,
      city: input.location.city ?? null,
      region: input.location.region ?? null,
      postal_code: input.location.onlineOnly ? null : input.location.postalCode ?? null,
      country: input.location.country ?? null,
      lat: input.location.lat ?? null,
      lng: input.location.lng ?? null,
      eligibility_text: input.eligibility.groups,
      household_allowed: input.eligibility.householdAllowed,
      exclusions: input.eligibility.exclusions,
      terms: input.eligibility.terms,
      image_asset_id: input.media.imageAssetId ?? null,
      image_alt: input.media.imageAlt,
      allow_distribution: input.allowDistribution,
    } as Record<string, unknown>,
  };
}

async function writeChildren(q: Queryable, perkId: string, input: PerkInput) {
  await q.query(`delete from perk_occurrences where perk_id = $1`, [perkId]);
  for (const o of input.occurrences) {
    const starts = zonedToUtc(o.date, o.startTime, input.availability.timezone);
    const ends = o.endTime ? zonedToUtc(o.date, o.endTime, input.availability.timezone) : null;
    await q.query(`insert into perk_occurrences (perk_id, starts_at, ends_at, venue, notes) values ($1,$2,$3,$4,$5)`, [perkId, starts, ends, o.venue, o.notes]);
  }
  await q.query(`delete from perk_images where perk_id = $1`, [perkId]);
  let i = 0;
  for (const img of input.media.additional) {
    await q.query(`insert into perk_images (perk_id, asset_id, sort, alt) values ($1,$2,$3,$4) on conflict do nothing`, [perkId, img.assetId, i++, img.alt]);
  }
  const assetIds = [input.media.imageAssetId, input.provider.logoAssetId, ...input.media.additional.map((x) => x.assetId)].filter(Boolean);
  if (assetIds.length) await q.query(`update assets set status = 'attached' where id = any($1::uuid[])`, [assetIds]);
}

export interface PublishArgs {
  orgId: string;
  programId: string | null;
  input: PerkInput;
  actorId: string | null;
  isDemo: boolean;
  /** "publish" -> live/scheduled now; "draft" -> stored as draft without program publication. */
  intent: "publish" | "draft";
  allowedProviderIds?: string[] | null;
}

export async function createPerk(q: Queryable, a: PublishArgs): Promise<{ perkId: string; status: PerkStatus; providerId: string }> {
  await assertAssets(q, a.orgId, [a.input.media.imageAssetId, a.input.provider.logoAssetId, ...a.input.media.additional.map((x) => x.assetId)]);
  if (a.programId) {
    const p = await q.query(`select 1 from programs where id = $1 and org_id = $2 and status <> 'archived'`, [a.programId, a.orgId]);
    if (!p.rows.length) throw forbidden("That program does not belong to this workspace.");
  }
  const providerId = await upsertProvider(q, a.orgId, a.input.provider, { isDemo: a.isDemo, allowedProviderIds: a.allowedProviderIds });
  const { window, values } = perkColumns(a.input);
  const status: PerkStatus = a.intent === "draft" ? "draft" : statusForWindow(window.startsAt, window.endsAt);
  if (status === "expired") throw badRequest("This offer's end date has passed, so it cannot be published.", { "availability.endDate": "End date has passed" });
  const cols = Object.keys(values);
  const params = Object.values(values);
  const r = await q.query<{ id: string }>(
    `insert into perks (org_id, provider_id, status, is_demo, created_by, published_at, ${cols.join(",")})
     values ($1,$2,$3,$4,$5,$6, ${cols.map((_, i) => `$${i + 7}`).join(",")}) returning id`,
    [a.orgId, providerId, status, a.isDemo, a.actorId, status === "draft" ? null : new Date(), ...params],
  );
  const perkId = r.rows[0].id;
  await writeChildren(q, perkId, a.input);
  if (a.programId && status !== "draft") {
    await q.query(
      `insert into program_perks (program_id, perk_id, status, granted_by) values ($1,$2,'active',$3)
       on conflict (program_id, perk_id) do update set status = 'active'`,
      [a.programId, perkId, a.actorId],
    );
  }
  return { perkId, status, providerId };
}

export async function updatePerk(q: Queryable, perkId: string, orgId: string, input: PerkInput, actorId: string, allowedProviderIds?: string[] | null) {
  const cur = await q.query<{ status: PerkStatus; provider_id: string; is_demo: boolean }>(
    `select status, provider_id, is_demo from perks where id = $1 and org_id = $2 for update`,
    [perkId, orgId],
  );
  const row = cur.rows[0];
  if (!row) throw notFound("Offer not found.");
  if (row.status === "archived") throw badRequest("Archived offers cannot be edited. Duplicate it instead.");
  if (allowedProviderIds && !allowedProviderIds.includes(row.provider_id)) throw forbidden("You are not assigned to this offer's provider.");
  await assertAssets(q, orgId, [input.media.imageAssetId, input.provider.logoAssetId, ...input.media.additional.map((x) => x.assetId)]);
  const providerId = await upsertProvider(q, orgId, input.provider, { isDemo: row.is_demo, allowedProviderIds });
  const { window, values } = perkColumns(input);
  let status: PerkStatus = row.status;
  if (status === "published" || status === "scheduled" || status === "expired") {
    status = statusForWindow(window.startsAt, window.endsAt);
    if (status === "expired") throw badRequest("The end date has passed.", { "availability.endDate": "End date has passed" });
  }
  const cols = Object.keys(values);
  await q.query(
    `update perks set provider_id = $3, status = $4, updated_at = now(), ${cols.map((c, i) => `${c} = $${i + 5}`).join(", ")}
      where id = $1 and org_id = $2`,
    [perkId, orgId, providerId, status, ...Object.values(values)],
  );
  await writeChildren(q, perkId, input);
  return { perkId, status };
}
