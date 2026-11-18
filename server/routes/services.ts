import { Hono } from "hono";
import type { AppEnv } from "../context";
import type { Queryable } from "../db";
import { serviceRequestSchema } from "../../shared/schemas";
import { fromZod, notFound, badRequest } from "../lib/errors";
import { audit, rateLimit, sourceHash } from "../lib/security";
import { activeMembership, orgBySlug, requireGrant, requireOrgRole } from "../lib/authz";
import { getSetting } from "../lib/settings";

export const serviceRoutes = new Hono<AppEnv>();

const APPROACH_LABELS: Record<string, string> = {
  self_service: "Self-Service",
  launch: "Launch with Culturosity",
  managed: "Fully Managed",
  unsure: "Not sure yet",
};

/**
 * Who hears about new proposal requests: the address(es) set in Access settings, otherwise every
 * active super admin. Kept out of source code on purpose.
 */
export async function serviceNotificationRecipients(db: Queryable): Promise<string[]> {
  const configured = ((await getSetting<string>(db, "service_notification_email")) ?? "")
    .split(/[,;\s]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  if (configured.length) return [...new Set(configured)];
  const r = await db.query<{ email: string }>(
    `select distinct lower(u.email) as email from platform_grants g join app_users u on u.id = g.user_id
      where g.grant_name = 'super_admin' and g.revoked_at is null and u.status = 'active' and not u.is_demo`,
  );
  return r.rows.map((x) => x.email);
}

/** Saved durably first; email notification is best-effort and optional. */
serviceRoutes.post("/service-requests", async (c) => {
  const { db, email } = c.get("deps");
  const user = c.get("user");
  await rateLimit(db, `svc:${user?.id ?? sourceHash(c)}`, user ? 20 : 5, 3600);
  const parsed = serviceRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw fromZod(parsed.error);
  const b = parsed.data;
  if (b.website) return c.json({ ok: true }, 201); // honeypot: silently accept, store nothing
  let orgId: string | null = null;
  let isDemo = false;
  if (b.orgSlug && user) {
    const org = await orgBySlug(db, b.orgSlug);
    const m = org ? await activeMembership(db, user.id, org.id) : null;
    if (org && m && (m.role === "owner" || m.role === "admin")) {
      orgId = org.id;
      isDemo = org.is_demo;
    }
  }
  const r = await db.query<{ id: string }>(
    `insert into service_requests (org_id, organization_name, contact_name, contact_email, approx_member_count, service_needs, approach,
       coverage, target_launch, message, submitted_by, is_demo)
     values ($1,$2,$3,$4,$5,$6::text[],$7,$8,$9,$10,$11,$12) returning id`,
    [orgId, b.organizationName, b.contactName, b.contactEmail, b.approxMemberCount ?? null, b.serviceNeeds, b.approach, b.coverage, b.targetLaunch, b.message, user?.id ?? null, isDemo],
  );
  await audit(db, { actor: user?.id ?? null, orgId, action: "service_request.created", targetType: "service_request", targetId: r.rows[0].id });
  if (!isDemo) {
    const { config } = c.get("deps");
    const approach = APPROACH_LABELS[b.approach] ?? b.approach;
    // 1. Notify Culturosity (the configured address, or the super admins). Replies go to the requester.
    for (const to of await serviceNotificationRecipients(db)) {
      await email
        .send(db, {
          to,
          replyTo: b.contactEmail,
          subject: `New proposal request: ${b.organizationName.slice(0, 120)}`,
          text: [
            "A new Request a Proposal form was submitted on Culturosity.",
            "",
            `Organization: ${b.organizationName}`,
            `Contact: ${b.contactName} <${b.contactEmail}>`,
            `Approximate members: ${b.approxMemberCount ?? "not given"}`,
            `Preferred approach: ${approach}`,
            `Services needed:\n${b.serviceNeeds.map((n) => `  - ${n}`).join("\n")}`,
            `Coverage: ${b.coverage || "not given"}`,
            `Target launch: ${b.targetLaunch || "not given"}`,
            "",
            `Message:\n${b.message || "(none)"}`,
            "",
            `Reply to this email to answer ${b.contactName} directly, or open the Service queue:`,
            `${config.baseUrl}/culturosity/admin/services`,
          ].join("\n"),
        })
        .catch(() => {});
    }
    // 2. Confirm receipt to the requester. Fixed wording only (no submitted text), so the form can't be used to send arbitrary content.
    await email
      .send(db, {
        to: b.contactEmail,
        subject: "We received your request — Culturosity",
        text: [
          "Thank you for your interest in Culturosity.",
          "",
          "We've received your request for a proposal and a member of our team will be in touch soon.",
          "",
          `Services you asked about:\n${b.serviceNeeds.map((n) => `  - ${n}`).join("\n")}`,
          `Preferred approach: ${approach}`,
          "",
          "If you didn't submit this request, you can ignore this email.",
          "",
          "Culturosity — Better perks. Stronger connections.",
        ].join("\n"),
      })
      .catch(() => {});
  }
  return c.json({ ok: true, id: r.rows[0].id }, 201);
});

serviceRoutes.get("/orgs/:slug/service-requests", async (c) => {
  const { org } = await requireOrgRole(c, c.req.param("slug"), ["owner", "admin"]);
  const r = await c.get("deps").db.query(
    `select id, service_needs, approach, status, next_step, created_at, updated_at from service_requests where org_id = $1 order by created_at desc`,
    [org.id],
  );
  return c.json({ requests: r.rows });
});

// Culturosity internal service queue (super admin or sales admin).
serviceRoutes.get("/internal/service-requests", async (c) => {
  await requireGrant(c, ["super_admin", "sales_admin"]);
  const status = c.req.query("status");
  const r = await c.get("deps").db.query(
    `select s.*, u.email as owner_email, o.slug as org_slug from service_requests s
       left join app_users u on u.id = s.owner_user_id left join organizations o on o.id = s.org_id
      where ($1::text is null or s.status = $1) order by s.created_at desc limit 200`,
    [status || null],
  );
  return c.json({ requests: r.rows });
});

serviceRoutes.patch("/internal/service-requests/:id", async (c) => {
  const { user } = await requireGrant(c, ["super_admin", "sales_admin"]);
  const b = (await c.req.json().catch(() => ({}))) as any;
  const statuses = ["new", "contacted", "scoping", "proposal_sent", "won", "closed"];
  if (b.status && !statuses.includes(b.status)) throw badRequest("Invalid status.");
  const { db } = c.get("deps");
  let ownerId: string | null | undefined = undefined;
  if (b.ownerEmail !== undefined) {
    if (!b.ownerEmail) ownerId = null;
    else {
      const o = await db.query<{ user_id: string }>(
        `select g.user_id from platform_grants g join app_users u on u.id = g.user_id where lower(u.email) = lower($1) and g.revoked_at is null limit 1`,
        [b.ownerEmail],
      );
      if (!o.rows[0]) throw badRequest("Owner must be a Culturosity admin.");
      ownerId = o.rows[0].user_id;
    }
  }
  const r = await db.query(
    `update service_requests set status = coalesce($2, status), notes = coalesce($3, notes), next_step = coalesce($4, next_step),
            owner_user_id = case when $5::boolean then $6::uuid else owner_user_id end, updated_at = now()
      where id = $1 returning id`,
    [c.req.param("id"), b.status ?? null, b.notes ?? null, b.nextStep ?? null, ownerId !== undefined, ownerId ?? null],
  );
  if (!r.rows.length) throw notFound();
  await audit(db, { actor: user.id, action: "service_request.updated", targetType: "service_request", targetId: c.req.param("id"), meta: { status: b.status } });
  return c.json({ ok: true });
});
