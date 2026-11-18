import { Hono } from "hono";
import type { AppEnv, Ctx } from "../context";
import { submissionSchema, draftSchema, type SubmissionInput } from "../../shared/schemas";
import { activeMembership, grantsFor, requireOrgRole } from "../lib/authz";
import { requireUser } from "../lib/auth";
import { badRequest, forbidden, fromZod, notFound } from "../lib/errors";
import { audit, rateLimit, sourceHash } from "../lib/security";
import { createPerk } from "../lib/publish";

export const submissionRoutes = new Hono<AppEnv>();

interface Destination {
  orgId: string;
  orgSlug: string;
  orgName: string;
  orgKind: string;
  isDemo: boolean;
  programs: { id: string; name: string; moderation_required: boolean }[];
  mode: "publish" | "publish_assigned" | "review";
  providers: { id: string; name: string }[];
}

async function publicDestination(c: Ctx): Promise<Destination | null> {
  const r = await c.get("deps").db.query<any>(
    `select o.id as org_id, o.slug, o.name, o.kind, o.is_demo, p.id as program_id, p.name as program_name, p.moderation_required
       from organizations o join programs p on p.org_id = o.id and p.is_default and p.status = 'active'
      where o.kind = 'culturosity' and o.status = 'active' limit 1`,
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    orgId: row.org_id,
    orgSlug: row.slug,
    orgName: row.name,
    orgKind: row.kind,
    isDemo: row.is_demo,
    programs: [{ id: row.program_id, name: row.program_name, moderation_required: true }],
    mode: "review",
    providers: [],
  };
}

export async function destinationsFor(c: Ctx): Promise<Destination[]> {
  const user = c.get("user");
  const { db } = c.get("deps");
  const out: Destination[] = [];
  if (user) {
    const grants = await grantsFor(db, user.id);
    const orgs = await db.query<any>(
      `select o.id, o.slug, o.name, o.kind, o.is_demo, m.role
         from memberships m join organizations o on o.id = m.org_id and o.status = 'active'
        where m.user_id = $1 and m.status = 'active'
        order by (o.kind = 'culturosity') desc, o.name`,
      [user.id],
    );
    for (const o of orgs.rows) {
      const programs = await db.query<any>(`select id, name, moderation_required from programs where org_id = $1 and status = 'active' order by is_default desc, name`, [o.id]);
      const assigned = await db.query<any>(
        `select p.id, p.name from provider_assignments pa join providers p on p.id = pa.provider_id
          where pa.user_id = $1 and pa.org_id = $2 and pa.revoked_at is null and p.status = 'active' order by p.name`,
        [user.id, o.id],
      );
      const isAdmin = o.role === "owner" || o.role === "admin" || (o.kind === "culturosity" && grants.has("super_admin"));
      const mode: Destination["mode"] = isAdmin ? "publish" : assigned.rows.length ? "publish_assigned" : "review";
      let providers = assigned.rows;
      if (isAdmin) providers = (await db.query<any>(`select id, name from providers where org_id = $1 and status = 'active' order by name`, [o.id])).rows;
      out.push({ orgId: o.id, orgSlug: o.slug, orgName: o.name, orgKind: o.kind, isDemo: o.is_demo, programs: programs.rows, mode, providers });
    }
  }
  const pub = await publicDestination(c);
  if (pub && !out.some((d) => d.orgId === pub.orgId)) out.push(pub);
  return out;
}

submissionRoutes.get("/submit/destinations", async (c) => {
  c.header("Cache-Control", "private, no-store");
  return c.json({ destinations: await destinationsFor(c) });
});

