import { Hono } from "hono";
import type { AppEnv, Ctx } from "../context";
import { LIVE_PERK_SQL, memberPrograms, activeMembership, grantsFor, type ProgramAccess } from "../lib/authz";
import { requireUser } from "../lib/auth";
import { badRequest, forbidden, notFound, AppError } from "../lib/errors";
import { rateLimit, track, sourceHash } from "../lib/security";
import { compareAZ, effectiveStatus } from "../../shared/perk";
import { randomToken, sha256, shortCode } from "../lib/crypto";
import { sniffImageMime } from "../adapters/storage";
import { getSetting } from "../lib/settings";

export const perkRoutes = new Hono<AppEnv>();

const LIST_COLUMNS = `pk.id, pk.title, pk.short_description, pk.category, pk.tags, pk.value_type, pk.value_label, pk.starts_at, pk.ends_at,
  pk.is_ongoing, pk.timezone, pk.city, pk.region, pk.country, pk.is_online_only, pk.redemption_method, pk.published_at, pk.is_demo,
  pk.image_asset_id, pk.image_alt, pk.status, pv.id as provider_id, pv.name as provider_name, pv.logo_asset_id as provider_logo_asset_id,
  o.name as source_org_name, o.kind as source_org_kind,
  (select min(po.starts_at) from perk_occurrences po where po.perk_id = pk.id and coalesce(po.ends_at, po.starts_at) > now()) as next_occurrence,
  (select count(*)::int from perk_occurrences po where po.perk_id = pk.id and coalesce(po.ends_at, po.starts_at) > now()) as upcoming_occurrences`;

interface ListFilters {
  q?: string;
  category?: string;
  city?: string;
  region?: string;
  country?: string;
  mode?: string;
  valueType?: string;
  from?: string;
  to?: string;
}

function filterSql(f: ListFilters, params: unknown[]): string {
  const parts: string[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    parts.push(sql.replace("?", `$${params.length}`));
  };
  if (f.q) {
    params.push(`%${f.q.replace(/[%_\\]/g, (m) => "\\" + m)}%`);
    const p = `$${params.length}`;
    parts.push(`(pk.title ilike ${p} or pv.name ilike ${p} or pk.category ilike ${p} or coalesce(pk.city,'') ilike ${p}
      or coalesce(pk.region,'') ilike ${p} or coalesce(pk.country,'') ilike ${p} or array_to_string(pk.tags, ' ') ilike ${p})`);
  }
  if (f.category) add(`pk.category = ?`, f.category);
  if (f.city) add(`lower(pk.city) = lower(?)`, f.city);
  if (f.region) add(`lower(pk.region) = lower(?)`, f.region);
  if (f.country) add(`lower(pk.country) = lower(?)`, f.country);
  if (f.mode === "online") parts.push(`pk.redemption_method in ('online','hybrid')`);
  if (f.mode === "in_person") parts.push(`pk.redemption_method in ('in_person','hybrid')`);
  if (f.valueType) add(`pk.value_type = ?`, f.valueType);
  // Offers claimable at some point inside [from, to]
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) add(`(pk.ends_at is null or pk.ends_at > ?::date)`, f.from);
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) add(`(pk.starts_at is null or pk.starts_at < (?::date + 1))`, f.to);
  return parts.length ? " and " + parts.join(" and ") : "";
}

function shapeListing(row: any, newCutoff: number) {
  return {
    ...row,
    image_url: row.image_asset_id ? `/api/assets/${row.image_asset_id}` : null,
    provider_logo_url: row.provider_logo_asset_id ? `/api/assets/${row.provider_logo_asset_id}` : null,
    is_new: row.published_at ? new Date(row.published_at).getTime() >= newCutoff : false,
  };
}

function sortRows(rows: any[], sort: string) {
  if (sort === "new") return rows.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime() || compareAZ(a, b));
  if (sort === "ending")
    return rows.sort((a, b) => (a.ends_at ? new Date(a.ends_at).getTime() : Infinity) - (b.ends_at ? new Date(b.ends_at).getTime() : Infinity) || compareAZ(a, b));
  return rows.sort(compareAZ);
}

