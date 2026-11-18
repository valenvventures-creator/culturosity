import type { Queryable } from "../db";
import { sha256 } from "./crypto";
import { tooMany } from "./errors";
import type { Ctx } from "../context";

/** Client source identifier, hashed so raw IPs are never stored. */
export function sourceHash(c: Ctx): string {
  const ip =
    c.req.header("x-nf-client-connection-ip") ||
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "local";
  return sha256(`src:${ip}`).slice(0, 32);
}

/**
 * Durable fixed-window rate limit stored in Postgres (works across serverless instances).
 * Returns remaining count; throws 429 when exceeded.
 */
export async function rateLimit(db: Queryable, bucket: string, limit: number, windowSeconds: number): Promise<number> {
  const now = Date.now();
  const windowStart = new Date(now - (now % (windowSeconds * 1000)));
  const r = await db.query<{ count: number }>(
    `insert into rate_limits (bucket, window_start, count) values ($1, $2, 1)
     on conflict (bucket, window_start) do update set count = rate_limits.count + 1
     returning count`,
    [bucket, windowStart],
  );
  const count = r.rows[0].count;
  if (count > limit) throw tooMany();
  if (Math.random() < 0.02) {
    await db.query(`delete from rate_limits where window_start < now() - interval '2 days'`).catch(() => {});
  }
  return limit - count;
}

export async function audit(
  db: Queryable,
  entry: { actor: string | null; orgId?: string | null; action: string; targetType?: string; targetId?: string | null; meta?: Record<string, unknown> },
) {
  await db.query(
    `insert into audit_logs (actor_user_id, org_id, action, target_type, target_id, meta) values ($1,$2,$3,$4,$5,$6)`,
    [entry.actor, entry.orgId ?? null, entry.action, entry.targetType ?? "", entry.targetId ?? null, entry.meta ?? {}],
  );
}

export type AnalyticsEvent =
  | "catalogue_view"
  | "perk_view"
  | "favourite_add"
  | "favourite_remove"
  | "use_perk_click"
  | "redemption_initiated"
  | "redemption_verified"
  | "share";

export async function track(
  db: Queryable,
  e: { event: AnalyticsEvent; userId?: string | null; orgId?: string | null; programId?: string | null; perkId?: string | null; providerId?: string | null; isDemo?: boolean },
) {
  await db.query(
    `insert into analytics_events (event, user_id, org_id, program_id, perk_id, provider_id, is_demo) values ($1,$2,$3,$4,$5,$6,$7)`,
    [e.event, e.userId ?? null, e.orgId ?? null, e.programId ?? null, e.perkId ?? null, e.providerId ?? null, e.isDemo ?? false],
  );
}
