import { Hono } from "hono";
import type { AppEnv, Ctx } from "../context";
import type { Queryable } from "../db";
import { signInSchema, signUpSchema, passwordSchema, emailSchema } from "../../shared/schemas";
import { createSession, destroySession, passwordAuth, requireUser } from "../lib/auth";
import { randomToken, sha256 } from "../lib/crypto";
import { AppError, badRequest, forbidden, fromZod, notFound, unauthorized } from "../lib/errors";
import { audit, rateLimit, sourceHash } from "../lib/security";
import { grantsFor, memberPrograms } from "../lib/authz";
import { getSetting } from "../lib/settings";

export const authRoutes = new Hono<AppEnv>();

async function body<T>(c: Ctx, schema: { safeParse: (v: unknown) => any }): Promise<T> {
  const json = await c.req.json().catch(() => ({}));
  const r = schema.safeParse(json);
  if (!r.success) throw fromZod(r.error);
  return r.data as T;
}

async function issueToken(q: Queryable, userId: string, purpose: "verify_email" | "reset_password", hours: number) {
  const token = randomToken(32);
  await q.query(`update verification_tokens set used_at = now() where user_id = $1 and purpose = $2 and used_at is null`, [userId, purpose]);
  await q.query(`insert into verification_tokens (user_id, purpose, token_hash, expires_at) values ($1,$2,$3,$4)`, [
    userId,
    purpose,
    sha256(token),
    new Date(Date.now() + hours * 3600_000),
  ]);
  return token;
}

async function sendVerification(c: Ctx, userId: string, email: string) {
  const { db, email: mailer, config } = c.get("deps");
  const token = await issueToken(db, userId, "verify_email", 48);
  await mailer.send(db, {
    to: email,
    subject: "Verify your Culturosity account",
    text: `Welcome to Culturosity.\n\nConfirm your email address to activate your account:\n${config.baseUrl}/auth/verify?token=${token}\n\nThis link expires in 48 hours. If you did not create an account, ignore this message.`,
  });
}

/** Apply approved domain enrollment rules: verified email at the domain => MEMBER role only. */
export async function applyEnrollmentRules(q: Queryable, userId: string, email: string) {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return;
  const rules = await q.query<{ org_id: string; program_id: string | null }>(
    `select r.org_id, r.program_id from enrollment_rules r join organizations o on o.id = r.org_id and o.status = 'active'
      where r.revoked_at is null and r.email_domain = $1`,
    [domain],
  );
  for (const rule of rules.rows) {
    const m = await q.query<{ id: string }>(
      `insert into memberships (user_id, org_id, role) values ($1,$2,'member')
       on conflict (user_id, org_id) do update set updated_at = now() returning id`,
      [userId, rule.org_id],
    );
    const programId =
      rule.program_id ?? (await q.query<{ id: string }>(`select id from programs where org_id = $1 and is_default`, [rule.org_id])).rows[0]?.id;
    if (programId) await q.query(`insert into program_memberships (program_id, membership_id) values ($1,$2) on conflict do nothing`, [programId, m.rows[0].id]);
  }
}

authRoutes.post("/auth/signup", async (c) => {
  const { db, config } = c.get("deps");
  await rateLimit(db, `signup:${sourceHash(c)}`, 10, 3600);
  const input = await body<{ email: string; password: string; displayName: string }>(c, signUpSchema);
  // Invitation-only: an account can be created only for an open invitation to this email, or a
  // work email whose domain an organization has approved. There is no open public sign-up.
  const inviteToken = String(((await c.req.json().catch(() => ({}))) as { inviteToken?: string }).inviteToken ?? ""); // Hono caches the parsed body
  const invited = inviteToken
    ? await db.query(
        `select 1 from invitations i join organizations o on o.id = i.org_id and o.status = 'active'
          where i.token_hash = $1 and lower(i.email) = lower($2) and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()`,
        [sha256(inviteToken), input.email],
      )
    : { rows: [] };
  const domain = input.email.split("@")[1]?.toLowerCase() ?? "";
  const enrolled = invited.rows.length
    ? { rows: [1] }
    : await db.query(
        `select 1 from enrollment_rules r join organizations o on o.id = r.org_id and o.status = 'active'
          where r.revoked_at is null and r.email_domain = $1 limit 1`,
        [domain],
      );
  if (!invited.rows.length && !enrolled.rows.length)
    throw new AppError(
      403,
      "invitation_required",
      "Accounts are by invitation only. Open the invitation link from your organization, or ask your program administrator to add you. If your organization lets staff join with their work email, use that email address.",
      { email: "Use the email address your invitation was sent to, or your work email" },
    );
  const exists = await db.query(`select 1 from app_users where lower(email) = lower($1)`, [input.email]);
  if (exists.rows.length) {
    // Do not reveal account existence; behave as if a verification email was sent.
    return c.json({ ok: true, message: "Check your email to verify your account." });
  }
  const userId = await db.tx((q) => passwordAuth.createPasswordUser(q, input));
  await sendVerification(c, userId, input.email);
  await createSession(c, userId);
  return c.json({ ok: true, message: "Check your email to verify your account.", devMailbox: config.mode === "demo" });
});

