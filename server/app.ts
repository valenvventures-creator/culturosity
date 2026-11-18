import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { ZodError } from "zod";
import type { AppEnv, Deps } from "./context";
import { sessionMiddleware } from "./lib/auth";
import { AppError, fromZod } from "./lib/errors";
import { randomToken } from "./lib/crypto";
import { authRoutes } from "./routes/auth";
import { perkRoutes } from "./routes/perks";
import { submissionRoutes } from "./routes/submissions";
import { manageRoutes } from "./routes/manage";
import { providerRoutes } from "./routes/provider";
import { serviceRoutes } from "./routes/services";
import { internalRoutes } from "./routes/internal";

const CONFIG_MESSAGES: [RegExp, string][] = [
  [/DATABASE_URL is not configured/, "No database is configured for this deployment. Attach Netlify DB or set DATABASE_URL, then redeploy."],
  [/STORAGE_DRIVER/, "Media storage is misconfigured. Set STORAGE_DRIVER=netlify-blobs on Netlify."],
  [/pglite/i, "No database is configured for this deployment. Attach Netlify DB or set DATABASE_URL, then redeploy."],
];
function safeConfigMessage(e: Error) {
  const known = CONFIG_MESSAGES.find(([re]) => re.test(e.message))?.[1];
  if (known) return known;
  const kind = e.name && e.name !== "Error" ? ` (${e.name})` : "";
  return `The API could not start${kind}. Check the function logs for this request ID.`;
}

/** Map database connectivity/schema failures to safe 503 responses. */
function dbProblem(err: unknown): AppError | null {
  const code = String((err as any)?.code ?? "");
  if (code === "42P01")
    return new AppError(503, "database_not_migrated", "The database has no Culturosity tables yet. Redeploy so the build can run migrations against this database.");
  if (code === "28P01" || code === "28000") return new AppError(503, "database_auth_failed", "The database rejected the credentials in the configured connection string.");
  if (code === "3D000") return new AppError(503, "database_missing", "The database named in the connection string does not exist.");
  if (["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "EAI_AGAIN", "ECONNRESET"].includes(code))
    return new AppError(503, "database_unreachable", `The database could not be reached (${code}).`);
  if (/CERT|SELF_SIGNED|TLS/i.test(code)) return new AppError(503, "database_tls_failed", `TLS to the database failed (${code}).`);
  if (code === "25006")
    return new AppError(503, "database_read_only", "The database connection is read-only. Use a connection string for a read-write role/compute (Neon: the primary branch, owner role).");
  if (code === "42501") return new AppError(503, "database_permission_denied", "The database role lacks permission for this operation. Use the database owner role in the connection string.");
  return null;
}

export function createApp(depsOrFactory: Deps | (() => Promise<Deps>)) {
  const app = new Hono<AppEnv>().basePath("/api");
  let depsPromise: Promise<Deps> | null = null;
  const getDeps = () => {
    if (typeof depsOrFactory !== "function") return Promise.resolve(depsOrFactory);
    depsPromise ??= depsOrFactory().catch((e) => {
      depsPromise = null;
      throw e;
    });
    return depsPromise;
  };

  app.use("*", async (c, next) => {
    const requestId = c.req.header("x-request-id") || randomToken(9);
    c.set("requestId", requestId);
    c.header("X-Request-Id", requestId);
    try {
      c.set("deps", await getDeps());
    } catch (e) {
      // Configuration problems are reported with a safe, actionable reason (no secrets or hostnames).
      console.error(`[api] ${requestId} configuration error:`, (e as Error).message);
      return c.json({ error: { code: "not_configured", message: safeConfigMessage(e as Error), requestId } }, 503);
    }
    await next();
    if (!c.res.headers.get("Cache-Control")) c.header("Cache-Control", "private, no-store");
  });
  app.use("*", secureHeaders({ crossOriginResourcePolicy: "same-origin", xFrameOptions: "DENY", referrerPolicy: "strict-origin-when-cross-origin" }));
  app.use("*", bodyLimit({ maxSize: 12 * 1024 * 1024, onError: (c) => c.json({ error: { code: "too_large", message: "Request is too large." } }, 413) }));
  app.use("*", sessionMiddleware);

  app.get("/health", async (c) => {
    const { db } = c.get("deps");
    const m = await db.query<{ n: number }>("select count(*)::int as n from schema_migrations"); // 42P01 -> not migrated
    const t = await db.query("select 1 from organizations where slug = 'culturosity'"); // base seed present?
    return c.json({ ok: true, db: db.kind, migrations: m.rows[0].n, seeded: t.rows.length > 0 });
  });

  app.route("/", authRoutes);
  app.route("/", perkRoutes);
  app.route("/", submissionRoutes);
  app.route("/", manageRoutes);
  app.route("/", providerRoutes);
  app.route("/", serviceRoutes);
  app.route("/", internalRoutes);

  app.notFound((c) => c.json({ error: { code: "not_found", message: "Not found.", requestId: c.get("requestId") } }, 404));
  app.onError((err, c) => {
    const requestId = c.get("requestId");
    let e: AppError;
    if (err instanceof AppError) e = err;
    else if (err instanceof ZodError) e = fromZod(err);
    else if ((err as any)?.code === "23505") e = new AppError(409, "conflict", "That record already exists.");
    else if (dbProblem(err)) {
      console.error(`[api] ${requestId} database error:`, (err as any)?.code, (err as Error).message);
      e = dbProblem(err)!;
    }
    else if ((err as any)?.code === "23503" || (err as any)?.code === "23514" || (err as any)?.code === "22P02")
      e = new AppError(400, "invalid_reference", "The request referenced invalid or inconsistent data.");
    else if ((err as Error)?.name === "MissingBlobsEnvironmentError") {
      console.error(`[api] ${requestId} storage error:`, (err as Error).message);
      e = new AppError(503, "storage_unavailable", "Media storage (Netlify Blobs) is not available to this function.");
    } else {
      console.error(`[api] ${requestId}`, err);
      e = new AppError(500, "server_error", "Something went wrong on our side. Please try again.");
    }
    // Safe diagnostic: a SQLSTATE / system error code or the error class name — never messages or data.
    const raw = String((err as any)?.code ?? "");
    const diagnostic =
      e.status >= 500 ? (/^[0-9A-Z]{5}$/.test(raw) || /^E[A-Z_]+$/.test(raw) ? raw : (err as Error)?.name && (err as Error).name !== "Error" ? (err as Error).name : undefined) : undefined;
    return c.json({ error: { code: e.code, message: e.message, fields: e.fields, requestId, diagnostic } }, e.status as any);
  });
  return app;
}
