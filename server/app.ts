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
    c.set("deps", await getDeps());
    await next();
    if (!c.res.headers.get("Cache-Control")) c.header("Cache-Control", "private, no-store");
  });
  app.use("*", secureHeaders({ crossOriginResourcePolicy: "same-origin", xFrameOptions: "DENY", referrerPolicy: "strict-origin-when-cross-origin" }));
  app.use("*", bodyLimit({ maxSize: 12 * 1024 * 1024, onError: (c) => c.json({ error: { code: "too_large", message: "Request is too large." } }, 413) }));
  app.use("*", sessionMiddleware);

  app.get("/health", async (c) => {
    const { db } = c.get("deps");
    await db.query("select 1");
    return c.json({ ok: true, db: db.kind });
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
    else if ((err as any)?.code === "23503" || (err as any)?.code === "23514" || (err as any)?.code === "22P02")
      e = new AppError(400, "invalid_reference", "The request referenced invalid or inconsistent data.");
    else {
      console.error(`[api] ${requestId}`, err);
      e = new AppError(500, "server_error", "Something went wrong on our side. Please try again.");
    }
    return c.json({ error: { code: e.code, message: e.message, fields: e.fields, requestId } }, e.status as any);
  });
  return app;
}