authRoutes.post("/auth/verify", async (c) => {
  const { db } = c.get("deps");
  const { token } = (await c.req.json().catch(() => ({}))) as { token?: string };
  if (!token) throw badRequest("Missing verification token.");
  const r = await db.query<{ id: string; user_id: string; email: string }>(
    `update verification_tokens t set used_at = now() from app_users u
      where t.token_hash = $1 and t.purpose = 'verify_email' and t.used_at is null and t.expires_at > now() and u.id = t.user_id
      returning t.id, t.user_id, u.email`,
    [sha256(token)],
  );
  const row = r.rows[0];
  if (!row) throw badRequest("This verification link is invalid or has expired. Request a new one.");
  await db.tx(async (q) => {
    await q.query(`update app_users set email_verified_at = coalesce(email_verified_at, now()), updated_at = now() where id = $1`, [row.user_id]);
    await applyEnrollmentRules(q, row.user_id, row.email);
  });
  return c.json({ ok: true });
});

authRoutes.post("/auth/resend-verification", async (c) => {
  const user = requireUser(c);
  const { db } = c.get("deps");
  await rateLimit(db, `resend:${user.id}`, 5, 3600);
  if (!user.email_verified_at) await sendVerification(c, user.id, user.email);
  return c.json({ ok: true });
});

authRoutes.post("/auth/signin", async (c) => {
  const { db } = c.get("deps");
  const input = await body<{ email: string; password: string }>(c, signInSchema);
  await rateLimit(db, `signin:ip:${sourceHash(c)}`, 30, 900);
  await rateLimit(db, `signin:acct:${sha256(input.email)}`, 10, 900);
  const user = await passwordAuth.verifyPassword(db, input.email, input.password);
  if (!user) throw unauthorized("Email or password is incorrect.");
  await createSession(c, user.id);
  return c.json({ ok: true });
});

