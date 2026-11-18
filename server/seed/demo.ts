// Isolated demonstration data. Every organization, provider, offer and person here is fictional,
// flagged is_demo, and lives only in demo programs. Demo offers never grant entitlement to a real
// merchant benefit and are excluded from production catalogues and reports.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Db, Queryable } from "../db";
import type { StorageAdapter } from "../adapters/storage";
import { perkInputSchema, type PerkInput } from "../../shared/schemas";
import { passwordAuth } from "../lib/auth";
import { createPerk } from "../lib/publish";
import { randomToken } from "../lib/crypto";
import { addDays } from "../../shared/time";
import { seedBase } from "./base";

export const DEMO_DEFAULT_PASSWORD = "culturosity-demo-2026";

const today = () => new Date().toISOString().slice(0, 10);
const d = (offset: number) => addDays(today(), offset);

interface DemoPerk {
  org: "culturosity" | "northwind-demo" | "harbour-demo";
  image: string;
  distribute?: boolean;
  input: Omit<PerkInput, "media" | "tags" | "occurrences" | "allowDistribution"> & { occurrences?: PerkInput["occurrences"]; tags?: string[] };
}

const base = (city: string, region: string, country: string, address: string, postal: string) => ({
  onlineOnly: false,
  addressLine: address,
  city,
  region,
  postalCode: postal,
  country,
});

