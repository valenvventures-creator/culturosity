import { resolve } from "node:path";
import { createApp } from "../server/app";
import { createPgliteDb, createPgDb } from "../server/db";
import { migrate } from "../server/db/migrate";
import { loadConfig } from "../server/env";
import { createMemoryStorage } from "../server/adapters/storage";
import { createEmailAdapter } from "../server/adapters/email";
import { createAiAdapter } from "../server/adapters/ai";
import { createResearchFetcher } from "../server/adapters/research";
import { seedBase } from "../server/seed/base";
import { seedResearch } from "../server/seed/research";
import { seedDemo, DEMO_DEFAULT_PASSWORD } from "../server/seed/demo";
import type { Deps } from "../server/context";

export const TEST_GATE_CODE = "1234567890"; // requested initial code; hashed by seedBase
export const PASSWORD = DEMO_DEFAULT_PASSWORD;

export async function setup() {
  const config = { ...loadConfig({ APP_MODE: "demo", APP_BASE_URL: "http://localhost:5173" }), storageDriver: "memory" as const };
  // Default: in-memory PGlite. Set TEST_DATABASE_URL to run the same suite against real PostgreSQL
  // (the schema in that database is dropped and recreated).
  const url = process.env.TEST_DATABASE_URL;
  const db = url ? await createPgDb(url, 5) : await createPgliteDb(null);
  if (url) await db.query("drop schema public cascade; create schema public;");
  await migrate(db, resolve(process.cwd(), "server/db/migrations"));
  const storage = createMemoryStorage();
  const deps: Deps = {
    db,
    config,
    storage,
    email: createEmailAdapter(config),
    ai: createAiAdapter(config),
    research: createResearchFetcher(),
  };
  await seedBase(db, { gateCode: TEST_GATE_CODE });
  await seedResearch(db);
  await seedDemo(db, storage, {});
  const app = createApp(deps);
  return { app, deps, db };
}

export type App = Awaited<ReturnType<typeof setup>>["app"];

/** Minimal client with a cookie jar per "device". */
export function client(app: App, ip = "10.0.0.1") {
  let cookie = "";
  const call = async (method: string, path: string, body?: unknown, extra: Record<string, string> = {}) => {
    const headers: Record<string, string> = { "x-forwarded-for": ip, ...extra };
    if (cookie) headers.cookie = cookie;
    if (method !== "GET") headers["x-culturosity-csrf"] = "1";
    let payload: BodyInit | undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await app.request(`/api${path}`, { method, headers, body: payload });
    const set = res.headers.get("set-cookie");
    if (set) {
      const m = set.match(/(?:__Host-)?cul_session=([^;]*)/);
      if (m) cookie = m[1] ? `cul_session=${m[1]}` : "";
    }
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: res.status, json, headers: res.headers };
  };
  return {
    get: (p: string) => call("GET", p),
    post: (p: string, b?: unknown, h?: Record<string, string>) => call("POST", p, b ?? {}, h),
    put: (p: string, b?: unknown) => call("PUT", p, b ?? {}),
    patch: (p: string, b?: unknown) => call("PATCH", p, b ?? {}),
    del: (p: string, b?: unknown) => call("DELETE", p, b),
    raw: call,
    async signIn(email: string, password = PASSWORD) {
      const r = await call("POST", "/auth/signin", { email, password });
      if (r.status !== 200) throw new Error(`sign-in failed for ${email}: ${JSON.stringify(r.json)}`);
      return r;
    },
  };
}

export function samplePerk(over: Record<string, any> = {}) {
  const today = new Date();
  const end = new Date(today.getTime() + 30 * 86400_000).toISOString().slice(0, 10);
  return {
    provider: { name: "Test Provider (Demo)", description: "", category: "Wellness" },
    title: "Test perk for automatic publication",
    shortDescription: "A sample offer created by an automated test.",
    fullDescription: "This sample offer verifies that a submission populates the catalogue automatically.",
    category: "Wellness",
    tags: [],
    value: { type: "percent", percent: 10, conditions: "" },
    availability: { ongoing: false, endDate: end, timezone: "America/Toronto", blackoutDates: [] },
    occurrences: [],
    media: { imageAlt: "", additional: [] },
    redemption: { method: "online", url: "https://example.com/test", instructions: "Use the link and apply the code." },
    location: { onlineOnly: true },
    eligibility: { groups: "All Northwind employees", householdAllowed: false, exclusions: "", terms: "" },
    allowDistribution: false,
    ...over,
  };
}
