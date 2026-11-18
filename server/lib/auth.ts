// AuthAdapter: password identities + DB-backed revocable sessions.
// Business tables reference app_users.id; provider identities live in auth_identities,
// so a later move to Supabase Auth maps new provider IDs without rewriting foreign keys.
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Next } from "hono";
import type { Ctx, SessionUser } from "../context";
import type { Queryable } from "../db";
import { hashSecret, randomToken, sha256, verifySecret } from "./crypto";
import { AppError, forbidden, unauthorized } from "./errors";

const SESSION_DAYS = 30;

export function cookieName(c: Ctx) {
  return c.get("deps").config.secureCookies ? "__Host-cul_session" : "cul_session";
}

export interface AuthAdapter {
  createPasswordUser(q: Queryable, input: { email: string; password: string; displayName: string; isDemo?: boolean; verified?: boolean }): Promise<string>;
  verifyPassword(q: Queryable, email: string, password: string): Promise<SessionUser | null>;
  setPassword(q: Queryable, userId: string, password: string): Promise<void>;
}

export const passwordAuth: AuthAdapter = {
  async createPasswordUser(q, input) {
    const email = input.email.trim().toLowerCase();
    const u = await q.query<{ id: string }>(
      `insert into app_users (email, display_name, is_demo, email_verified_at) values ($1,$2,$3,$4) returning id`,
      [email, input.displayName, input.isDemo ?? false, input.verified ? new Date() : null],
    );
    const id = u.rows[0].id;
    await q.query(`insert into auth_identities (user_id, provider, provider_user_id, password_hash) values ($1,'password',$2,$3)`, [
      id,
      email,
      await hashSecret(input.password),
    ]);
    return id;
  },
  async verifyPassword(q, email, password) {
    const r = await q.query<SessionUser & { password_hash: string; status: string }>(
      `select u.id, u.email, u.display_name, u.email_verified_at, u.is_demo, u.status, i.password_hash
         from app_users u join auth_identities i on i.user_id = u.id and i.provider = 'password'
        where lower(u.email) = lower($1)`,
      [email],
    );
    const row = r.rows[0];
    const ok = await verifySecret(password, row?.password_hash);
    if (!row || !ok || row.status !== "active") return null;
    const { password_hash: _ph, status: _s, ...user } = row;
    return user;
  },
  async setPassword(q, userId, password) {
    await q.query(`update auth_identities set password_hash = $2 where user_id = $1 and provider = 'password'`, [userId, await hashSecret(password)]);
  },
};

export async function createSession(c: Ctx, userId: string): Promise<string> {
  const { db } = c.get("deps");
  const token = randomToken(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  const r = await db.query<{ id: string }>(
    `insert into sessions (user_id, token_hash, user_agent, expires_at) values ($1,$2,$3,$4) returning id`,
    [userId, sha256(token), (c.req.header("user-agent") || "").slice(0, 300), expires],
  );
  setCookie(c, cookieName(c), token, {
    httpOnly: true,
    secure: c.get("deps").config.secureCookies,
    sameSite: "Lax",
    path: "/",
    expires,
  });
  return r.rows[0].id;
}

export async function destroySession(c: Ctx) {
  const sid = c.get("sessionId");
  if (sid) {
    const { db } = c.get("deps");
    await db.query(`update sessions set revoked_at = now() where id = $1`, [sid]);
    await db.query(`update admin_unlocks set revoked_at = now() where session_id = $1 and revoked_at is null`, [sid]);
  }
  deleteCookie(c, cookieName(c), { path: "/", secure: c.get("deps").config.secureCookies });
}

/** Loads the session (if any) and enforces a custom-header + origin check on mutations (CSRF). */
export async function sessionMiddleware(c: Ctx, next: Next) {
  c.set("user", null);
  c.set("sessionId", null);
  const method = c.req.method;
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    if (c.req.header("x-culturosity-csrf") !== "1") throw new AppError(403, "csrf", "Request blocked: missing CSRF header.");
    const origin = c.req.header("origin");
    if (origin) {
      const host = c.req.header("x-forwarded-host") || c.req.header("host");
      const allowed = new URL(c.get("deps").config.baseUrl).host;
      const oh = new URL(origin).host;
      if (oh !== host && oh !== allowed) throw new AppError(403, "csrf", "Request blocked: cross-origin.");
    }
  }
  const token = getCookie(c, cookieName(c));
  if (token) {
    const { db } = c.get("deps");
    const r = await db.query<SessionUser & { session_id: string; last_seen_at: string }>(
      `select s.id as session_id, s.last_seen_at, u.id, u.email, u.display_name, u.email_verified_at, u.is_demo
         from sessions s join app_users u on u.id = s.user_id
        where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now() and u.status = 'active'`,
      [sha256(token)],
    );
    const row = r.rows[0];
    if (row) {
      const { session_id, last_seen_at, ...user } = row;
      c.set("user", user);
      c.set("sessionId", session_id);
      if (Date.now() - new Date(last_seen_at).getTime() > 5 * 60_000) {
        await db.query(`update sessions set last_seen_at = now() where id = $1`, [session_id]);
      }
    }
  }
  await next();
}

export function requireUser(c: Ctx): SessionUser {
  const u = c.get("user");
  if (!u) throw unauthorized();
  return u;
}

export function requireVerified(c: Ctx): SessionUser {
  const u = requireUser(c);
  if (!u.email_verified_at) throw forbidden("Please verify your email address first.");
  return u;
}