const DEMO_PERKS: DemoPerk[] = [
  {
    org: "culturosity", image: "lumen-hall", distribute: true,
    input: {
      provider: { name: "Lumen Hall Gallery (Demo)", description: "A fictional contemporary gallery used for demonstrations.", category: "Arts & Culture", website: "https://example.com/lumen-hall" },
      title: "Free members' evening gallery tour", shortDescription: "A guided after-hours tour of the current exhibition for eligible members.",
      fullDescription: "Join a 45-minute guided tour of the current exhibition after regular hours. Tours run on the first Thursday of each month. This is sample content for demonstration only.",
      category: "Arts & Culture", value: { type: "free", label: "Free entry", conditions: "One guest ticket per member card." },
      availability: { ongoing: true, timezone: "America/Toronto", blackoutDates: [] },
      redemption: { method: "in_person", instructions: "Show your Culturosity member card at the front desk. Staff will scan your QR code or enter your manual code." },
      location: base("Toronto", "ON", "Canada", "100 Example Street", "M5V 0A0"),
      eligibility: { groups: "Eligible Culturosity members", householdAllowed: true, exclusions: "Not valid for private events.", terms: "Demo terms only." },
    },
  },
  {
    org: "culturosity", image: "northern-pulse",
    input: {
      provider: { name: "Northern Pulse Music Festival (Demo)", description: "A fictional summer festival.", category: "Events & Experiences", website: "https://example.com/northern-pulse" },
      title: "20% off weekend passes", shortDescription: "Save on two-day festival passes across three outdoor stages.",
      fullDescription: "Use the member link to buy discounted weekend passes. The discount applies at checkout. Event dates are listed separately from the period when the discount can be claimed. Demonstration content.",
      category: "Events & Experiences", value: { type: "percent", percent: 20, conditions: "Up to 4 passes per order." },
      availability: { ongoing: false, startDate: d(-10), endDate: d(45), timezone: "America/Toronto", blackoutDates: [] },
      occurrences: [
        { date: d(50), startTime: "12:00", endTime: "23:00", venue: "Harbourfront Grounds", notes: "Day 1" },
        { date: d(51), startTime: "12:00", endTime: "22:00", venue: "Harbourfront Grounds", notes: "Day 2" },
      ],
      redemption: { method: "online", url: "https://example.com/northern-pulse/tickets?offer=demo", instructions: "Select Use Perk, then apply the promo code at checkout.", promoCode: "DEMOPULSE20" },
      location: { onlineOnly: false, city: "Montréal", region: "QC", country: "Canada" },
      eligibility: { groups: "Eligible Culturosity members aged 19+", householdAllowed: false, exclusions: "VIP passes excluded.", terms: "Demo terms only." },
    },
  },
  {
    org: "culturosity", image: "kettle-kiln", distribute: true,
    input: {
      provider: { name: "Kettle & Kiln Pottery Studio (Demo)", description: "A fictional community ceramics studio.", category: "Learning", website: "https://example.com/kettle-kiln", publicEmail: "studio@example.com", publicPhone: "+1 604 555 0100" },
      title: "$15 off an intro wheel-throwing class", shortDescription: "A two-hour beginner class with clay and firing included.",
      fullDescription: "Learn the basics of wheel throwing in a small-group class. Clay, glazing and one firing are included. Demonstration content.",
      category: "Learning", value: { type: "amount", amount: 15, currency: "CAD", conditions: "One redemption per member." },
      availability: { ongoing: false, startDate: d(-20), endDate: d(90), timezone: "America/Vancouver", blackoutDates: [] },
      redemption: { method: "in_person", instructions: "Book by phone, then show your member card at check-in.", usageLimitPerMember: 1 },
      location: base("Vancouver", "BC", "Canada", "200 Example Avenue", "V6B 0A0"),
      eligibility: { groups: "Eligible Culturosity members", householdAllowed: false, exclusions: "", terms: "Demo terms only." },
    },
  },
  {
    org: "culturosity", image: "saltwater-yoga",
    input: {
      provider: { name: "Saltwater Yoga Collective (Demo)", description: "A fictional yoga studio.", category: "Wellness", website: "https://example.com/saltwater" },
      title: "Buy one class pass, get one free", shortDescription: "Bring a friend: two drop-in classes for the price of one.",
      fullDescription: "Book online with the member link, or show your card at the studio for drop-in classes. Demonstration content.",
      category: "Wellness", value: { type: "bogo", conditions: "Drop-in classes only." },
      availability: { ongoing: true, timezone: "America/Halifax", blackoutDates: [] },
      redemption: { method: "hybrid", url: "https://example.com/saltwater/book?offer=demo", instructions: "Online: use the member booking link. In studio: show your member card before class." },
      location: base("Halifax", "NS", "Canada", "300 Example Wharf", "B3H 0A0"),
      eligibility: { groups: "Eligible Culturosity members", householdAllowed: true, exclusions: "", terms: "Demo terms only." },
    },
  },
  {
    org: "culturosity", image: "fieldnote-lab", distribute: true,
    input: {
      provider: { name: "Fieldnote Language Lab (Demo)", description: "A fictional online language school.", category: "Learning", website: "https://example.com/fieldnote" },
      title: "30% off live online language courses", shortDescription: "Small live classes in French, Spanish and Japanese.",
      fullDescription: "Choose any eight-week live online course and apply the member code at checkout. Demonstration content.",
      category: "Learning", value: { type: "percent", percent: 30, conditions: "New enrolments only." },
      availability: { ongoing: true, timezone: "America/Toronto", blackoutDates: [] },
      redemption: { method: "online", url: "https://example.com/fieldnote/enrol?offer=demo", instructions: "Select Use Perk and apply the promo code at checkout.", promoCode: "DEMOLAB30" },
      location: { onlineOnly: true },
      eligibility: { groups: "Eligible members in Canada and the USA", householdAllowed: true, exclusions: "", terms: "Demo terms only." },
    },
  },
  {
    org: "culturosity", image: "market-street",
    input: {
      provider: { name: "Market Street Food Walks (Demo)", description: "A fictional neighbourhood food tour.", category: "Food & Drink", website: "https://example.com/market-street" },
      title: "Free tasting add-on with any food walk", shortDescription: "An extra dessert tasting stop on scheduled walking tours.",
      fullDescription: "Book a scheduled walk and show your member card to the guide to receive the tasting add-on. Demonstration content.",
      category: "Food & Drink", value: { type: "special", label: "Free tasting add-on", conditions: "Scheduled tours only." },
      availability: { ongoing: false, startDate: d(-5), endDate: d(60), timezone: "America/Chicago", blackoutDates: [] },
      occurrences: [
        { date: d(7), startTime: "11:00", endTime: "13:30", venue: "Meet at Example Market entrance", notes: "" },
        { date: d(21), startTime: "11:00", endTime: "13:30", venue: "Meet at Example Market entrance", notes: "" },
        { date: d(35), startTime: "17:00", endTime: "19:30", venue: "Meet at Example Market entrance", notes: "Evening walk" },
      ],
      redemption: { method: "in_person", instructions: "Book any scheduled walk, then show your member card to the guide at the start." },
      location: base("Chicago", "IL", "United States", "400 Example Market Street", "60601"),
      eligibility: { groups: "Eligible Culturosity members", householdAllowed: false, exclusions: "Private tours excluded.", terms: "Demo terms only." },
    },
  },
  {
    org: "culturosity", image: "aurora-planetarium",
    input: {
      provider: { name: "Aurora Planetarium (Demo)", description: "A fictional planetarium.", category: "Family", website: "https://example.com/aurora" },
      title: "25% off family dome shows", shortDescription: "Discounted tickets for weekend family shows — scheduled to start soon.",
      fullDescription: "This demo offer is scheduled: it appears in management as Scheduled and becomes visible to members on its start date.",
      category: "Family", value: { type: "percent", percent: 25, conditions: "" },
      availability: { ongoing: false, startDate: d(10), endDate: d(100), timezone: "America/Edmonton", blackoutDates: [] },
      redemption: { method: "online", url: "https://example.com/aurora/tickets?offer=demo", instructions: "Select Use Perk to book discounted tickets." },
      location: { onlineOnly: false, city: "Calgary", region: "AB", country: "Canada" },
      eligibility: { groups: "Eligible Culturosity members", householdAllowed: true, exclusions: "", terms: "Demo terms only." },
    },
  },
  {
    org: "northwind-demo", image: "cedar-lane",
    input: {
      provider: { name: "Cedar Lane Fitness (Demo)", description: "A fictional fitness club near the Northwind office.", category: "Fitness", website: "https://example.com/cedar-lane" },
      title: "15% off monthly membership", shortDescription: "Discounted monthly gym membership for Northwind employees.",
      fullDescription: "Show your member card at the front desk to enrol at the employee rate. Demonstration content for Northwind Demo Co.",
      category: "Fitness", value: { type: "percent", percent: 15, conditions: "Monthly plans only." },
      availability: { ongoing: true, timezone: "America/Toronto", blackoutDates: [] },
      redemption: { method: "in_person", instructions: "Show your member card at the front desk. Staff will verify your QR code.", usageLimitPerMember: 1 },
      location: base("Toronto", "ON", "Canada", "500 Example Road", "M4M 0A0"),
      eligibility: { groups: "Northwind employees", householdAllowed: false, exclusions: "", terms: "Demo terms only." },
    },
  },
  {
    org: "northwind-demo", image: "brightside-bike",
    input: {
      provider: { name: "Brightside Bike Co. (Demo)", description: "A fictional bike shop.", category: "Retail", website: "https://example.com/brightside" },
      title: "$40 off a full bike tune-up", shortDescription: "Spring-ready service with safety check and drivetrain clean.",
      fullDescription: "Book a full tune-up online using the employee link. Demonstration content.",
      category: "Retail", value: { type: "amount", amount: 40, currency: "CAD", conditions: "" },
      availability: { ongoing: false, startDate: d(-30), endDate: d(30), timezone: "America/Toronto", blackoutDates: [] },
      redemption: { method: "online", url: "https://example.com/brightside/book?offer=demo", instructions: "Select Use Perk and choose 'Employee tune-up' when booking." },
      location: { onlineOnly: false, city: "Mississauga", region: "ON", country: "Canada" },
      eligibility: { groups: "Northwind employees", householdAllowed: true, exclusions: "", terms: "Demo terms only." },
    },
  },
  {
    org: "northwind-demo", image: "wellness-day",
    input: {
      provider: { name: "Northwind People Team (Demo)", description: "Internal demo provider.", category: "Wellness" },
      title: "Wellness Day: free massage and mindfulness sessions", shortDescription: "Drop-in sessions at the Northwind office on scheduled dates.",
      fullDescription: "Sign up at reception on the day. No booking link — show your member card at the wellness room. Demonstration content.",
      category: "Wellness", value: { type: "free", label: "Free sessions", conditions: "" },
      availability: { ongoing: false, startDate: d(-3), endDate: d(40), timezone: "America/Toronto", blackoutDates: [] },
      occurrences: [
        { date: d(4), startTime: "10:00", endTime: "15:00", venue: "Northwind HQ, Level 3", notes: "" },
        { date: d(32), startTime: "10:00", endTime: "15:00", venue: "Northwind HQ, Level 3", notes: "" },
      ],
      redemption: { method: "in_person", instructions: "Attend during the session hours and show your member card at the wellness room." },
      location: base("Toronto", "ON", "Canada", "1 Example Plaza", "M5J 0A0"),
      eligibility: { groups: "Northwind employees", householdAllowed: false, exclusions: "", terms: "Demo terms only." },
    },
  },
  {
    org: "harbour-demo", image: "dockside-coffee",
    input: {
      provider: { name: "Dockside Coffee Roasters (Demo)", description: "A fictional café.", category: "Food & Drink" },
      title: "Buy one drink, get one free", shortDescription: "For Harbour members on weekday mornings.",
      fullDescription: "Show your member card before ordering. Demonstration content for Harbour Demo Union.",
      category: "Food & Drink", value: { type: "bogo", conditions: "Weekdays before 11am." },
      availability: { ongoing: true, timezone: "America/Halifax", blackoutDates: [] },
      redemption: { method: "in_person", instructions: "Show your member card before ordering." },
      location: base("Halifax", "NS", "Canada", "600 Example Pier", "B3J 0A0"),
      eligibility: { groups: "Harbour union members", householdAllowed: false, exclusions: "", terms: "Demo terms only." },
    },
  },
  {
    org: "harbour-demo", image: "harbour-legal",
    input: {
      provider: { name: "Harbour Legal Clinic (Demo)", description: "A fictional advice clinic.", category: "Services", website: "https://example.com/harbour-legal" },
      title: "Free 30-minute consultation", shortDescription: "Private Harbour member offer — not visible to other organizations.",
      fullDescription: "Book a free initial consultation online. Demonstration content used to test tenant isolation.",
      category: "Services", value: { type: "free", label: "Free consultation", conditions: "" },
      availability: { ongoing: true, timezone: "America/Halifax", blackoutDates: [] },
      redemption: { method: "online", url: "https://example.com/harbour-legal/book?offer=demo", instructions: "Select Use Perk to choose a time." },
      location: { onlineOnly: true },
      eligibility: { groups: "Harbour union members", householdAllowed: false, exclusions: "", terms: "Demo terms only." },
    },
  },
];