submissionRoutes.post("/submissions", async (c) => {
  const { db } = c.get("deps");
  const user = c.get("user");
  const raw = await c.req.json().catch(() => null);
  const parsed = submissionSchema.safeParse(raw);
  if (!parsed.success) throw fromZod(parsed.error);
  const input: SubmissionInput = parsed.data;

  if (!user) await rateLimit(db, `submit:anon:${sourceHash(c)}`, 5, 3600);
  else await rateLimit(db, `submit:${user.id}`, 60, 3600);

  const dests = await destinationsFor(c);
  const dest = dests.find((d) => d.orgId === input.destination.orgId);
  if (!dest) throw forbidden("You cannot submit to that program.");
  const program = dest.programs.find((p) => p.id === input.destination.programId);
  if (!program) throw forbidden("You cannot submit to that program.");
  if (!user && (input.perk.media.imageAssetId || input.perk.provider.logoAssetId || input.perk.media.additional.length))
    throw badRequest("Sign in to upload images. Public submissions use the Culturosity branded image until reviewed.");

  let mode = dest.mode;
  if (mode === "publish_assigned" && program.moderation_required) mode = "review";
  if (mode === "publish_assigned" && !input.perk.provider.existingId)
    throw badRequest("Choose one of your assigned providers.", { "provider.existingId": "Choose an assigned provider" });

  const result = await db.tx(async (q) => {
    const ins = await q.query<{ id: string }>(
      `insert into perk_submissions (idempotency_key, submitter_user_id, submitter_name, submitter_email, submitter_org_text,
         destination_org_id, destination_program_id, payload, authority_confirmed, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,true,$9)
       on conflict (idempotency_key) do nothing returning id`,
      [
        input.idempotencyKey,
        user?.id ?? null,
        input.submitter.name,
        input.submitter.email,
        input.submitter.organization,
        dest.orgId,
        program.id,
        JSON.stringify(input.perk),
        mode === "review" ? "pending_review" : "published",
      ],
    );
    if (!ins.rows[0]) {
      // Retry / double click: return the original outcome; never create a second offer.
      const prev = await q.query<any>(
        `select s.id, s.status, s.perk_id, s.submitter_user_id, s.submitter_email, s.destination_program_id, p.status as perk_status
           from perk_submissions s left join perks p on p.id = s.perk_id where s.idempotency_key = $1`,
        [input.idempotencyKey],
      );
      const p = prev.rows[0];
      if (!p || (p.submitter_user_id ?? null) !== (user?.id ?? null)) throw badRequest("Duplicate submission key.");
      return { duplicate: true, submissionId: p.id, status: p.perk_id ? p.perk_status : p.status, perkId: p.perk_id, programId: p.destination_program_id };
    }
    const submissionId = ins.rows[0].id;
    if (mode === "review") {
      await audit(q, { actor: user?.id ?? null, orgId: dest.orgId, action: "submission.queued", targetType: "perk_submission", targetId: submissionId });
      return { duplicate: false, submissionId, status: "pending_review", perkId: null, programId: program.id };
    }
    const allowed = mode === "publish_assigned" ? dest.providers.map((p) => p.id) : null;
    const created = await createPerk(q, {
      orgId: dest.orgId,
      programId: program.id,
      input: input.perk,
      actorId: user!.id,
      isDemo: dest.isDemo,
      intent: "publish",
      allowedProviderIds: allowed,
    });
    await q.query(`update perk_submissions set perk_id = $2, updated_at = now() where id = $1`, [submissionId, created.perkId]);
    await audit(q, { actor: user!.id, orgId: dest.orgId, action: "perk.published", targetType: "perk", targetId: created.perkId, meta: { status: created.status, programId: program.id } });
    return { duplicate: false, submissionId, status: created.status, perkId: created.perkId, programId: program.id };
  });

  return c.json({ ...result, orgSlug: dest.orgSlug, orgKind: dest.orgKind, moderated: mode === "review" }, result.duplicate ? 200 : 201);
});

// ---- Server-side drafts for signed-in submitters ----
submissionRoutes.get("/submissions/drafts", async (c) => {
  const user = requireUser(c);
  const r = await c.get("deps").db.query(
    `select s.id, s.idempotency_key, s.destination_org_id, s.destination_program_id, s.payload, s.updated_at, o.name as org_name
       from perk_submissions s join organizations o on o.id = s.destination_org_id
      where s.submitter_user_id = $1 and s.status = 'draft' order by s.updated_at desc limit 20`,
    [user.id],
  );
  return c.json({ drafts: r.rows });
});

