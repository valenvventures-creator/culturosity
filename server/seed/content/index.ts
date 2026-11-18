// Content packs: one-time catalogue data updates, applied in order and recorded in
// content_packs (like migrations). Safe to run on every deploy.
import type { Db, Queryable } from "../../db";
import { newProviderRef } from "../../lib/publish";
import { CULTUROSITY_PERK_LISTINGS, listingLabel } from "./0001_culturosity_perks_listings";

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

const PACKS: Pack[] = [
  {
    name: "0001_culturosity_perks_listings",
    async apply(q) {
      const { org_id, program_id } = await culturosityProgram(q);
      const n = CULTUROSITY_PERK_LISTINGS.length;
      let added = 0;
      for (let i = 0; i < n; i++) {
        const s = CULTUROSITY_PERK_LISTINGS[i];
        let prov = (await q.query<{ id: string }>(`select id from providers where org_id = $1 and lower(name) = lower($2)`, [org_id, s.provider])).rows[0]?.id;
        if (!prov) {
          prov = (
            await q.query<{ id: string }>(
              `insert into providers (org_id, name, category, provider_ref) values ($1,$2,$3,$4) returning id`,
              [org_id, s.provider, s.category, await newProviderRef(q)],
            )
          ).rows[0].id;
        }
        const exists = await q.query(`select 1 from perks where org_id = $1 and provider_id = $2 and lower(title) = lower($3)`, [org_id, prov, s.title]);
        if (exists.rows.length) continue;
        const v = s.value;
        // Newest first: earlier list entries get later publication times.
        const publishedAt = new Date(Date.now() - i * 60_000);
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
      return `${added} Culturosity perks added (details pending)`;
    },
  },
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
