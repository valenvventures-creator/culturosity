// Content packs: one-time catalogue data updates, applied in order and recorded in
// content_packs (like migrations). Safe to run on every deploy.
import type { Db, Queryable } from "../../db";
import { newProviderRef } from "../../lib/publish";
import { CULTUROSITY_PERK_LISTINGS, listingLabel, type ListingSpec } from "./0001_culturosity_perks_listings";
import { CULTUROSITY_PERK_LISTINGS_MORE } from "./0002_culturosity_perks_listings_more";
import { NEW_LISTINGS, PERK_DETAILS, PROVIDERS } from "./0003_culturosity_perk_details";
import { zonedToUtc } from "../../../shared/time";

interface Pack {
  name: string;
  apply(q: Queryable): Promise<string>;
}

async function culturosityProgram(q: Queryable) {
  const r = await q.query<{ org_id: string; program_id: string }>(
    `select o.id as org_id, p.id as program_id from organizations o
       join programs p on p.org_id = o.id and p.slug = 'culturosity-perks'
      where o.slug = 'culturosity'`,
  );
  if (!r.rows[0]) throw new Error("Culturosity workspace/program missing — run the base seed first.");
  return r.rows[0];
}

/** Insert listing-only Culturosity perks (details pending). Skips any provider+title that already exists. */
/** `olderByMinutes` keeps earlier packs older than later ones when several packs load in one deploy. */
async function addListings(q: Queryable, specs: ListingSpec[], olderByMinutes = 0): Promise<number> {
  const { org_id, program_id } = await culturosityProgram(q);
  let added = 0;
  for (let i = 0; i < specs.length; i++) {
    const s = specs[i];
    let prov = (await q.query<{ id: string }>(`select id from providers where org_id = $1 and lower(name) = lower($2)`, [org_id, s.provider])).rows[0]?.id;
    if (!prov) {
      prov = (
        await q.query<{ id: string }>(`insert into providers (org_id, name, category, provider_ref) values ($1,$2,$3,$4) returning id`, [
          org_id,
          s.provider,
          s.category,
          await newProviderRef(q),
        ])
      ).rows[0].id;
    }
    const exists = await q.query(`select 1 from perks where org_id = $1 and provider_id = $2 and lower(title) = lower($3)`, [org_id, prov, s.title]);
    if (exists.rows.length) continue;
    const v = s.value;
    // Newest first: earlier list entries get later publication times.
    const publishedAt = new Date(Date.now() - (olderByMinutes + i) * 60_000);
    const r = await q.query<{ id: string }>(
      `insert into perks (org_id, provider_id, title, short_description, category, value_type, value_label, value_percent,
         value_amount_minor, currency, is_ongoing, timezone, redemption_method, redemption_instructions, is_online_only,
         region, country, eligibility_text, image_path, image_alt, status, published_at, details_pending, public_teaser)
       values ($1,$2,$3,'',$4,$5,$6,$7,$8,$9,true,'America/Winnipeg','in_person',
         'Full details and redemption instructions for this perk are coming soon.', false,
         'MB','Canada','Eligible Culturosity members',$10,$11,'published',$12,true,true)
       returning id`,
      [
        org_id,
        prov,
        s.title,
        s.category,
        v.type,
        listingLabel(v),
        v.type === "percent" ? v.percent : null,
        v.type === "amount" ? Math.round(v.amount * 100) : null,
        v.type === "amount" ? "CAD" : null,
        `/perks/culturosity/${s.slug}.webp`,
        `${s.provider} — ${s.title}`,
        publishedAt,
      ],
    );
    await q.query(`insert into program_perks (program_id, perk_id) values ($1,$2) on conflict do nothing`, [program_id, r.rows[0].id]);
    added++;
  }
  return added;
}

const TZ = "America/Winnipeg";