async function newCutoff(c: Ctx) {
  const days = (await getSetting<number>(c.get("deps").db, "new_window_days")) ?? 21;
  return Date.now() - days * 86400_000;
}

/** Public teaser: approved teaser fields only. No descriptions beyond the listing line, codes, URLs or instructions. */
perkRoutes.get("/public/perks", async (c) => {
  const { db, config } = c.get("deps");
  const params: unknown[] = [config.mode === "demo"];
  const where = filterSql(c.req.query() as ListFilters, params);
  const r = await db.query(
    `select ${LIST_COLUMNS}, pr.id as program_id, pr.name as program_name
       from program_perks pp
       join programs pr on pr.id = pp.program_id and pr.status = 'active'
       join organizations po on po.id = pr.org_id and po.kind = 'culturosity' and po.status = 'active'
       join perks pk on pk.id = pp.perk_id
       join providers pv on pv.id = pk.provider_id
       join organizations o on o.id = pk.org_id
      where pp.status = 'active' and pk.public_teaser and (not pr.is_demo or $1) and ${LIVE_PERK_SQL} ${where}`,
    params,
  );
  const cutoff = await newCutoff(c);
  const seen = new Set<string>();
  const rows = r.rows.filter((x: any) => (seen.has(x.id) ? false : (seen.add(x.id), true))).map((x) => shapeListing(x, cutoff));
  const onlyNew = c.req.query("new") === "1";
  c.header("Cache-Control", "no-store");
  return c.json({ perks: sortRows(onlyNew ? rows.filter((x) => x.is_new) : rows, c.req.query("sort") || "az") });
});

/** Member catalogue across (or within) the programs the caller is eligible for. */
perkRoutes.get("/catalogue", async (c) => {
  const user = requireUser(c);
  const { db } = c.get("deps");
  const all = await memberPrograms(db, user.id);
  const programId = c.req.query("programId");
  const scope = c.req.query("scope"); // "culturosity" | "org:<slug>"
  let programs = all;
  if (programId) programs = all.filter((p) => p.program_id === programId);
  else if (scope === "culturosity") programs = all.filter((p) => p.org_kind === "culturosity");
  else if (scope?.startsWith("org:")) programs = all.filter((p) => p.org_slug === scope.slice(4));
  if (programId && !programs.length) throw notFound("Program not found.");
  if (!programs.length) return c.json({ perks: [], programs: all });
  const params: unknown[] = [user.id, programs.map((p) => p.program_id)];
  const where = filterSql(c.req.query() as ListFilters, params);
  const r = await db.query(
    `select ${LIST_COLUMNS}, pp.program_id, pr.name as program_name,
            exists(select 1 from favourites f where f.user_id = $1 and f.perk_id = pk.id and f.program_id = pp.program_id) as is_favourite
       from program_perks pp
       join programs pr on pr.id = pp.program_id
       join perks pk on pk.id = pp.perk_id
       join providers pv on pv.id = pk.provider_id
       join organizations o on o.id = pk.org_id
      where pp.status = 'active' and pp.program_id = any($2::uuid[]) and ${LIVE_PERK_SQL} ${where}`,
    params,
  );
  const cutoff = await newCutoff(c);
  const order = new Map(programs.map((p, i) => [p.program_id, i]));
  const byPerk = new Map<string, any>();
  for (const row of r.rows as any[]) {
    const prev = byPerk.get(row.id);
    if (!prev || (order.get(row.program_id)! < order.get(prev.program_id)! && !prev.is_favourite) || row.is_favourite) byPerk.set(row.id, row);
  }
  let rows = [...byPerk.values()].map((x) => shapeListing(x, cutoff));
  if (c.req.query("favourites") === "1") rows = rows.filter((x) => x.is_favourite);
  if (c.req.query("new") === "1") rows = rows.filter((x) => x.is_new);
  const first = programs[0];
  await track(db, { event: "catalogue_view", userId: user.id, orgId: first.org_id, programId: programs.length === 1 ? first.program_id : null, isDemo: first.is_demo });
  c.header("Cache-Control", "private, no-store");
  return c.json({ perks: sortRows(rows, c.req.query("sort") || "az"), programs: all });
});