function findImage(name: string): Uint8Array | null {
  for (const dir of [resolve(process.cwd(), "server/seed/images"), resolve(process.cwd(), "../server/seed/images")]) {
    const p = resolve(dir, `${name}.webp`);
    if (existsSync(p)) return new Uint8Array(readFileSync(p));
  }
  return null;
}

async function ensureUser(q: Queryable, email: string, name: string, password: string) {
  const r = await q.query<{ id: string }>(`select id from app_users where email = $1`, [email]);
  if (r.rows[0]) return r.rows[0].id;
  return passwordAuth.createPasswordUser(q, { email, password, displayName: name, isDemo: true, verified: true });
}

async function ensureMember(q: Queryable, userId: string, orgId: string, role: string, programIds: string[]) {
  const m = await q.query<{ id: string }>(
    `insert into memberships (user_id, org_id, role) values ($1,$2,$3)
     on conflict (user_id, org_id) do update set role = excluded.role, status = 'active' returning id`,
    [userId, orgId, role],
  );
  for (const p of programIds) await q.query(`insert into program_memberships (program_id, membership_id) values ($1,$2) on conflict do nothing`, [p, m.rows[0].id]);
}

export async function seedDemo(db: Db, storage: StorageAdapter, opts: { password?: string | null } = {}) {
  await seedBase(db);
  const password = opts.password || DEMO_DEFAULT_PASSWORD;
  const exists = await db.query(`select 1 from organizations where slug = 'northwind-demo'`);
  if (exists.rows.length) return { created: false };

  const ids = await db.tx(async (q) => {
    const cul = (await q.query<{ id: string }>(`select id from organizations where slug = 'culturosity'`)).rows[0].id;
    const culReal = (await q.query<{ id: string }>(`select id from programs where org_id = $1 and slug = 'culturosity-perks'`, [cul])).rows[0].id;
    const culDemo = (
      await q.query<{ id: string }>(
        `insert into programs (org_id, slug, name, description, is_demo) values ($1,'culturosity-perks-demo','Culturosity Perks — Demo',
           'Sample offers from fictional providers, used for demonstrations only.', true)
         on conflict (org_id, slug) do update set is_demo = true returning id`,
        [cul],
      )
    ).rows[0].id;
    const mkOrg = async (slug: string, name: string, program: string, accent: string, welcome: string) => {
      const o = await q.query<{ id: string }>(
        `insert into organizations (slug, name, kind, is_demo, program_display_name, welcome_copy, accent_color, contact_name, contact_email, coverage, approx_member_count, delivery_preference)
         values ($1,$2,'client',true,$3,$4,$5,'Demo Contact','contact@example.com','Ontario, Canada',250,'launch') returning id`,
        [slug, name, program, welcome, accent],
      );
      const p = await q.query<{ id: string }>(`insert into programs (org_id, slug, name, is_default, is_demo) values ($1,'perks',$2,true,true) returning id`, [o.rows[0].id, program]);
      return { org: o.rows[0].id, program: p.rows[0].id };
    };
    const nw = await mkOrg("northwind-demo", "Northwind Demo Co.", "Northwind Perks", "#57F6C3", "Welcome to Northwind Perks — exclusive offers for our team. (Demo workspace)");
    const hb = await mkOrg("harbour-demo", "Harbour Demo Union", "Harbour Member Savings", "#D2F538", "Savings for Harbour members and their families. (Demo workspace)");

    const u = {
      superAdmin: await ensureUser(q, "super@demo.culturosity.test", "Sam Super (Demo)", password),
      sales: await ensureUser(q, "sales@demo.culturosity.test", "Sasha Sales (Demo)", password),
      member: await ensureUser(q, "member@demo.culturosity.test", "Morgan Member (Demo)", password),
      nwAdmin: await ensureUser(q, "admin@northwind.example", "Nia Northwind Admin (Demo)", password),
      nwMember: await ensureUser(q, "member@northwind.example", "Noor Northwind Member (Demo)", password),
      hbAdmin: await ensureUser(q, "admin@harbour.example", "Hari Harbour Admin (Demo)", password),
      hbMember: await ensureUser(q, "member@harbour.example", "Hana Harbour Member (Demo)", password),
      provider: await ensureUser(q, "provider@demo.culturosity.test", "Pat Provider (Demo)", password),
    };
    await q.query(`insert into platform_grants (user_id, grant_name) values ($1,'super_admin') on conflict do nothing`, [u.superAdmin]);
    await q.query(`insert into platform_grants (user_id, grant_name) values ($1,'sales_admin') on conflict do nothing`, [u.sales]);
    await ensureMember(q, u.superAdmin, cul, "owner", [culReal, culDemo]);
    await ensureMember(q, u.sales, cul, "member", [culDemo]);
    await ensureMember(q, u.member, cul, "member", [culDemo]);
    await ensureMember(q, u.member, nw.org, "member", [nw.program]);
    await ensureMember(q, u.nwAdmin, nw.org, "owner", [nw.program]);
    await ensureMember(q, u.nwMember, nw.org, "member", [nw.program]);
    await ensureMember(q, u.hbAdmin, hb.org, "owner", [hb.program]);
    await ensureMember(q, u.hbMember, hb.org, "member", [hb.program]);
    await ensureMember(q, u.provider, nw.org, "provider_manager", []);
    await ensureMember(q, u.provider, cul, "provider_manager", []);
    await q.query(`insert into program_entitlements (org_id, source_program_id, granted_by) values ($1,$2,$3) on conflict do nothing`, [nw.org, culDemo, u.superAdmin]);
    return { cul, culDemo, nw, hb, u };
  });

  const orgIds: Record<DemoPerk["org"], { org: string; program: string }> = {
    culturosity: { org: ids.cul, program: ids.culDemo },
    "northwind-demo": ids.nw,
    "harbour-demo": ids.hb,
  };
  const created: Record<string, { perkId: string; providerId: string }> = {};
  for (const p of DEMO_PERKS) {
    const target = orgIds[p.org];
    let imageAssetId: string | undefined;
    const bytes = findImage(p.image);
    if (bytes) {
      const key = `org/${target.org}/demo/${p.image}-${randomToken(6)}.webp`;
      await storage.put(key, bytes, "image/webp");
      const a = await db.query<{ id: string }>(
        `insert into assets (org_id, scope, storage_key, mime, bytes, alt, status) values ($1,'org',$2,'image/webp',$3,$4,'attached') returning id`,
        [target.org, key, bytes.byteLength, `${p.input.provider.name} — demo image`],
      );
      imageAssetId = a.rows[0].id;
    }
    const input = perkInputSchema.parse({
      ...p.input,
      tags: p.input.tags ?? [],
      occurrences: p.input.occurrences ?? [],
      media: { imageAssetId, imageAlt: imageAssetId ? `Abstract ${p.input.category.toLowerCase()} artwork labelled Demo` : "", additional: [] },
      allowDistribution: Boolean(p.distribute),
    });
    const r = await db.tx((q) => createPerk(q, { orgId: target.org, programId: target.program, input, actorId: null, isDemo: true, intent: "publish" }));
    await db.query(`update providers set is_demo = true where id = $1`, [r.providerId]);
    created[p.image] = r;
  }
  // Offers already distributed from the licensed Culturosity demo program into Northwind.
  for (const key of ["lumen-hall", "fieldnote-lab"]) {
    await db.query(`insert into program_perks (program_id, perk_id) values ($1,$2) on conflict do nothing`, [ids.nw.program, created[key].perkId]);
  }
  // Provider manager assignments.
  await db.query(`insert into provider_assignments (provider_id, user_id, org_id) values ($1,$2,$3) on conflict do nothing`, [created["cedar-lane"].providerId, ids.u.provider, ids.nw.org]);
  await db.query(`insert into provider_assignments (provider_id, user_id, org_id) values ($1,$2,$3) on conflict do nothing`, [created["lumen-hall"].providerId, ids.u.provider, ids.cul]);

  // An expired offer retained in history (inserted directly; publication rejects past windows).
  const expired = await db.query<{ id: string }>(
    `insert into perks (org_id, provider_id, title, short_description, full_description, category, value_type, value_label, value_percent,
        is_ongoing, starts_at, ends_at, timezone, redemption_method, redemption_url, redemption_instructions, is_online_only, city, country,
        eligibility_text, status, is_demo, published_at)
     values ($1,$2,'10% off autumn season tickets (ended)','A past demo offer kept for history.','This demo offer has ended and is kept for reporting history.',
        'Arts & Culture','percent','10% off',10,false, now() - interval '60 days', now() - interval '5 days','America/Toronto','online',
        'https://example.com/riverside','Expired.',false,'Toronto','Canada','Northwind employees','published',true, now() - interval '60 days') returning id`,
    [ids.nw.org, created["brightside-bike"].providerId],
  );
  await db.query(`insert into program_perks (program_id, perk_id) values ($1,$2)`, [ids.nw.program, expired.rows[0].id]);

  // Synthetic, clearly-flagged demo activity so demo dashboards are not empty.
  const perkList = Object.entries(created).filter(([k]) => ["cedar-lane", "brightside-bike", "wellness-day", "lumen-hall", "fieldnote-lab"].includes(k));
  for (let day = 13; day >= 0; day--) {
    for (const [, v] of perkList) {
      const views = 2 + ((day * 7 + v.perkId.charCodeAt(0)) % 6);
      for (let i = 0; i < views; i++) {
        await db.query(
          `insert into analytics_events (event, user_id, org_id, program_id, perk_id, provider_id, is_demo, created_at)
           values ($1,$2,$3,$4,$5,$6,true, now() - make_interval(days => $7) - make_interval(mins => $8))`,
          [i % 4 === 3 ? "use_perk_click" : "perk_view", i % 2 ? ids.u.nwMember : ids.u.member, ids.nw.org, ids.nw.program, v.perkId, v.providerId, day, i * 13],
        );
      }
    }
  }
  return { created: true };
}

/** Remove and recreate all demo-only data. Real records are never touched. */
export async function resetDemoData(db: Db, opts: { password?: string | null; keepUsers?: boolean; storage?: StorageAdapter }) {
  await db.tx(async (q) => {
    await q.query(`delete from service_requests where is_demo`);
    await q.query(`delete from analytics_events where is_demo`);
    await q.query(`delete from organizations where is_demo`); // cascades demo workspaces
    await q.query(`delete from redemptions where is_demo`);
    await q.query(`delete from perks where is_demo`);
    await q.query(`delete from providers where is_demo`);
    await q.query(`delete from programs where is_demo`);
    await q.query(`delete from assets a where a.storage_key like '%/demo/%'`);
    if (!opts.keepUsers) await q.query(`delete from app_users where is_demo`);
    else await q.query(`delete from memberships m using app_users u where u.id = m.user_id and u.is_demo`);
  });
  const { createStorageFromConfig } = await import("../adapters/storage");
  const { loadConfig } = await import("../env");
  const storage = opts.storage ?? (await createStorageFromConfig(loadConfig()));
  return seedDemo(db, storage, { password: opts.password });
}