submissionRoutes.put("/submissions/drafts", async (c) => {
  const user = requireUser(c);
  const { db } = c.get("deps");
  const parsed = draftSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw fromZod(parsed.error);
  const d = parsed.data;
  const dests = await destinationsFor(c);
  const dest = dests.find((x) => x.orgId === d.destination.orgId);
  if (!dest || !dest.programs.some((p) => p.id === d.destination.programId)) throw forbidden("You cannot save drafts for that program.");
  const key = `draft:${user.id}:${d.idempotencyKey}`;
  const r = await db.query<{ id: string; status: string }>(
    `insert into perk_submissions (idempotency_key, submitter_user_id, submitter_name, submitter_email, destination_org_id, destination_program_id, payload, status)
     values ($1,$2,$3,$4,$5,$6,$7::jsonb,'draft')
     on conflict (idempotency_key) do update set payload = excluded.payload, destination_org_id = excluded.destination_org_id,
        destination_program_id = excluded.destination_program_id, updated_at = now()
     where perk_submissions.status = 'draft' and perk_submissions.submitter_user_id = $2
     returning id, status`,
    [key, user.id, user.display_name || user.email, user.email, dest.orgId, d.destination.programId, JSON.stringify(d.draft)],
  );
  if (!r.rows[0]) throw badRequest("This draft was already submitted.");
  return c.json({ ok: true, draftId: r.rows[0].id, savedAt: new Date().toISOString() });
});

submissionRoutes.delete("/submissions/drafts/:id", async (c) => {
  const user = requireUser(c);
  await c.get("deps").db.query(`delete from perk_submissions where id = $1 and submitter_user_id = $2 and status = 'draft'`, [c.req.param("id"), user.id]);
  return c.json({ ok: true });
});

// ---- Review queue (org owner/admin) ----
submissionRoutes.get("/orgs/:slug/submissions", async (c) => {
  const { org } = await requireOrgRole(c, c.req.param("slug"), ["owner", "admin"]);
  const status = c.req.query("status") || "pending_review";
  const r = await c.get("deps").db.query(
    `select s.id, s.status, s.submitter_name, s.submitter_email, s.submitter_org_text, s.payload, s.created_at, s.perk_id,
            p.name as program_name,
            (select json_agg(json_build_object('decision', r.decision, 'notes', r.notes, 'created_at', r.created_at) order by r.created_at)
               from submission_reviews r where r.submission_id = s.id) as reviews
       from perk_submissions s join programs p on p.id = s.destination_program_id
      where s.destination_org_id = $1 and s.status = $2 order by s.created_at desc limit 100`,
    [org.id, status],
  );
  return c.json({ submissions: r.rows });
});

submissionRoutes.post("/orgs/:slug/submissions/:id/:decision", async (c) => {
  const decision = c.req.param("decision");
  if (decision !== "approve" && decision !== "reject") throw notFound();
  const { org, user } = await requireOrgRole(c, c.req.param("slug"), ["owner", "admin"]);
  const { notes = "" } = (await c.req.json().catch(() => ({}))) as { notes?: string };
  const { db } = c.get("deps");
  const out = await db.tx(async (q) => {
    const r = await q.query<any>(
      `select * from perk_submissions where id = $1 and destination_org_id = $2 and status = 'pending_review' for update`,
      [c.req.param("id"), org.id],
    );
    const s = r.rows[0];
    if (!s) throw notFound("Submission not found or already reviewed.");
    await q.query(`insert into submission_reviews (submission_id, reviewer_id, decision, notes) values ($1,$2,$3,$4)`, [
      s.id,
      user.id,
      decision === "approve" ? "approved" : "rejected",
      String(notes).slice(0, 2000),
    ]);
    if (decision === "reject") {
      await q.query(`update perk_submissions set status = 'rejected', updated_at = now() where id = $1`, [s.id]);
      await audit(q, { actor: user.id, orgId: org.id, action: "submission.rejected", targetType: "perk_submission", targetId: s.id });
      return { status: "rejected", perkId: null };
    }
    const { perkInputSchema } = await import("../../shared/schemas");
    const parsed = perkInputSchema.safeParse(s.payload);
    if (!parsed.success) throw fromZod(parsed.error, "This submission no longer passes validation (for example, its end date has passed).");
    const created = await createPerk(q, {
      orgId: org.id,
      programId: s.destination_program_id,
      input: parsed.data,
      actorId: user.id,
      isDemo: org.is_demo,
      intent: "publish",
    });
    await q.query(`update perk_submissions set status = 'published', perk_id = $2, updated_at = now() where id = $1`, [s.id, created.perkId]);
    await audit(q, { actor: user.id, orgId: org.id, action: "submission.approved", targetType: "perk", targetId: created.perkId });
    return { status: created.status, perkId: created.perkId, programId: s.destination_program_id };
  });
  return c.json(out);
});

export { activeMembership };