async function loadDetail(c: Ctx, perkId: string, access: ProgramAccess) {
  const { db } = c.get("deps");
  const r = await db.query<any>(
    `select pk.*, pv.name as provider_name, pv.description as provider_description, pv.website as provider_website,
            pv.public_email as provider_email, pv.public_phone as provider_phone, pv.logo_asset_id as provider_logo_asset_id,
            pv.provider_ref, pv.pos_reference as provider_pos_reference, o.name as source_org_name, o.kind as source_org_kind
       from program_perks pp join perks pk on pk.id = pp.perk_id join providers pv on pv.id = pk.provider_id
       join organizations o on o.id = pk.org_id
      where pp.program_id = $1 and pp.perk_id = $2 and pp.status = 'active' and ${LIVE_PERK_SQL}`,
    [access.program_id, perkId],
  );
  const p = r.rows[0];
  if (!p) return null;
  const [occ, imgs, locs, fav, used] = await Promise.all([
    db.query(`select id, starts_at, ends_at, venue, notes from perk_occurrences where perk_id = $1 order by starts_at`, [perkId]),
    db.query(`select asset_id, alt from perk_images where perk_id = $1 order by sort`, [perkId]),
    db.query(`select label, address_line, city, region, postal_code, country, lat, lng from provider_locations where provider_id = $1`, [p.provider_id]),
    db.query(`select 1 from favourites where user_id = $1 and program_id = $2 and perk_id = $3`, [c.get("user")!.id, access.program_id, perkId]),
    db.query<{ n: number }>(`select count(*)::int as n from redemptions where user_id = $1 and perk_id = $2`, [c.get("user")!.id, perkId]),
  ]);
  return {
    ...p,
    effective_status: effectiveStatus(p),
    image_url: p.image_asset_id ? `/api/assets/${p.image_asset_id}` : null,
    provider_logo_url: p.provider_logo_asset_id ? `/api/assets/${p.provider_logo_asset_id}` : null,
    occurrences: occ.rows,
    images: imgs.rows.map((i: any) => ({ url: `/api/assets/${i.asset_id}`, alt: i.alt })),
    provider_locations: locs.rows,
    is_favourite: fav.rows.length > 0,
    redemptions_used: used.rows[0].n,
    program: { id: access.program_id, name: access.program_name, org_name: access.org_name, org_slug: access.org_slug, org_kind: access.org_kind },
  };
}

perkRoutes.get("/perks/:perkId", async (c) => {
  const perkId = c.req.param("perkId");
  if (!/^[0-9a-f-]{36}$/i.test(perkId)) throw notFound();
  const user = c.get("user");
  const { db, config } = c.get("deps");
  c.header("Cache-Control", "private, no-store");
  if (user) {
    const all = await memberPrograms(db, user.id);
    const want = c.req.query("programId");
    const candidates = want ? all.filter((p) => p.program_id === want) : all;
    for (const access of candidates) {
      const detail = await loadDetail(c, perkId, access);
      if (detail) {
        await track(db, { event: "perk_view", userId: user.id, orgId: access.org_id, programId: access.program_id, perkId, providerId: detail.provider_id, isDemo: detail.is_demo });
        return c.json({ access: "member", perk: detail });
      }
    }
  }
  // Teaser for public Culturosity offers only.
  const t = await db.query<any>(
    `select ${LIST_COLUMNS} from program_perks pp
       join programs pr on pr.id = pp.program_id and pr.status = 'active'
       join organizations po on po.id = pr.org_id and po.kind = 'culturosity'
       join perks pk on pk.id = pp.perk_id join providers pv on pv.id = pk.provider_id join organizations o on o.id = pk.org_id
      where pk.id = $1 and pp.status = 'active' and pk.public_teaser and (not pr.is_demo or $2) and ${LIVE_PERK_SQL} limit 1`,
    [perkId, config.mode === "demo"],
  );
  if (!t.rows[0]) throw notFound("This offer is not available, or you are not eligible to view it.");
  return c.json({ access: "teaser", perk: shapeListing(t.rows[0], await newCutoff(c)) });
});

