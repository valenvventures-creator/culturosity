import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { setup, client, samplePerk, TEST_GATE_CODE, PASSWORD, type App } from "./helpers";

let app: App;
let ctx: Awaited<ReturnType<typeof setup>>;
let nwOrgId: string;
let nwProgramId: string;

beforeAll(async () => {
  ctx = await setup();
  app = ctx.app;
  const r = await ctx.db.query<any>(`select o.id as org, p.id as program from organizations o join programs p on p.org_id = o.id and p.is_default where o.slug = 'northwind-demo'`);
  nwOrgId = r.rows[0].org;
  nwProgramId = r.rows[0].program;
});

describe("security plumbing", () => {
  it("rejects mutations without the CSRF header", async () => {
    const res = await app.request("/api/auth/signin", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(res.status).toBe(403);
  });
  it("rejects cross-origin mutations", async () => {
    const res = await app.request("/api/auth/signin", {
      method: "POST",
      headers: { "content-type": "application/json", "x-culturosity-csrf": "1", origin: "https://evil.example", host: "localhost:5173" },
      body: JSON.stringify({ email: "a@b.co", password: "x" }),
    });
    expect(res.status).toBe(403);
  });
  it("public teaser never contains promo codes, URLs or instructions", async () => {
    const r = await client(app).get("/public/perks");
    expect(r.status).toBe(200);
    expect(r.json.perks.length).toBeGreaterThan(0);
    const s = JSON.stringify(r.json);
    expect(s).not.toContain("DEMOPULSE20");
    expect(s).not.toContain("redemption_url");
    expect(s).not.toContain("redemption_instructions");
  });
});

describe("1. member browsing, filters, favourites, details", () => {
  it("lists Culturosity offers A–Z, filters, favourites and opens details", async () => {
    const m = client(app);
    await m.signIn("member@demo.culturosity.test");
    const all = await m.get("/catalogue?scope=culturosity");
    expect(all.status).toBe(200);
    const names = all.json.perks.map((p: any) => p.provider_name);
    expect(names).toEqual([...names].sort((a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base" })));
    // Scheduled offer is not in the member catalogue.
    expect(names.some((n: string) => n.startsWith("Aurora"))).toBe(false);
    for (const p of all.json.perks) {
      expect(p.provider_name).toBeTruthy();
      expect(p.title).toBeTruthy();
      expect(p.value_label).toBeTruthy();
    }
    const online = await m.get("/catalogue?scope=culturosity&mode=online");
    expect(online.json.perks.every((p: any) => p.redemption_method !== "in_person")).toBe(true);
    const search = await m.get("/catalogue?q=pottery");
    expect(search.json.perks).toHaveLength(1);

    const perk = all.json.perks.find((p: any) => p.provider_name.startsWith("Northern Pulse"));
    const fav = await m.post("/favourites", { programId: perk.program_id, perkId: perk.id });
    expect(fav.json.is_favourite).toBe(true);
    const favs = await m.get("/catalogue?scope=culturosity&favourites=1");
    expect(favs.json.perks.map((p: any) => p.id)).toEqual([perk.id]);

    const detail = await m.get(`/perks/${perk.id}?programId=${perk.program_id}`);
    expect(detail.json.access).toBe("member");
    expect(detail.json.perk.promo_code).toBe("DEMOPULSE20");
    expect(detail.json.perk.redemption_url).toContain("https://example.com/northern-pulse");
    expect(detail.json.perk.occurrences).toHaveLength(2);
    const click = await m.post("/events", { event: "use_perk_click", programId: perk.program_id, perkId: perk.id });
    expect(click.json.redirect).toBe(detail.json.perk.redemption_url);
  });

  it("anonymous detail requests get the teaser only", async () => {
    const m = client(app);
    await m.signIn("member@demo.culturosity.test");
    const list = await m.get("/catalogue?q=Northern");
    const anon = await client(app).get(`/perks/${list.json.perks[0].id}`);
    expect(anon.json.access).toBe("teaser");
    expect(anon.json.perk.promo_code).toBeUndefined();
  });
});

describe("2/3. dedicated submission publishes automatically; failures and retries", () => {
  it("company admin publishes; member on another device sees it", async () => {
    const admin = client(app, "10.0.0.2");
    await admin.signIn("admin@northwind.example");
    const dest = await admin.get("/submit/destinations");
    const nw = dest.json.destinations.find((d: any) => d.orgSlug === "northwind-demo");
    expect(nw.mode).toBe("publish");
    const key = randomUUID();
    const body = { idempotencyKey: key, destination: { orgId: nwOrgId, programId: nwProgramId }, perk: samplePerk(), submitter: { name: "Nia", email: "admin@northwind.example", organization: "Northwind", authorityConfirmed: true } };
    const first = await admin.post("/submissions", body);
    expect(first.status).toBe(201);
    expect(first.json.status).toBe("published");
    const retry = await admin.post("/submissions", body);
    expect(retry.status).toBe(200);
    expect(retry.json.perkId).toBe(first.json.perkId);
    const count = await ctx.db.query<{ n: number }>(`select count(*)::int as n from perks where title = 'Test perk for automatic publication'`);
    expect(count.rows[0].n).toBe(1);

    const member = client(app, "10.0.0.3");
    await member.signIn("member@northwind.example");
    const cat = await member.get("/catalogue?scope=org:northwind-demo");
    expect(cat.json.perks.some((p: any) => p.id === first.json.perkId)).toBe(true);
    const det = await member.get(`/perks/${first.json.perkId}`);
    expect(det.json.access).toBe("member");
  });

  it("validation errors are field-level and nothing is created", async () => {
    const admin = client(app);
    await admin.signIn("admin@northwind.example");
    const bad = samplePerk({ value: { type: "percent", percent: 140, conditions: "" }, redemption: { method: "online", instructions: "short" } });
    const r = await admin.post("/submissions", { idempotencyKey: randomUUID(), destination: { orgId: nwOrgId, programId: nwProgramId }, perk: bad, submitter: { name: "Nia", email: "a@b.co", authorityConfirmed: true } });
    expect(r.status).toBe(422);
    expect(r.json.error.fields["perk.value.percent"]).toBeTruthy();
    expect(r.json.error.fields["perk.redemption.url"]).toBeTruthy();
  });

  it("uploads validate real image bytes", async () => {
    const admin = client(app);
    await admin.signIn("admin@northwind.example");
    const fd = new FormData();
    fd.append("orgId", nwOrgId);
    fd.append("file", new File([new TextEncoder().encode("<svg onload=alert(1)>")], "x.png", { type: "image/png" }));
    const r = await admin.raw("POST", "/uploads", fd);
    expect(r.status).toBe(400);
  });

  it("ordinary member submissions go to the review queue, approval publishes", async () => {
    const member = client(app);
    await member.signIn("member@northwind.example");
    const r = await member.post("/submissions", {
      idempotencyKey: randomUUID(),
      destination: { orgId: nwOrgId, programId: nwProgramId },
      perk: samplePerk({ title: "Member suggested perk" }),
      submitter: { name: "Noor", email: "member@northwind.example", authorityConfirmed: true },
    });
    expect(r.json.status).toBe("pending_review");
    const admin = client(app);
    await admin.signIn("admin@northwind.example");
    const q = await admin.get("/orgs/northwind-demo/submissions");
    const s = q.json.submissions.find((x: any) => x.id === r.json.submissionId);
    const ok = await admin.post(`/orgs/northwind-demo/submissions/${s.id}/approve`, { notes: "Looks good" });
    expect(ok.json.status).toBe("published");
  });
});

describe("4. scheduling, pausing and expiry", () => {
  it("future offers are scheduled; paused offers cannot be viewed or redeemed", async () => {
    const admin = client(app);
    await admin.signIn("admin@northwind.example");
    const start = new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10);
    const r = await admin.post("/submissions", {
      idempotencyKey: randomUUID(),
      destination: { orgId: nwOrgId, programId: nwProgramId },
      perk: samplePerk({ title: "Future perk", availability: { ongoing: true, startDate: start, timezone: "America/Toronto", blackoutDates: [] } }),
      submitter: { name: "Nia", email: "a@b.co", authorityConfirmed: true },
    });
    expect(r.json.status).toBe("scheduled");
    const list = await admin.get("/orgs/northwind-demo/perks?status=scheduled");
    expect(list.json.perks.some((p: any) => p.id === r.json.perkId)).toBe(true);
    const member = client(app);
    await member.signIn("member@northwind.example");
    expect((await member.get(`/perks/${r.json.perkId}`)).status).toBe(404);

    const live = (await member.get("/catalogue?q=Cedar")).json.perks[0];
    const paused = await admin.post(`/orgs/northwind-demo/perks/${live.id}/status`, { action: "pause" });
    expect(paused.json.status).toBe("paused");
    expect((await member.post("/redemption-tokens", { programId: live.program_id, perkId: live.id })).status).toBe(404);
    await admin.post(`/orgs/northwind-demo/perks/${live.id}/status`, { action: "resume" });

    const expired = await admin.get("/orgs/northwind-demo/perks?status=expired");
    expect(expired.json.perks.length).toBeGreaterThan(0);
    expect((await member.get(`/perks/${expired.json.perks[0].id}`)).status).toBe(404);
  });
});

describe("5. tenant isolation", () => {
  it("Company A cannot read Company B data via API or URL changes", async () => {
    const hb = client(app);
    await hb.signIn("member@harbour.example");
    const nwMember = client(app);
    await nwMember.signIn("member@northwind.example");
    const nwPerk = (await nwMember.get("/catalogue?q=Cedar")).json.perks[0];
    expect((await hb.get(`/perks/${nwPerk.id}`)).status).toBe(404);
    expect((await hb.get(`/perks/${nwPerk.id}?programId=${nwPerk.program_id}`)).status).toBe(404);
    expect((await hb.get(`/catalogue?programId=${nwPerk.program_id}`)).status).toBe(404);
    expect((await hb.post("/favourites", { programId: nwPerk.program_id, perkId: nwPerk.id })).status).toBe(404);
    expect((await hb.get(`/assets/${nwPerk.image_asset_id}`)).status).toBe(404);
    const hbAdmin = client(app);
    await hbAdmin.signIn("admin@harbour.example");
    for (const p of ["/orgs/northwind-demo/members", "/orgs/northwind-demo/perks", "/orgs/northwind-demo/reports", "/orgs/northwind-demo/export/perks.csv", "/orgs/northwind-demo/dashboard"])
      expect((await hbAdmin.get(p)).status).toBe(404);
    const dest = await hbAdmin.post("/submissions", {
      idempotencyKey: randomUUID(),
      destination: { orgId: nwOrgId, programId: nwProgramId },
      perk: samplePerk(),
      submitter: { name: "Hari", email: "a@b.co", authorityConfirmed: true },
    });
    expect(dest.status).toBe(403);
    const hbCat = await hb.get("/catalogue");
    expect(hbCat.json.perks.every((p: any) => !p.provider_name.startsWith("Cedar"))).toBe(true);
  });

  it("company members cannot reach admin endpoints of their own org", async () => {
    const m = client(app);
    await m.signIn("member@northwind.example");
    expect((await m.get("/orgs/northwind-demo/members")).status).toBe(403);
  });
});

describe("6. provider scope and atomic redemption", () => {
  it("provider manager edits only assigned offers and redemptions cannot double-spend", async () => {
    const prov = client(app);
    await prov.signIn("provider@demo.culturosity.test");
    const list = await prov.get("/orgs/northwind-demo/perks");
    expect(list.status).toBe(200);
    expect(list.json.perks.every((p: any) => p.provider_name.startsWith("Cedar"))).toBe(true);
    const bike = await ctx.db.query<any>(`select id from perks where title like '$40 off%'`);
    expect((await prov.get(`/orgs/northwind-demo/perks/${bike.rows[0].id}`)).status).toBe(404);
    expect((await prov.post(`/orgs/northwind-demo/perks/${bike.rows[0].id}/status`, { action: "pause" })).status).toBe(404);

    const member = client(app);
    await member.signIn("member@northwind.example");
    const cedar = (await member.get("/catalogue?q=Cedar")).json.perks[0];
    const tok = await member.post("/redemption-tokens", { programId: cedar.program_id, perkId: cedar.id });
    // One-time codes last 24 hours.
    expect(tok.json.expiresInSeconds).toBe(86400);
    const ttlMs = new Date(tok.json.expiresAt).getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(23.9 * 3600_000);
    expect(ttlMs).toBeLessThanOrEqual(24 * 3600_000);
    expect(tok.status).toBe(200);
    expect(tok.json.qrPayload).toMatch(/^CUL1:CUL-P-/);
    expect(tok.json.qrPayload).not.toContain("northwind.example");

    // A different provider's verifier is refused.
    const hbAdmin = client(app);
    await hbAdmin.signIn("admin@harbour.example");
    expect((await hbAdmin.post("/provider/verify", { code: tok.json.qrPayload })).json.result).toBe("wrong_provider");

    const [a, b] = await Promise.all([prov.post("/provider/verify", { code: tok.json.qrPayload }), prov.post("/provider/verify", { code: tok.json.manualCode })]);
    const results = [a.json.result, b.json.result].sort();
    expect(results).toEqual(["already_used", "valid"]);
    const n = await ctx.db.query<{ n: number }>(`select count(*)::int as n from redemptions where perk_id = $1`, [cedar.id]);
    expect(n.rows[0].n).toBe(1);
    // Usage limit (1) now reached: new codes are refused.
    expect((await member.post("/redemption-tokens", { programId: cedar.program_id, perkId: cedar.id })).status).toBe(409);
    expect((await prov.post("/provider/verify", { code: "ZZZZZ-ZZZZZ" })).json.result).toBe("not_found");
    // A promo code or a perk link gets a helpful explanation instead of a bare "not recognised".
    const promo = (await prov.post("/provider/verify", { code: "CULTURE10" })).json;
    expect(promo.result).toBe("not_found");
    expect(promo.message).toContain("Promo codes");
    expect((await prov.post("/provider/verify", { code: "https://www.blufish.ca" })).json.message).toContain("one-time code");
  });
});

describe("7. numerical-code gate", () => {
  it("super admin unlocks with the code; others and wrong codes are denied", async () => {
    const sa = client(app, "10.1.0.1");
    await sa.signIn("super@demo.culturosity.test");
    expect((await sa.get("/internal/research")).status).toBe(423);
    const wrong = await sa.post("/internal/gate/unlock", { code: "0000000000" });
    expect(wrong.status).toBe(401);
    const ok = await sa.post("/internal/gate/unlock", { code: TEST_GATE_CODE });
    expect(ok.status).toBe(200);
    expect((await sa.get("/internal/research")).status).toBe(200);
    await sa.post("/internal/gate/lock");
    expect((await sa.get("/internal/research")).status).toBe(423);

    const ca = client(app, "10.1.0.2");
    await ca.signIn("admin@northwind.example");
    expect((await ca.get("/internal/gate")).status).toBe(404);
    expect((await ca.post("/internal/gate/unlock", { code: TEST_GATE_CODE })).status).toBe(404);
    expect((await ca.get("/internal/research")).status).toBe(404);
    const anon = client(app, "10.1.0.3");
    expect((await anon.post("/internal/gate/unlock", { code: TEST_GATE_CODE })).status).toBe(401);

    // Unlock is bound to the session: another session of the same admin stays locked.
    const sa2 = client(app, "10.1.0.4");
    await sa2.signIn("super@demo.culturosity.test");
    await sa.post("/internal/gate/unlock", { code: TEST_GATE_CODE });
    expect((await sa2.get("/internal/research")).status).toBe(423);
    // Expired grant is denied.
    await ctx.db.query(`update admin_unlocks set expires_at = now() - interval '1 minute' where revoked_at is null`);
    expect((await sa.get("/internal/research")).status).toBe(423);
  });

  it("rate-limits repeated wrong codes and never stores the entered code", async () => {
    const s = client(app, "10.1.0.9");
    await s.signIn("sales@demo.culturosity.test");
    for (let i = 0; i < 5; i++) await s.post("/internal/gate/unlock", { code: "1111111111" });
    expect((await s.post("/internal/gate/unlock", { code: TEST_GATE_CODE })).status).toBe(429);
    const dump = await ctx.db.query<any>(`select row_to_json(g)::text as t from gate_attempts g`);
    expect(dump.rows.some((r: any) => r.t.includes("1111111111") || r.t.includes(TEST_GATE_CODE))).toBe(false);
    const logs = await ctx.db.query<any>(`select meta::text as t from audit_logs`);
    expect(logs.rows.some((r: any) => r.t.includes(TEST_GATE_CODE))).toBe(false);
  });
});

describe("8/9. research directory and outreach", () => {
  it("directory is seeded, A–Z, filterable, exportable; outreach drafts are saved, not sent", async () => {
    const sa = client(app, "10.2.0.1");
    await sa.signIn("super@demo.culturosity.test");
    await sa.post("/internal/gate/unlock", { code: TEST_GATE_CODE });
    const all = await sa.get("/internal/research");
    expect(all.json.stats.total).toBe(20);
    const names = all.json.records.map((r: any) => r.display_name);
    expect(names[0]).toBe("Abenity");
    expect(names).toEqual([...names].sort((a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase())));
    expect(names).not.toContain("Beneplace");
    const ca = await sa.get("/internal/research?country=CA&type=operator");
    expect(ca.json.records.map((r: any) => r.display_name)).toEqual(expect.arrayContaining(["Perkopolis", "Venngo"]));
    const csv = await sa.get("/internal/research/export.csv");
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(String(csv.json)).toContain("https://www.perkopolis.com/about");

    const rec = all.json.records.find((r: any) => r.display_name === "Perkopolis");
    const gen = await sa.post("/internal/outreach/generate", { researchOrgId: rec.id, objective: "partnership", channel: "email", tone: "warm" });
    expect(gen.status).toBe(200);
    expect(gen.json.generator).toBe("template");
    expect(gen.json.label).toBe("Example template");
    expect(gen.json.content.sections[0].title).toBe("Program operator approach");
    const saved = await sa.post("/internal/outreach/drafts", { researchOrgId: rec.id, ...gen.json, objective: "partnership", channel: "email" });
    expect(saved.status).toBe(201);
    const detail = await sa.get(`/internal/research/${rec.id}`);
    expect(detail.json.drafts).toHaveLength(1);
    expect(detail.json.prospect).toBeNull(); // drafting does not mark Contacted
    await sa.post(`/internal/research/${rec.id}/activities`, { kind: "email", summary: "Sent intro email manually", advanceToContacted: true });
    expect((await sa.get(`/internal/research/${rec.id}`)).json.prospect.stage).toBe("contacted");
    await sa.put(`/internal/prospects/${rec.id}`, { stage: "do_not_contact" });
    expect((await sa.post("/internal/outreach/generate", { researchOrgId: rec.id, objective: "partnership", channel: "email" })).status).toBe(409);
  });
});

describe("pipeline board", () => {
  it("adds a record to a stage, moves it, and only clears Do Not Contact explicitly", async () => {
    const sa = client(app, "10.6.0.1");
    await sa.signIn("super@demo.culturosity.test");
    await sa.post("/internal/gate/unlock", { code: TEST_GATE_CODE });
    const rec = (await sa.get("/internal/research?q=Abenity")).json.records[0];
    expect(rec.in_pipeline).toBe(false);
    expect((await sa.put(`/internal/prospects/${rec.id}`, { stage: "qualified" })).status).toBe(200);
    let p = (await sa.get("/internal/pipeline")).json.prospects.find((x: any) => x.research_org_id === rec.id);
    expect(p.stage).toBe("qualified");
    expect((await sa.get("/internal/research?q=Abenity")).json.records[0].in_pipeline).toBe(true);
    await sa.put(`/internal/prospects/${rec.id}`, { stage: "do_not_contact" });
    await sa.put(`/internal/prospects/${rec.id}`, { stage: "contact_planned" }); // no explicit clear
    p = (await sa.get("/internal/pipeline")).json.prospects.find((x: any) => x.research_org_id === rec.id);
    expect(p.do_not_contact).toBe(true);
    await sa.put(`/internal/prospects/${rec.id}`, { stage: "contact_planned", doNotContact: false });
    p = (await sa.get("/internal/pipeline")).json.prospects.find((x: any) => x.research_org_id === rec.id);
    expect(p.do_not_contact).toBe(false);
    const changes = (await sa.get(`/internal/research/${rec.id}`)).json.activities.filter((a: any) => a.kind === "stage_change");
    expect(changes.length).toBeGreaterThanOrEqual(3);
  });
});

describe("10. managed-service requests", () => {
  it("public request is saved and appears in the internal queue", async () => {
    const r = await client(app, "10.3.0.1").post("/service-requests", {
      organizationName: "Example Credit Union",
      contactName: "Alex",
      contactEmail: "alex@example.org",
      approxMemberCount: 1200,
      serviceNeeds: ["Branded portal setup and launch"],
      approach: "managed",
      coverage: "Ontario",
      targetLaunch: "Q2",
      message: "Interested",
    });
    expect(r.status).toBe(201);
    const sa = client(app);
    await sa.signIn("super@demo.culturosity.test");
    const q = await sa.get("/internal/service-requests");
    expect(q.json.requests.some((x: any) => x.organization_name === "Example Credit Union")).toBe(true);
    const nonAdmin = client(app);
    await nonAdmin.signIn("admin@northwind.example");
    expect((await nonAdmin.get("/internal/service-requests")).status).toBe(404);
  });

  it("emails the notification address and a fixed-wording confirmation to the requester", async () => {
    const sa = client(app, "10.3.0.5");
    await sa.signIn("super@demo.culturosity.test");
    await sa.post("/internal/gate/unlock", { code: TEST_GATE_CODE });
    const outbox = async (to: string) =>
      (await ctx.db.query<{ subject: string; body_text: string }>(`select subject, body_text from email_outbox where to_email = $1 order by created_at`, [to])).rows;
    const submit = (ip: string, contactEmail: string) =>
      client(app, ip).post("/service-requests", {
        organizationName: "Prairie Teachers Association",
        contactName: "Jamie",
        contactEmail,
        serviceNeeds: ["Program strategy and benefits planning"],
        approach: "launch",
        message: "Please call me",
      });

    // Owner-only setting.
    const sales = client(app, "10.3.0.6");
    await sales.signIn("sales@demo.culturosity.test");
    expect((await sales.put("/internal/settings/notifications", { serviceNotificationEmail: "x@example.com" })).status).toBe(404);
    expect((await sa.put("/internal/settings/notifications", { serviceNotificationEmail: "not an email" })).status).toBe(400);
    expect((await sa.put("/internal/settings/notifications", { serviceNotificationEmail: "Proposals@Example.com" })).status).toBe(200);
    expect((await sa.get("/internal/settings/notifications")).json.effectiveRecipients).toEqual(["proposals@example.com"]);

    expect((await submit("10.3.0.7", "jamie@example.org")).status).toBe(201);
    const note = await outbox("proposals@example.com");
    expect(note).toHaveLength(1);
    expect(note[0].subject).toBe("New proposal request: Prairie Teachers Association");
    expect(note[0].body_text).toContain("Jamie <jamie@example.org>");
    expect(note[0].body_text).toContain("Please call me");
    expect(note[0].body_text).toContain("/culturosity/admin/services");
    const conf = await outbox("jamie@example.org");
    expect(conf).toHaveLength(1);
    expect(conf[0].subject).toBe("We received your request — Culturosity");
    expect(conf[0].body_text).not.toContain("Please call me"); // no submitted free text in the confirmation
    expect(conf[0].body_text).not.toContain("Prairie Teachers");

    // With no address set, the (non-demo) super admins are notified.
    await sa.put("/internal/settings/notifications", { serviceNotificationEmail: "" });
    const { passwordAuth } = await import("../server/lib/auth");
    const ownerId = await ctx.db.tx((q) => passwordAuth.createPasswordUser(q, { email: "owner@culturosity.example", password: "a-long-owner-password-1", displayName: "Owner", verified: true }));
    await ctx.db.query(`insert into platform_grants (user_id, grant_name) values ($1,'super_admin')`, [ownerId]);
    expect((await sa.get("/internal/settings/notifications")).json.effectiveRecipients).toEqual(["owner@culturosity.example"]);
    await submit("10.3.0.8", "jamie2@example.org");
    expect(await outbox("owner@culturosity.example")).toHaveLength(1);
    await ctx.db.query(`update platform_grants set revoked_at = now() where user_id = $1`, [ownerId]);
  });
});

describe("accounts", () => {
  it("sign-up, verification via outbox, enrollment never grants admin", async () => {
    const admin = client(app);
    await admin.signIn("admin@northwind.example");
    expect((await admin.post("/orgs/northwind-demo/enrollment-rules", { domain: "northwind-staff.example" })).status).toBe(201);
    const u = client(app, "10.4.0.1");
    const s = await u.post("/auth/signup", { email: "new.person@northwind-staff.example", password: "a-strong-pass-1", displayName: "New Person" });
    expect(s.status).toBe(200);
    const mail = await ctx.db.query<any>(`select body_text from email_outbox where to_email = 'new.person@northwind-staff.example' order by created_at desc limit 1`);
    const token = mail.rows[0].body_text.match(/token=([A-Za-z0-9_-]+)/)[1];
    expect((await u.post("/auth/verify", { token })).status).toBe(200);
    const me = await u.get("/me");
    const m = me.json.memberships.find((x: any) => x.org_slug === "northwind-demo");
    expect(m.role).toBe("member");
    expect(me.json.grants).toEqual([]);
    expect((await u.get("/orgs/northwind-demo/members")).status).toBe(403);
  });

  it("revoking a session signs that device out", async () => {
    const a = client(app, "10.5.0.1");
    await a.signIn("member@harbour.example");
    const b = client(app, "10.5.0.2");
    await b.signIn("member@harbour.example");
    const sessions = await a.get("/me/sessions");
    const other = sessions.json.sessions.find((s: any) => !s.current);
    await a.del(`/me/sessions/${other.id}`);
    expect((await b.get("/me")).json.user).toBeNull();
  });
});

describe("content packs: Culturosity perk listings and details", () => {
  it("adds the listings and full details once, shows public details safely, and keeps promo codes and QR codes member-only", async () => {
    const { applyContentPacks } = await import("../server/seed/content");
    const log = await applyContentPacks(ctx.db);
    expect(log[0]).toContain("35 Culturosity perks added");
    expect(log[1]).toContain("3 Culturosity perks added");
    expect(log[2]).toContain("3 perks added, 37 perks given full details, 20 provider profiles updated");
    expect(log[3]).toContain("4 perks removed, 1 providers with no remaining perks archived");
    expect(await applyContentPacks(ctx.db)).toEqual([]); // idempotent

    const rows = await ctx.db.query<{ title: string; details_pending: boolean; pos_reference: string | null; image_path: string }>(
      `select pk.title, pk.details_pending, pk.pos_reference, pk.image_path from perks pk join organizations o on o.id = pk.org_id
        where o.slug = 'culturosity' and not pk.is_demo`,
    );
    expect(rows.rows).toHaveLength(37);
    expect(rows.rows.every((r) => !r.details_pending && r.pos_reference && r.image_path.startsWith("/perks/culturosity/"))).toBe(true);
    expect(rows.rows.map((r) => r.title)).not.toEqual(expect.arrayContaining(["Tosca"]));
    const titles = rows.rows.map((r) => r.title);
    expect(titles).toEqual(expect.arrayContaining(["Beethoven’s Violin Concerto & Sibelius’ Symphony No. 1", "Buy one subscription, bring a friend for free to Symphonic Sessions", "Membership", "La Belle Boutique Blanche", "Vocal Assessment"]));
    const providers = await ctx.db.query<{ n: number }>(`select count(*)::int as n from providers where name = 'Blufish Japanese Restaurant'`);
    expect(providers.rows[0].n).toBe(1); // one provider record, several offers

    const pub = (await client(app).get("/public/perks?sort=new")).json.perks.filter((p: any) => !p.is_demo);
    expect(pub.slice(0, 3).map((p: any) => p.title)).toEqual(["Membership", "La Belle Boutique Blanche", "Vocal Assessment"]); // newest first
    const labels = new Set(pub.map((p: any) => p.value_label));
    for (const l of ["Save 25%", "Free", "BOGO", "Exclusive", "Save $2", "Save $5", "Save $25", "Save $10"]) expect(labels.has(l)).toBe(true);
    expect(pub.some((p: any) => ["Tosca", "Gift Shop", "BPM X WAG-Qaumajuq", "Happy Hour - Two Taps and a Snack"].includes(p.title))).toBe(false);
    const find = (t: string) => pub.find((p: any) => p.title === t);

    // Signed out: description, dates and provider contacts are public; codes, links and QR are not.
    const boutique = (await client(app).get(`/perks/${find("La Belle Boutique Blanche").id}`)).json;
    expect(boutique.access).toBe("teaser");
    expect(boutique.perk.full_description).toContain("rustic boutique");
    expect(boutique.perk.full_description).not.toContain("CULTURE10");
    expect(boutique.perk.has_promo).toBe(true);
    expect(boutique.perk.provider_email).toBe("info@msbm.mb.ca");
    expect(boutique.perk.address_line).toBe("494 Taché Ave");
    for (const k of ["promo_code", "pos_reference", "redemption_url"]) expect(boutique.perk[k]).toBeUndefined();

    // A Culturosity member sees everything and can use the perk.
    const sa = client(app, "10.7.0.1");
    await sa.signIn("super@demo.culturosity.test");
    const madeHere = find("Made Here");
    const d = await sa.get(`/perks/${madeHere.id}`);
    expect(d.json.access).toBe("member");
    expect(d.json.perk).toMatchObject({ details_pending: false, promo_code: "MHCULTUROSITY10", pos_reference: "https://madeheremb.com/collections/all", redemption_method: "hybrid", provider_website: "https://madeheremb.com" });
    const progId = d.json.perk.program.id;
    expect((await sa.post("/redemption-tokens", { programId: progId, perkId: madeHere.id })).status).toBe(200);
    const click = await sa.post("/events", { event: "use_perk_click", programId: progId, perkId: madeHere.id });
    expect(click.json.redirect).toBe("https://madeheremb.com/collections/all");

    // A perk whose details are still pending cannot be redeemed.
    await ctx.db.query(`update perks set details_pending = true where id = $1`, [madeHere.id]);
    expect((await sa.post("/redemption-tokens", { programId: progId, perkId: madeHere.id })).status).toBe(409);
    expect((await sa.post("/events", { event: "use_perk_click", programId: progId, perkId: madeHere.id })).status).toBe(409);
    await ctx.db.query(`update perks set details_pending = false where id = $1`, [madeHere.id]);

    // Removed perks are gone, including their Details pages.
    const gone = await ctx.db.query<{ n: number }>(`select count(*)::int as n from perks where title in ('Tosca', 'BPM X WAG-Qaumajuq')`);
    expect(gone.rows[0].n).toBe(0);
    const nonsuch = await ctx.db.query<{ status: string }>(`select status from providers where name = 'Nonsuch Brewing Co.'`);
    expect(nonsuch.rows[0].status).toBe("archived");
  });
});

describe("members & roles: owners and super admins are protected", () => {
  it("lets owners manage people they added, but nobody can suspend, remove or re-role an owner or super admin", async () => {
    const owner = client(app, "10.8.0.1");
    await owner.signIn("admin@northwind.example"); // Northwind's owner
    const sa = client(app, "10.8.0.2");
    await sa.signIn("super@demo.culturosity.test");
    const list = (await owner.get("/orgs/northwind-demo/members")).json.members;
    const ownerRow = list.find((m: any) => m.email === "admin@northwind.example");
    const memberRow = list.find((m: any) => m.email === "member@northwind.example");
    expect(ownerRow.role).toBe("owner");
    expect(memberRow.is_super_admin).toBe(false);

    // Make the super admin a member of this workspace so we can check they're protected too.
    const sup = await ctx.db.query<{ id: string }>(`select id from app_users where email = 'super@demo.culturosity.test'`);
    const nw = await ctx.db.query<{ id: string }>(`select id from organizations where slug = 'northwind-demo'`);
    const sm = await ctx.db.query<{ id: string }>(
      `insert into memberships (user_id, org_id, role) values ($1,$2,'admin') on conflict (user_id, org_id) do update set role = 'admin' returning id`,
      [sup.rows[0].id, nw.rows[0].id],
    );
    const superRow = (await owner.get("/orgs/northwind-demo/members")).json.members.find((m: any) => m.id === sm.rows[0].id);
    expect(superRow.is_super_admin).toBe(true);

    // The owner can suspend, reactivate and change the role of someone they added.
    expect((await owner.patch(`/orgs/northwind-demo/members/${memberRow.id}`, { status: "suspended" })).status).toBe(200);
    expect((await owner.patch(`/orgs/northwind-demo/members/${memberRow.id}`, { status: "active" })).status).toBe(200);
    expect((await owner.patch(`/orgs/northwind-demo/members/${memberRow.id}`, { role: "admin" })).status).toBe(200);
    expect((await owner.patch(`/orgs/northwind-demo/members/${memberRow.id}`, { role: "member" })).status).toBe(200);

    // Nobody — not even a super admin — can suspend, remove or demote an owner here.
    for (const body of [{ status: "suspended" }, { status: "removed" }, { role: "member" }])
      expect((await sa.patch(`/orgs/northwind-demo/members/${ownerRow.id}`, body)).status).toBe(403);
    // A super admin in the workspace can't be suspended or removed by the owner.
    for (const body of [{ status: "suspended" }, { status: "removed" }, { role: "member" }])
      expect((await owner.patch(`/orgs/northwind-demo/members/${superRow.id}`, body)).status).toBe(403);

    // Only super admins can create owners (by role change or invitation).
    expect((await owner.patch(`/orgs/northwind-demo/members/${memberRow.id}`, { role: "owner" })).status).toBe(403);
    expect((await owner.post("/orgs/northwind-demo/invitations", { email: "new-owner@northwind.example", role: "owner" })).status).toBe(403);
    expect((await owner.post("/orgs/northwind-demo/invitations", { email: "new-admin@northwind.example", role: "admin" })).status).toBe(201);

    await ctx.db.query(`delete from memberships where id = $1`, [sm.rows[0].id]);
  });
});

describe("workspace lifecycle (Culturosity super admins only)", () => {
  it("only a super admin can pause, resume and delete a client workspace", async () => {
    const owner = client(app, "10.9.0.1");
    await owner.signIn("admin@harbour.example"); // the company's owner
    const member = client(app, "10.9.0.2");
    await member.signIn("member@harbour.example");
    const sa = client(app, "10.9.0.3");
    await sa.signIn("super@demo.culturosity.test");
    expect((await member.get("/orgs/harbour-demo")).status).toBe(200);

    // Company owners and members cannot pause or delete (the actions are hidden from them).
    for (const who of [owner, member]) {
      expect((await who.post("/orgs/harbour-demo/pause", { paused: true })).status).toBe(404);
      expect((await who.post("/orgs/harbour-demo/delete", { confirmName: "Harbour Demo Union", password: PASSWORD })).status).toBe(404);
    }

    // Pause: everyone in the workspace, the owner included, is locked out; the super admin is not.
    expect((await sa.post("/orgs/harbour-demo/pause", { paused: true })).json.status).toBe("suspended");
    expect((await member.get("/orgs/harbour-demo")).status).toBe(423);
    expect((await owner.get("/orgs/harbour-demo")).status).toBe(423);
    expect((await owner.get("/orgs/harbour-demo/dashboard")).status).toBe(423);
    expect((await member.get("/me")).json.programs.some((p: any) => p.org_slug === "harbour-demo")).toBe(false);
    expect((await owner.get("/me")).json.memberships.some((m: any) => m.org_slug === "harbour-demo")).toBe(false);
    expect((await sa.get("/orgs/harbour-demo")).json.org.status).toBe("suspended");
    expect((await sa.get("/internal/orgs")).json.orgs.find((o: any) => o.slug === "harbour-demo").status).toBe("suspended");

    // Resume: access is back.
    await sa.post("/orgs/harbour-demo/pause", { paused: false });
    expect((await member.get("/orgs/harbour-demo")).status).toBe(200);
    expect((await owner.get("/orgs/harbour-demo")).status).toBe(200);

    // Delete needs the exact name and the super admin's own password.
    expect((await sa.post("/orgs/harbour-demo/delete", { confirmName: "harbour", password: PASSWORD })).status).toBe(400);
    const wrongPw = await sa.post("/orgs/harbour-demo/delete", { confirmName: "Harbour Demo Union", password: "wrong-password" });
    expect(wrongPw.status).toBe(400);
    expect(wrongPw.json.error.fields.password).toBeTruthy();
    expect((await sa.post("/orgs/harbour-demo/delete", { confirmName: "Harbour Demo Union", password: PASSWORD })).status).toBe(200);

    expect((await ctx.db.query(`select 1 from organizations where slug = 'harbour-demo'`)).rows).toHaveLength(0);
    expect((await ctx.db.query(`select 1 from app_users where email = 'member@harbour.example'`)).rows).toHaveLength(1); // accounts are kept
    expect((await member.get("/orgs/harbour-demo")).status).toBe(404);
    expect((await owner.get("/me")).json.memberships.some((m: any) => m.org_slug === "harbour-demo")).toBe(false);

    // The Culturosity workspace itself can never be paused or deleted.
    expect((await sa.post("/orgs/culturosity/pause", { paused: true })).status).toBe(403);
  });
});

describe("sales team sign-up links", () => {
  it("a super admin's private link creates a salesperson with research & sales access only", async () => {
    const sa = client(app, "10.10.0.1");
    await sa.signIn("super@demo.culturosity.test");
    await sa.post("/internal/gate/unlock", { code: TEST_GATE_CODE });
    const created = await sa.post("/internal/team/invitations", { email: "Riley.Sales@Example.com" });
    expect(created.status).toBe(201);
    const token = created.json.link.split("/auth/sales/")[1];
    expect(token).toBeTruthy();
    // Only the hash is stored.
    expect((await ctx.db.query(`select 1 from staff_invitations where token_hash = $1`, [token])).rows).toHaveLength(0);

    const rep = client(app, "10.10.0.2");
    const info = await rep.get(`/staff-invitations/${token}`);
    expect(info.json.invitation).toMatchObject({ email: "riley.sales@example.com", expired: false, accepted: false, hasAccount: false });
    expect((await rep.post(`/staff-invitations/${token}/accept`, { displayName: "Riley Sales", password: "short" })).status).toBe(422);
    const joined = await rep.post(`/staff-invitations/${token}/accept`, { displayName: "Riley Sales", password: "a-long-sales-password-1" });
    expect(joined.status).toBe(200);
    expect(joined.json.redirect).toBe("/culturosity/admin");
    const me = (await rep.get("/me")).json;
    expect(me.grants).toEqual(["sales_admin"]);
    expect(me.user.email_verified_at).toBeTruthy();
    // The link works once.
    expect((await client(app, "10.10.0.3").post(`/staff-invitations/${token}/accept`, { displayName: "X", password: "another-long-password-2" })).status).toBe(400);

    // Research & sales work, after the access code.
    expect((await rep.get("/internal/research")).status).toBe(423);
    await rep.post("/internal/gate/unlock", { code: TEST_GATE_CODE });
    expect((await rep.get("/internal/research")).status).toBe(200);
    expect((await rep.get("/internal/pipeline")).status).toBe(200);

    // No owner-only rights: settings, access, team, workspaces, catalogue, demo reset, creating workspaces.
    expect((await rep.post("/internal/gate/rotate", { currentCode: TEST_GATE_CODE, newCode: "9876543210" })).status).toBe(404);
    expect((await rep.get("/internal/team")).status).toBe(404);
    expect((await rep.post("/internal/team/invitations", { email: "friend@example.com" })).status).toBe(404);
    expect((await rep.get("/internal/orgs")).status).toBe(404);
    expect((await rep.post("/internal/demo/reset")).status).toBe(404);
    expect((await rep.get("/orgs/northwind-demo/members")).status).toBe(404);
    expect((await rep.get("/orgs/culturosity/members")).status).toBe(404);
    expect((await rep.patch("/orgs/northwind-demo", { welcomeCopy: "changed" })).status).toBe(404);
    expect((await rep.post("/orgs/northwind-demo/pause", { paused: true })).status).toBe(404);
    expect((await rep.post("/orgs", { name: "Rep Co", contactName: "Riley", contactEmail: "riley.sales@example.com", deliveryPreference: "self_service" })).status).toBe(403);

    // The super admin sees them on the team and can remove them; access ends immediately.
    const team = (await sa.get("/internal/team")).json.team;
    const riley = team.find((t: any) => t.email === "riley.sales@example.com");
    expect(riley.grant_name).toBe("sales_admin");
    const superRow = team.find((t: any) => t.grant_name === "super_admin");
    expect((await sa.post(`/internal/team/${superRow.id}/remove`)).status).toBe(400); // super admins can't be removed here
    expect((await sa.post(`/internal/team/${riley.id}/remove`)).status).toBe(200);
    expect((await rep.get("/internal/research")).status).toBe(404);
  });
});

describe("removing an extra super admin account", () => {
  it("lets a super admin delete another super admin's account, with safeguards", async () => {
    await ctx.db.query(`delete from rate_limits`); // many sign-ins earlier in this file
    const sa = client(app, "10.11.0.1");
    await sa.signIn("super@demo.culturosity.test");
    await sa.post("/internal/gate/unlock", { code: TEST_GATE_CODE });
    const { passwordAuth } = await import("../server/lib/auth");
    const mk = async (email: string) => {
      const id = await ctx.db.tx((q) => passwordAuth.createPasswordUser(q, { email, password: "a-long-admin-password-1", displayName: "Old Admin", verified: true }));
      await ctx.db.query(`insert into platform_grants (user_id, grant_name) values ($1,'super_admin')`, [id]);
      return id;
    };
    const oldId = await mk("old-admin@example.com");
    // Make it an owner of the Culturosity workspace (shared with the current super admin) and sole owner of a test workspace.
    const cul = (await ctx.db.query<{ id: string }>(`select id from organizations where slug = 'culturosity'`)).rows[0].id;
    await ctx.db.query(`insert into memberships (user_id, org_id, role) values ($1,$2,'owner')`, [oldId, cul]);
    const solo = (await ctx.db.query<{ id: string }>(`insert into organizations (slug, name, kind) values ('old-admin-test','Old Admin Test Co','client') returning id`)).rows[0].id;
    await ctx.db.query(`insert into memberships (user_id, org_id, role) values ($1,$2,'owner')`, [oldId, solo]);

    const me = (await sa.get("/me")).json.user.id;
    expect((await sa.post(`/internal/team/${me}/delete-account`, { password: PASSWORD })).status).toBe(400); // not yourself
    expect((await sa.post(`/internal/team/${oldId}/delete-account`, { password: "wrong-password" })).status).toBe(400);
    const blocked = await sa.post(`/internal/team/${oldId}/delete-account`, { password: PASSWORD });
    expect(blocked.status).toBe(409); // only owner of a workspace
    expect(blocked.json.error.message).toContain("Old Admin Test Co");
    await ctx.db.query(`delete from organizations where id = $1`, [solo]);

    const sales = client(app, "10.11.0.2");
    await sales.signIn("sales@demo.culturosity.test");
    expect((await sales.post(`/internal/team/${oldId}/delete-account`, { password: PASSWORD })).status).toBe(404);

    expect((await sa.post(`/internal/team/${oldId}/delete-account`, { password: PASSWORD })).status).toBe(200);
    expect((await ctx.db.query(`select 1 from app_users where id = $1`, [oldId])).rows).toHaveLength(0);
    expect((await ctx.db.query(`select 1 from platform_grants where user_id = $1`, [oldId])).rows).toHaveLength(0);
    // The Culturosity workspace still has its other owner.
    expect((await ctx.db.query(`select 1 from memberships where org_id = $1 and role = 'owner' and status = 'active'`, [cul])).rows.length).toBeGreaterThan(0);
  });
});

describe("live research search (no real API calls)", () => {
  it("reports when it isn't connected, and adds or dismisses suggestions safely", async () => {
    await ctx.db.query(`delete from rate_limits`);
    const sa = client(app, "10.12.0.1");
    await sa.signIn("super@demo.culturosity.test");
    await sa.post("/internal/gate/unlock", { code: TEST_GATE_CODE });
    const live = (await sa.get("/internal/live-research")).json;
    expect(live).toMatchObject({ configured: false, limitCents: 2500, spentCents: 0 });
    expect((await sa.post("/internal/live-research", { query: "teachers associations in Manitoba", depth: "quick" })).status).toBe(503);

    // Owner-only monthly limit.
    // A fresh salesperson (the demo one is locked out by the wrong-code test above).
    const { passwordAuth } = await import("../server/lib/auth");
    const repId = await ctx.db.tx((q) => passwordAuth.createPasswordUser(q, { email: "rep.live@example.com", password: "a-long-rep-password-1", displayName: "Rep", verified: true }));
    await ctx.db.query(`insert into platform_grants (user_id, grant_name) values ($1,'sales_admin')`, [repId]);
    const sales = client(app, "10.12.0.2");
    await sales.signIn("rep.live@example.com", "a-long-rep-password-1");
    await sales.post("/internal/gate/unlock", { code: TEST_GATE_CODE });
    expect((await sales.get("/internal/live-research")).status).toBe(200); // salespeople can use it
    expect((await sales.put("/internal/settings/research-limit", { monthlyLimitDollars: 100 })).status).toBe(404);
    expect((await sa.put("/internal/settings/research-limit", { monthlyLimitDollars: 40 })).status).toBe(200);
    expect((await sa.get("/internal/live-research")).json.limitCents).toBe(4000);

    // A finished search with two suggestions (as the background job would store them).
    const s = await ctx.db.query<{ id: string }>(
      `insert into research_searches (query, depth, status, run_token_hash, cost_cents, web_searches) values ('test','quick','done','x', 12, 3) returning id`,
    );
    const mk = async (org: string, url: string) =>
      (
        await ctx.db.query<{ id: string }>(
          `insert into research_suggestions (search_id, organization, program_name, summary, official_url, country, region, prospect_type, sector, citations)
           values ($1,$2,'Member Perks','Discounts for members.',$3,'{CA}','MB','association','Education',$4::jsonb) returning id`,
          [s.rows[0].id, org, url, JSON.stringify([{ url: url + "/perks", title: "Perks", establishes: "Has a member perks page" }])],
        )
      ).rows[0].id;
    const a = await mk("Prairie Example Teachers", "https://prairie-teachers.example");
    const b = await mk("Second Example Union", "https://second-union.example");

    const view = (await sales.get(`/internal/live-research/${s.rows[0].id}`)).json;
    expect(view.suggestions).toHaveLength(2);
    expect(view.search.run_token_hash).toBeUndefined(); // the job token never leaves the server

    const added = await sales.post(`/internal/live-research/suggestions/${a}/add`);
    expect(added.status).toBe(201);
    const rec = (await sales.get(`/internal/research/${added.json.id}`)).json;
    expect(rec.record).toMatchObject({ display_name: "Prairie Example Teachers", verification_status: "needs_review", primary_domain: "prairie-teachers.example" });
    expect(rec.sources[0].review_level).toBe("web_search");
    expect((await sales.post(`/internal/live-research/suggestions/${a}/add`)).status).toBe(400); // already handled

    expect((await sales.post(`/internal/live-research/suggestions/${b}/dismiss`)).status).toBe(200);

    // A suggestion with finished in-depth research: Add carries the sourced details over.
    const c = await mk("Third Example Guild", "https://third-guild.example");
    await ctx.db.query(
      `update research_suggestions set dive_status = 'done', dive_cost_cents = 80, details = $2::jsonb where id = $1`,
      [c, JSON.stringify({
        program_name: "Guild Perks", program_summary: "Travel and dining discounts.", eligibility: "Guild members", coverage: "Manitoba",
        perk_categories: ["Travel", "Dining"], member_cost: "Free", operator: "PerkCo", audience_size: "3,000 members (2026)",
        contact_url: "https://third-guild.example/contact", public_email: "info@third-guild.example", public_phone: "", notes: "",
        citations: [{ url: "https://third-guild.example/benefits", title: "Benefits", establishes: "Lists the perks" }],
      })],
    );
    const addedC = await sales.post(`/internal/live-research/suggestions/${c}/add`);
    expect(addedC.status).toBe(201);
    const recC = (await sales.get(`/internal/research/${addedC.json.id}`)).json;
    expect(recC.programs[0]).toMatchObject({ name: "Guild Perks", coverage: "Manitoba", eligibility: "Guild members", public_email: "info@third-guild.example" });
    expect(recC.programs[0].perk_categories).toEqual(["Travel", "Dining"]);
    expect(recC.record.internal_notes).toContain("Operated by: PerkCo");
    expect(recC.sources.map((x: any) => x.url).sort()).toEqual(["https://third-guild.example/benefits", "https://third-guild.example/perks"]);

    // Extra-deep assessment: strong fits are listed first, and Add writes the fit into the record.
    const weak = await mk("Weak Example Co", "https://weak-co.example");
    const strong = await mk("Strong Example Union", "https://strong-union.example");
    const assess = (rating: string) => JSON.stringify({
      mobile_app: { status: "not_found", details: "No app on the benefits page", evidence: [{ url: "https://strong-union.example/benefits", establishes: "Benefits page, no app" }] },
      management: { status: "in_house", manager: "", details: "PDF list of discounts", evidence: [{ url: "https://strong-union.example/benefits", establishes: "PDF list" }] },
      fit: { rating, recommended_service: "Launch with Culturosity", reasons: ["No mobile app", "Discounts kept in a PDF"] },
    });
    await ctx.db.query(`update research_suggestions set assessment = $2::jsonb where id = $1`, [weak, assess("weak")]);
    await ctx.db.query(`update research_suggestions set assessment = $2::jsonb where id = $1`, [strong, assess("strong")]);
    const ordered = (await sales.get(`/internal/live-research/${s.rows[0].id}`)).json.suggestions.filter((x: any) => x.assessment).map((x: any) => x.organization);
    expect(ordered).toEqual(["Strong Example Union", "Weak Example Co"]);
    const addedS = await sales.post(`/internal/live-research/suggestions/${strong}/add`);
    const recS = (await sales.get(`/internal/research/${addedS.json.id}`)).json;
    expect(recS.record.fit_assessment).toContain("Culturosity fit (live search assessment): Strong — recommended: Launch with Culturosity");
    expect(recS.record.fit_assessment).toContain("Mobile app: None found");
    expect(recS.record.fit_assessment).toContain("Management: Managed in-house");
    expect(recS.sources.map((x: any) => x.url)).toContain("https://strong-union.example/benefits");

    // The options are accepted (still refused here only because no API key is configured).
    expect((await sales.post("/internal/live-research", { query: "credit unions in Ontario", extraDeep: true, deepDive: true })).status).toBe(503);
    expect((await sales.get(`/internal/live-research`)).json.spentCents).toBe(12);
  });
});
