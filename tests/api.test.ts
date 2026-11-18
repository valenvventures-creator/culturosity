import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { setup, client, samplePerk, TEST_GATE_CODE, type App } from "./helpers";

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

describe("content pack: Culturosity perk listings", () => {
  it("adds the 35 listings once, shows them publicly with images, and blocks redemption until details arrive", async () => {
    const { applyContentPacks } = await import("../server/seed/content");
    expect((await applyContentPacks(ctx.db))[0]).toContain("35 Culturosity perks added");
    expect(await applyContentPacks(ctx.db)).toEqual([]); // idempotent
    const pub = (await client(app).get("/public/perks?sort=new")).json.perks.filter((p: any) => !p.is_demo);
    expect(pub).toHaveLength(35);
    expect(pub[0].title).toBe("Ram Motorsports Spectacular - Feb 7, 2027"); // "New" order preserved
    expect(pub.every((p: any) => p.image_url?.startsWith("/perks/culturosity/") && p.details_pending)).toBe(true);
    const labels = new Set(pub.map((p: any) => p.value_label));
    for (const l of ["Save 25%", "Free", "BOGO", "Special offer", "Exclusive", "Save $2", "Save $25", "Save $10"]) expect(labels.has(l)).toBe(true);
    const blufish = pub.filter((p: any) => p.provider_name === "Blufish Japanese Restaurant");
    expect(blufish).toHaveLength(5);
    const providers = await ctx.db.query<{ n: number }>(`select count(*)::int as n from providers where name = 'Blufish Japanese Restaurant'`);
    expect(providers.rows[0].n).toBe(1); // one provider record, several offers

    // A Culturosity member (super admin is in the real program) sees details but cannot redeem yet.
    const sa = client(app, "10.7.0.1");
    await sa.signIn("super@demo.culturosity.test");
    const d = await sa.get(`/perks/${pub[0].id}`);
    expect(d.json.access).toBe("member");
    expect(d.json.perk.details_pending).toBe(true);
    const progId = d.json.perk.program.id;
    expect((await sa.post("/redemption-tokens", { programId: progId, perkId: pub[0].id })).status).toBe(409);
    expect((await sa.post("/events", { event: "use_perk_click", programId: progId, perkId: pub[0].id })).status).toBe(409);
  });
});