// ---- Favourites ----
perkRoutes.get("/favourites", async (c) => {
  const user = requireUser(c);
  const { db } = c.get("deps");
  const programs = await memberPrograms(db, user.id);
  if (!programs.length) return c.json({ perks: [] });
  const r = await db.query(
    `select ${LIST_COLUMNS}, f.program_id, pr.name as program_name, true as is_favourite
       from favourites f join program_perks pp on pp.program_id = f.program_id and pp.perk_id = f.perk_id and pp.status = 'active'
       join programs pr on pr.id = f.program_id join perks pk on pk.id = f.perk_id join providers pv on pv.id = pk.provider_id
       join organizations o on o.id = pk.org_id
      where f.user_id = $1 and f.program_id = any($2::uuid[]) and ${LIVE_PERK_SQL}`,
    [user.id, programs.map((p) => p.program_id)],
  );
  const cutoff = await newCutoff(c);
  return c.json({ perks: sortRows(r.rows.map((x) => shapeListing(x, cutoff)), "az") });
});

async function assertVisible(c: Ctx, programId: string, perkId: string) {
  const user = requireUser(c);
  const { db } = c.get("deps");
  const programs = await memberPrograms(db, user.id);
  const access = programs.find((p) => p.program_id === programId);
  if (!access) throw notFound();
  const r = await db.query<any>(
    `select pk.id, pk.provider_id, pk.is_demo, pk.redemption_url, pk.redemption_method, pk.usage_limit_per_member, pk.title,
            pk.value_label, pk.org_id
       from program_perks pp join perks pk on pk.id = pp.perk_id
      where pp.program_id = $1 and pp.perk_id = $2 and pp.status = 'active' and ${LIVE_PERK_SQL}`,
    [programId, perkId],
  );
  if (!r.rows[0]) throw notFound("This offer is not currently available.");
  return { user, access, perk: r.rows[0] };
}

perkRoutes.post("/favourites", async (c) => {
  const { programId, perkId } = (await c.req.json().catch(() => ({}))) as { programId?: string; perkId?: string };
  if (!programId || !perkId) throw badRequest("programId and perkId are required.");
  const { user, access, perk } = await assertVisible(c, programId, perkId);
  const { db } = c.get("deps");
  await db.query(`insert into favourites (user_id, program_id, perk_id) values ($1,$2,$3) on conflict do nothing`, [user.id, programId, perkId]);
  await track(db, { event: "favourite_add", userId: user.id, orgId: access.org_id, programId, perkId, isDemo: perk.is_demo });
  return c.json({ ok: true, is_favourite: true });
});

perkRoutes.delete("/favourites", async (c) => {
  const user = requireUser(c);
  const { programId, perkId } = (await c.req.json().catch(() => ({}))) as { programId?: string; perkId?: string };
  const { db } = c.get("deps");
  await db.query(`delete from favourites where user_id = $1 and program_id = $2 and perk_id = $3`, [user.id, programId, perkId]);
  return c.json({ ok: true, is_favourite: false });
});