/** Fill in the full details of Culturosity perks (pack 0003). Updates existing rows in place. */
async function applyPerkDetails(q: Queryable): Promise<string> {
  const { org_id } = await culturosityProgram(q);
  const added = await addListings(q, NEW_LISTINGS);
  let providers = 0;
  for (const p of PROVIDERS) {
    const r = await q.query(
      `update providers set description = $3, website = $4, public_email = $5, updated_at = now()
        where org_id = $1 and lower(name) = lower($2)`,
      [org_id, p.name, p.about, p.website, p.email],
    );
    providers += r.rowCount ?? 0;
  }
  let updated = 0;
  const missing: string[] = [];
  for (const d of PERK_DETAILS) {
    const row = (
      await q.query<{ id: string }>(
        `select pk.id from perks pk join providers pv on pv.id = pk.provider_id
          where pk.org_id = $1 and lower(pv.name) = lower($2) and lower(pk.title) = lower($3) and pk.archived_at is null`,
        [org_id, d.provider, d.title],
      )
    ).rows[0];
    if (!row) {
      missing.push(`${d.provider} — ${d.title}`);
      continue;
    }
    const endsAt = d.endsAt ? zonedToUtc(d.endsAt.date, d.endsAt.time, TZ) : null;
    await q.query(
      `update perks set title = $2, short_description = $3, full_description = $4, promo_code = $5,
              redemption_instructions = $6, redemption_method = $7, redemption_url = $8, pos_reference = $9,
              address_line = $10, city = $11, region = case when $11::text is null then region else 'MB' end,
              is_online_only = $12, is_ongoing = $13, ends_at = $14, exclusions = $15, timezone = $16,
              details_pending = false, updated_at = now()
        where id = $1`,
      [
        row.id,
        d.newTitle ?? d.title,
        d.shortDescription,
        d.description,
        d.promo ?? null,
        d.howToRedeem,
        d.method,
        d.method === "in_person" ? null : d.url,
        d.qr,
        d.address ?? null,
        d.city ?? null,
        d.method === "online" && !d.address && !d.city,
        !endsAt,
        endsAt,
        d.exclusions ?? "",
        TZ,
      ],
    );
    await q.query(`delete from perk_occurrences where perk_id = $1`, [row.id]);
    for (const o of d.occurrences ?? []) {
      await q.query(`insert into perk_occurrences (perk_id, starts_at, ends_at, venue, notes) values ($1,$2,$3,$4,$5)`, [
        row.id,
        zonedToUtc(o.date, o.start, TZ),
        o.end ? zonedToUtc(o.date, o.end, TZ) : null,
        o.venue ?? "",
        o.notes ?? "",
      ]);
    }
    updated++;
  }
  if (missing.length) console.warn(`[content] perk details not applied (perk not found): ${missing.join("; ")}`);
  return `${added} perks added, ${updated} perks given full details, ${providers} provider profiles updated`;
}

/** Perks Culturosity confirmed should not be listed (no details, not current offers). */
const REMOVED_PERKS: { provider: string; title: string }[] = [
  { provider: "Canadian Fossil Discovery Centre", title: "Gift Shop" },
  { provider: "Manitoba Opera", title: "Tosca" },
  { provider: "Nonsuch Brewing Co.", title: "Happy Hour - Two Taps and a Snack" },
  { provider: "WAG-Qaumajuq", title: "BPM X WAG-Qaumajuq" },
];

/** Pack 0004: delete those perks (and their saves/clicks via cascade); archive providers left with no perks. */
async function removePerks(q: Queryable): Promise<string> {
  const { org_id } = await culturosityProgram(q);
  let removed = 0;
  const providerIds = new Set<string>();
  for (const r of REMOVED_PERKS) {
    const res = await q.query<{ provider_id: string }>(
      `delete from perks pk using providers pv
        where pv.id = pk.provider_id and pk.org_id = $1 and lower(pv.name) = lower($2) and lower(pk.title) = lower($3)
        returning pk.provider_id`,
      [org_id, r.provider, r.title],
    );
    removed += res.rows.length;
    for (const row of res.rows) providerIds.add(row.provider_id);
  }
  let archived = 0;
  for (const id of providerIds) {
    const a = await q.query(
      `update providers set status = 'archived', updated_at = now()
        where id = $1 and not exists (select 1 from perks where provider_id = $1)`,
      [id],
    );
    archived += a.rowCount ?? 0;
  }
  return `${removed} perks removed, ${archived} providers with no remaining perks archived`;
}

const PACKS: Pack[] = [
  {
    name: "0001_culturosity_perks_listings",
    apply: async (q) => `${await addListings(q, CULTUROSITY_PERK_LISTINGS, 10)} Culturosity perks added (details pending)`,
  },
  {
    name: "0002_culturosity_perks_listings_more",
    apply: async (q) => `${await addListings(q, CULTUROSITY_PERK_LISTINGS_MORE, 5)} Culturosity perks added (details pending)`,
  },
  { name: "0003_culturosity_perk_details", apply: applyPerkDetails },
  { name: "0004_remove_unlisted_perks", apply: removePerks },
];

export async function applyContentPacks(db: Db): Promise<string[]> {
  const done = new Set((await db.query<{ name: string }>(`select name from content_packs`)).rows.map((r) => r.name));
  const log: string[] = [];
  for (const p of PACKS) {
    if (done.has(p.name)) continue;
    const msg = await db.tx(async (q) => {
      const m = await p.apply(q);
      await q.query(`insert into content_packs (name) values ($1)`, [p.name]);
      return m;
    });
    log.push(`${p.name}: ${msg}`);
  }
  return log;
}