authRoutes.post("/auth/signout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

authRoutes.post("/auth/forgot", async (c) => {
  const { db, email: mailer, config } = c.get("deps");
  await rateLimit(db, `forgot:${sourceHash(c)}`, 10, 3600);
  const json = await c.req.json().catch(() => ({}));
  const parsed = emailSchema.safeParse(json.email);
  if (!parsed.success) throw fromZod(parsed.error);
  const u = await db.query<{ id: string }>(`select id from app_users where lower(email) = lower($1) and status = 'active'`, [parsed.data]);
  if (u.rows[0]) {
    const token = await issueToken(db, u.rows[0].id, "reset_password", 1);
    await mailer.send(db, {
      to: parsed.data,
      subject: "Reset your Culturosity password",
      text: `Use this link within 1 hour to choose a new password:\n${config.baseUrl}/auth/reset?token=${token}\n\nIf you did not request this, you can ignore this email.`,
    });
  }
  return c.json({ ok: true, message: "If that email has an account, a reset link is on its way." });
});

authRoutes.post("/auth/reset", async (c) => {
  const { db } = c.get("deps");
  const json = (await c.req.json().catch(() => ({}))) as { token?: string; password?: string };
  const pw = passwordSchema.safeParse(json.password);
  if (!pw.success) throw fromZod(pw.error);
  const r = await db.query<{ user_id: string }>(
    `update verification_tokens set used_at = now()
      where token_hash = $1 and purpose = 'reset_password' and used_at is null and expires_at > now() returning user_id`,
    [sha256(json.token || "")],
  );
  const userId = r.rows[0]?.user_id;
  if (!userId) throw badRequest("This reset link is invalid or has expired.");
  await db.tx(async (q) => {
    await passwordAuth.setPassword(q, userId, pw.data);
    await q.query(`update sessions set revoked_at = now() where user_id = $1 and revoked_at is null`, [userId]);
    await q.query(`update app_users set email_verified_at = coalesce(email_verified_at, now()) where id = $1`, [userId]);
  });
  await audit(db, { actor: userId, action: "auth.password_reset" });
  return c.json({ ok: true });
});

// ---- Current user ----
authRoutes.get("/me", async (c) => {
  const user = c.get("user");
  const { db, config } = c.get("deps");
  if (!user) return c.json({ user: null, mode: config.mode });
  const [memberships, programs, grants] = await Promise.all([
    db.query(
      `select m.id, m.role, m.status, o.id as org_id, o.slug as org_slug, o.name as org_name, o.kind as org_kind, o.is_demo,
              o.program_display_name, o.accent_color, o.logo_asset_id, o.status as org_status
         from memberships m join organizations o on o.id = m.org_id and o.status = 'active'
        where m.user_id = $1 and m.status = 'active' order by (o.kind = 'culturosity') desc, o.name`,
      [user.id],
    ),
    memberPrograms(db, user.id),
    grantsFor(db, user.id),
  ]);
  const providerAssignments = await db.query(
    `select pa.provider_id, p.name as provider_name, o.slug as org_slug from provider_assignments pa
       join providers p on p.id = pa.provider_id join organizations o on o.id = pa.org_id
      where pa.user_id = $1 and pa.revoked_at is null`,
    [user.id],
  );
  let unlock = null;
  if (grants.size) {
    const u = await db.query<{ expires_at: string; last_activity_at: string }>(
      `select expires_at, last_activity_at from admin_unlocks where session_id = $1 and revoked_at is null and expires_at > now()
          and last_activity_at > now() - make_interval(mins => $2) order by created_at desc limit 1`,
      [c.get("sessionId"), config.gateIdleMinutes],
    );
    unlock = u.rows[0] ?? null;
  }
  return c.json({
    user,
    mode: config.mode,
    memberships: memberships.rows,
    programs,
    grants: [...grants],
    providerAssignments: providerAssignments.rows,
    unlock,
  });
});

authRoutes.patch("/me", async (c) => {
  const user = requireUser(c);
  const json = (await c.req.json().catch(() => ({}))) as { displayName?: string };
  const name = String(json.displayName ?? "").trim();
  if (name.length < 1 || name.length > 120) throw badRequest("Enter a name.", { displayName: "Enter a name" });
  await c.get("deps").db.query(`update app_users set display_name = $2, updated_at = now() where id = $1`, [user.id, name]);
  return c.json({ ok: true });
});

authRoutes.get("/me/sessions", async (c) => {
  const user = requireUser(c);
  const r = await c.get("deps").db.query(
    `select id, user_agent, created_at, last_seen_at, expires_at from sessions
      where user_id = $1 and revoked_at is null and expires_at > now() order by last_seen_at desc`,
    [user.id],
  );
  return c.json({ sessions: r.rows.map((s: any) => ({ ...s, current: s.id === c.get("sessionId") })) });
});

authRoutes.delete("/me/sessions/:id", async (c) => {
  const user = requireUser(c);
  const { db } = c.get("deps");
  await db.query(`update sessions set revoked_at = now() where id = $1 and user_id = $2`, [c.req.param("id"), user.id]);
  await db.query(`update admin_unlocks set revoked_at = now() where session_id = $1`, [c.req.param("id")]);
  return c.json({ ok: true });
});

authRoutes.get("/me/export", async (c) => {
  const user = requireUser(c);
  const { db } = c.get("deps");
  const [memberships, favourites, redemptions, events] = await Promise.all([
    db.query(`select o.name as organization, m.role, m.status, m.created_at from memberships m join organizations o on o.id = m.org_id where m.user_id = $1`, [user.id]),
    db.query(`select p.title, f.created_at from favourites f join perks p on p.id = f.perk_id where f.user_id = $1`, [user.id]),
    db.query(`select perk_snapshot->>'title' as perk, verified_at from redemptions where user_id = $1`, [user.id]),
    db.query(`select event, created_at from analytics_events where user_id = $1 order by created_at desc limit 1000`, [user.id]),
  ]);
  c.header("Content-Disposition", `attachment; filename="culturosity-my-data.json"`);
  c.header("Cache-Control", "no-store");
  return c.json({
    exportedAt: new Date().toISOString(),
    account: { email: user.email, displayName: user.display_name, emailVerifiedAt: user.email_verified_at },
    memberships: memberships.rows,
    favourites: favourites.rows,
    verifiedRedemptions: redemptions.rows,
    activity: events.rows,
  });
});

authRoutes.post("/me/deactivate", async (c) => {
  const user = requireUser(c);
  const { db } = c.get("deps");
  const owner = await db.query(
    `select o.name from memberships m join organizations o on o.id = m.org_id
      where m.user_id = $1 and m.role = 'owner' and m.status = 'active'
        and (select count(*) from memberships m2 where m2.org_id = m.org_id and m2.role = 'owner' and m2.status = 'active') = 1`,
    [user.id],
  );
  if (owner.rows.length) throw badRequest(`Transfer ownership of ${owner.rows.map((r: any) => r.name).join(", ")} before deactivating.`);
  await db.tx(async (q) => {
    await q.query(`update app_users set status = 'deactivated', updated_at = now() where id = $1`, [user.id]);
    await q.query(`update sessions set revoked_at = now() where user_id = $1 and revoked_at is null`, [user.id]);
    await q.query(`delete from favourites where user_id = $1`, [user.id]);
    await q.query(`update memberships set status = 'removed', updated_at = now() where user_id = $1`, [user.id]);
  });
  await audit(db, { actor: user.id, action: "account.deactivated" });
  await destroySession(c);
  return c.json({ ok: true });
});

// ---- Invitations ----
// ---- Sales team sign-up links ----
async function staffInvite(q: Queryable, token: string, lock = false) {
  const r = await q.query<{ id: string; email: string; expires_at: string; accepted_at: string | null; revoked_at: string | null }>(
    `select id, email, expires_at, accepted_at, revoked_at from staff_invitations where token_hash = $1${lock ? " for update" : ""}`,
    [sha256(token)],
  );
  const inv = r.rows[0];
  if (!inv || inv.revoked_at) throw notFound("This sign-up link is not valid. Ask Culturosity for a new one.");
  return inv;
}

authRoutes.get("/staff-invitations/:token", async (c) => {
  const { db } = c.get("deps");
  const inv = await staffInvite(db, c.req.param("token"));
  const exists = await db.query(`select 1 from app_users where lower(email) = lower($1)`, [inv.email]);
  return c.json({
    invitation: { email: inv.email, expired: new Date(inv.expires_at) < new Date(), accepted: Boolean(inv.accepted_at), hasAccount: exists.rows.length > 0 },
  });
});

/** Create the salesperson's account (or connect an existing one with its password) and grant the sales role. */
authRoutes.post("/staff-invitations/:token/accept", async (c) => {
  const { db } = c.get("deps");
  await rateLimit(db, `staff-accept:${sourceHash(c)}`, 20, 3600);
  const b = (await c.req.json().catch(() => ({}))) as { displayName?: string; password?: string };
  const userId = await db.tx(async (q) => {
    const inv = await staffInvite(q, c.req.param("token"), true);
    if (inv.accepted_at) throw badRequest("This sign-up link was already used. Sign in instead.");
    if (new Date(inv.expires_at) < new Date()) throw badRequest("This sign-up link has expired. Ask Culturosity for a new one.");
    const existing = await q.query<{ id: string }>(`select id from app_users where lower(email) = lower($1)`, [inv.email]);
    let id: string;
    if (existing.rows[0]) {
      const ok = b.password ? await passwordAuth.verifyPassword(q, inv.email, b.password) : null;
      if (!ok) throw badRequest("An account already exists for this email. Enter its password to continue.", { password: "Incorrect password" });
      id = ok.id;
    } else {
      const parsed = signUpSchema.safeParse({ email: inv.email, password: b.password, displayName: b.displayName });
      if (!parsed.success) throw fromZod(parsed.error);
      // The private link was sent to this address, so it counts as verified.
      id = await passwordAuth.createPasswordUser(q, { ...parsed.data, verified: true });
    }
    await q.query(`update app_users set email_verified_at = coalesce(email_verified_at, now()) where id = $1`, [id]);
    const has = await q.query(`select 1 from platform_grants where user_id = $1 and grant_name = 'sales_admin' and revoked_at is null`, [id]);
    if (!has.rows.length) await q.query(`insert into platform_grants (user_id, grant_name, granted_by) values ($1,'sales_admin',(select invited_by from staff_invitations where id = $2))`, [id, inv.id]);
    await q.query(`update staff_invitations set accepted_at = now(), accepted_by = $2 where id = $1`, [inv.id, id]);
    await audit(q, { actor: id, action: "staff.joined", meta: { email: inv.email } });
    return id;
  });
  await createSession(c, userId);
  return c.json({ ok: true, redirect: "/culturosity/admin" });
});

authRoutes.get("/invitations/:token", async (c) => {
  const r = await c.get("deps").db.query(
    `select i.email, i.role, i.expires_at, i.accepted_at, i.revoked_at, o.name as org_name, o.slug as org_slug
       from invitations i join organizations o on o.id = i.org_id where i.token_hash = $1`,
    [sha256(c.req.param("token"))],
  );
  const inv: any = r.rows[0];
  if (!inv || inv.revoked_at) throw notFound("This invitation is not valid.");
  return c.json({
    invitation: { email: inv.email, role: inv.role, orgName: inv.org_name, orgSlug: inv.org_slug, expired: new Date(inv.expires_at) < new Date(), accepted: Boolean(inv.accepted_at) },
  });
});

authRoutes.post("/invitations/:token/accept", async (c) => {
  const user = requireUser(c);
  const { db } = c.get("deps");
  const result = await db.tx(async (q) => {
    const r = await q.query<any>(
      `select * from invitations where token_hash = $1 and revoked_at is null and accepted_at is null and expires_at > now() for update`,
      [sha256(c.req.param("token"))],
    );
    const inv = r.rows[0];
    if (!inv) throw badRequest("This invitation is invalid, already used, or expired.");
    if (inv.email.toLowerCase() !== user.email.toLowerCase())
      throw forbidden(`This invitation was sent to ${inv.email}. Sign in with that email to accept it.`);
    if (!user.email_verified_at) await q.query(`update app_users set email_verified_at = now() where id = $1`, [user.id]); // invite link proves inbox access
    const m = await q.query<{ id: string }>(
      `insert into memberships (user_id, org_id, role) values ($1,$2,$3)
       on conflict (user_id, org_id) do update set role = excluded.role, status = 'active', updated_at = now() returning id`,
      [user.id, inv.org_id, inv.role],
    );
    const programId = inv.program_id ?? (await q.query<{ id: string }>(`select id from programs where org_id = $1 and is_default`, [inv.org_id])).rows[0]?.id;
    if (programId) await q.query(`insert into program_memberships (program_id, membership_id) values ($1,$2) on conflict do nothing`, [programId, m.rows[0].id]);
    await q.query(`update invitations set accepted_at = now() where id = $1`, [inv.id]);
    const org = await q.query<{ slug: string }>(`select slug from organizations where id = $1`, [inv.org_id]);
    await audit(q, { actor: user.id, orgId: inv.org_id, action: "membership.invitation_accepted", targetType: "membership", targetId: m.rows[0].id, meta: { role: inv.role } });
    return { orgSlug: org.rows[0].slug };
  });
  return c.json({ ok: true, ...result });
});

// ---- Public configuration ----
authRoutes.get("/config", async (c) => {
  const { db, config, ai, email, storage, research } = c.get("deps");
  return c.json({
    mode: config.mode,
    contactEmail: (await getSetting<string>(db, "contact_email")) ?? "hello@culturosity.io",
    demoBookingUrl: (await getSetting<string>(db, "demo_booking_url")) ?? null,
    newWindowDays: (await getSetting<number>(db, "new_window_days")) ?? 21,
    integrations: {
      database: db.kind === "pg" ? "postgresql" : "pglite-local-demo",
      storage: storage.driver,
      email: email.configured ? "resend" : "outbox-only",
      ai: ai.configured ? "configured" : "not-configured",
      researchSearch: research.searchConfigured ? "claude-web-search" : "not-configured",
      pos: "server-verified-qr-and-manual-code",
    },
  });
});

// ---- Demo-only helpers ----
authRoutes.post("/demo/session", async (c) => {
  const { db, config } = c.get("deps");
  if (config.mode !== "demo") throw notFound();
  await rateLimit(db, `demo:${sourceHash(c)}`, 60, 3600);
  const { persona } = (await c.req.json().catch(() => ({}))) as { persona?: string };
  const map: Record<string, string> = {
    member: "member@demo.culturosity.test",
    company_admin: "admin@northwind.example",
    provider: "provider@demo.culturosity.test",
  };
  const email = map[persona || ""];
  if (!email) throw badRequest("Unknown demo persona.");
  const u = await db.query<{ id: string }>(`select id from app_users where email = $1 and is_demo and status = 'active'`, [email]);
  if (!u.rows[0]) throw new AppError(503, "demo_missing", "Demo data has not been seeded. Run npm run db:seed:demo.");
  await createSession(c, u.rows[0].id);
  return c.json({ ok: true });
});

authRoutes.get("/dev/mailbox", async (c) => {
  const { db, config } = c.get("deps");
  // Local development only: never exposed on a deployed site, even in demo mode.
  if (config.mode !== "demo" || config.isNetlify || db.kind !== "pglite") throw notFound();
  const r = await db.query(`select id, to_email, subject, body_text, created_at from email_outbox order by created_at desc limit 50`);
  return c.json({ messages: r.rows });
});