/** Measured outbound actions. A click is recorded as a click — never as a redemption or saving. */
perkRoutes.post("/events", async (c) => {
  const { event, programId, perkId } = (await c.req.json().catch(() => ({}))) as { event?: string; programId?: string; perkId?: string };
  if (event !== "use_perk_click" && event !== "share") throw badRequest("Unsupported event.");
  if (!programId || !perkId) throw badRequest("programId and perkId are required.");
  const { user, access, perk } = await assertVisible(c, programId, perkId);
  const { db } = c.get("deps");
  await rateLimit(db, `events:${user.id}`, 300, 3600);
  await track(db, { event, userId: user.id, orgId: access.org_id, programId, perkId, providerId: perk.provider_id, isDemo: perk.is_demo });
  return c.json({ ok: true, redirect: event === "use_perk_click" ? perk.redemption_url : null });
});

// ---- Member redemption reference (opaque, short-lived, server-issued) ----
perkRoutes.post("/redemption-tokens", async (c) => {
  const { programId, perkId } = (await c.req.json().catch(() => ({}))) as { programId?: string; perkId?: string };
  if (!programId || !perkId) throw badRequest("programId and perkId are required.");
  const { user, access, perk } = await assertVisible(c, programId, perkId);
  const { db } = c.get("deps");
  await rateLimit(db, `rtoken:${user.id}`, 30, 3600);
  if (perk.usage_limit_per_member) {
    const used = await db.query<{ n: number }>(`select count(*)::int as n from redemptions where user_id = $1 and perk_id = $2`, [user.id, perkId]);
    if (used.rows[0].n >= perk.usage_limit_per_member)
      throw new AppError(409, "limit_reached", "You have already used this offer the maximum number of times.");
  }
  const token = randomToken(24);
  const code = shortCode(10);
  const expires = new Date(Date.now() + 10 * 60_000);
  const prov = await db.query<{ provider_ref: string }>(`select provider_ref from providers where id = $1`, [perk.provider_id]);
  await db.query(`update redemption_tokens set revoked_at = now() where user_id = $1 and perk_id = $2 and revoked_at is null and uses = 0`, [user.id, perkId]);
  await db.query(
    `insert into redemption_tokens (token_hash, code_hash, user_id, membership_id, perk_id, program_id, provider_id, expires_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [sha256(token), sha256(code), user.id, access.membership_id, perkId, programId, perk.provider_id, expires],
  );
  await track(db, { event: "redemption_initiated", userId: user.id, orgId: access.org_id, programId, perkId, providerId: perk.provider_id, isDemo: perk.is_demo });
  c.header("Cache-Control", "no-store");
  return c.json({
    // QR payload: versioned prefix + provider reference + opaque token. No names, emails or member numbers.
    qrPayload: `CUL1:${prov.rows[0].provider_ref}:${token}`,
    manualCode: `${code.slice(0, 5)}-${code.slice(5)}`,
    providerRef: prov.rows[0].provider_ref,
    expiresAt: expires.toISOString(),
  });
});

// ---- Assets: scoped access check on every read ----
perkRoutes.get("/assets/:id", async (c) => {
  const id = c.req.param("id");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound();
  const { db, storage, config } = c.get("deps");
  const r = await db.query<{ storage_key: string; mime: string; scope: string; org_id: string | null }>(
    `select storage_key, mime, scope, org_id from assets where id = $1`,
    [id],
  );
  const a = r.rows[0];
  if (!a) throw notFound();
  let allowed = a.scope === "public";
  let publicCache = allowed;
  if (!allowed) {
    // Public teaser imagery of live Culturosity offers.
    const t = await db.query(
      `select 1 from perks pk join program_perks pp on pp.perk_id = pk.id and pp.status = 'active'
         join programs pr on pr.id = pp.program_id and pr.status = 'active' join organizations o on o.id = pr.org_id and o.kind = 'culturosity'
        where (pk.image_asset_id = $1 or exists (select 1 from providers pv where pv.id = pk.provider_id and pv.logo_asset_id = $1))
          and pk.public_teaser and (not pr.is_demo or $2) and ${LIVE_PERK_SQL} limit 1`,
      [id, config.mode === "demo"],
    );
    allowed = t.rows.length > 0;
  }
  const user = c.get("user");
  if (!allowed && user) {
    if (a.org_id && (await activeMembership(db, user.id, a.org_id))) allowed = true;
    if (!allowed) {
      const programs = await memberPrograms(db, user.id);
      if (programs.length) {
        const v = await db.query(
          `select 1 from perks pk join program_perks pp on pp.perk_id = pk.id and pp.status = 'active'
            where pp.program_id = any($2::uuid[]) and (pk.image_asset_id = $1
               or exists (select 1 from perk_images pi where pi.perk_id = pk.id and pi.asset_id = $1)
               or exists (select 1 from providers pv where pv.id = pk.provider_id and pv.logo_asset_id = $1)) limit 1`,
          [id, programs.map((p) => p.program_id)],
        );
        allowed = v.rows.length > 0;
      }
    }
    if (!allowed && (await grantsFor(db, user.id)).has("super_admin")) allowed = true;
  }
  if (!allowed) throw notFound();
  const obj = await storage.get(a.storage_key);
  if (!obj) throw notFound();
  return new Response(obj.bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": a.mime,
      "Cache-Control": publicCache ? "public, max-age=3600" : "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
});

perkRoutes.post("/uploads", async (c) => {
  const user = requireUser(c);
  const { db, storage, config } = c.get("deps");
  await rateLimit(db, `upload:${user.id}`, 60, 3600);
  const form = await c.req.formData().catch(() => null);
  if (!form) throw badRequest("Upload an image file.");
  const file = form.get("file");
  const orgId = String(form.get("orgId") || "");
  const alt = String(form.get("alt") || "").slice(0, 250);
  if (!(file instanceof File)) throw badRequest("Choose an image to upload.", { file: "Choose an image" });
  if (file.size > config.maxUploadBytes)
    throw badRequest(`Images must be ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB or smaller.`, { file: "File is too large" });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImageMime(bytes);
  if (!mime) throw badRequest("Use a JPEG, PNG or WebP image.", { file: "Unsupported image type" });
  // Must be able to submit into the org: any active membership or super admin.
  const m = await activeMembership(db, user.id, orgId);
  if (!m && !(await grantsFor(db, user.id)).has("super_admin")) throw forbidden("You cannot upload into this workspace.");
  const ext = mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp";
  const key = `org/${orgId}/${new Date().toISOString().slice(0, 10)}/${randomToken(12)}.${ext}`;
  await storage.put(key, bytes, mime);
  try {
    const r = await db.query<{ id: string }>(
      `insert into assets (org_id, scope, storage_key, mime, bytes, alt, uploaded_by) values ($1,'org',$2,$3,$4,$5,$6) returning id`,
      [orgId, key, mime, bytes.byteLength, alt, user.id],
    );
    // Opportunistic cleanup of abandoned uploads (never attached within 24h).
    if (Math.random() < 0.1) await cleanupOrphanAssets(c).catch(() => {});
    return c.json({ asset: { id: r.rows[0].id, url: `/api/assets/${r.rows[0].id}`, mime, bytes: bytes.byteLength } });
  } catch (e) {
    await storage.remove(key).catch(() => {});
    throw e;
  }
});

export async function cleanupOrphanAssets(c: Ctx | { get: (k: "deps") => any }) {
  const { db, storage } = (c as any).get("deps");
  const r = await db.query(
    `delete from assets a where a.status = 'pending' and a.created_at < now() - interval '24 hours'
       and not exists (select 1 from perks p where p.image_asset_id = a.id)
       and not exists (select 1 from perk_images pi where pi.asset_id = a.id)
       and not exists (select 1 from providers pv where pv.logo_asset_id = a.id)
       and not exists (select 1 from organizations o where o.logo_asset_id = a.id)
       and not exists (select 1 from perk_submissions s where s.status in ('draft','pending_review')
                        and s.payload::text like '%' || a.id::text || '%')
     returning storage_key`,
  );
  for (const row of r.rows) await storage.remove(row.storage_key).catch(() => {});
  return r.rows.length;
}

export { sourceHash };
