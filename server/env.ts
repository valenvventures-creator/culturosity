// Server-only configuration. Never import this from browser code.
export type AppMode = "demo" | "production";

export interface ServerConfig {
  mode: AppMode;
  baseUrl: string;
  databaseUrl: string | null;
  databasePoolMax: number;
  pgliteDir: string;
  gateIdleMinutes: number;
  gateAbsoluteMinutes: number;
  storageDriver: "local" | "netlify-blobs" | "memory";
  uploadDir: string;
  maxUploadBytes: number;
  emailFrom: string;
  resendApiKey: string | null;
  anthropicApiKey: string | null;
  aiModel: string;
  aiEffort: "low" | "medium" | "high";
  researchProvider: string | null;
  secureCookies: boolean;
  isNetlify: boolean;
}

/** First valid http(s) origin among APP_BASE_URL, Netlify's URL, then localhost. Tolerates pasted spaces/quotes. */
function resolveBaseUrl(env: Record<string, string | undefined>): string {
  for (const raw of [env.APP_BASE_URL, env.URL, env.DEPLOY_PRIME_URL]) {
    const v = raw?.trim().replace(/^(["'])(.*)\1$/, "$2").trim();
    if (!v) continue;
    try {
      const u = new URL(v);
      if (u.protocol === "https:" || u.protocol === "http:") return u.origin;
    } catch {
      /* try the next candidate */
    }
    if (raw === env.APP_BASE_URL) console.warn("[config] APP_BASE_URL is not a valid URL (expected e.g. https://your-site.netlify.app); falling back.");
  }
  return "http://localhost:5173";
}

export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const mode: AppMode = env.APP_MODE === "production" ? "production" : "demo";
  // Build-time vars (NETLIFY, SITE_ID) are not always present inside the function runtime,
  // so also detect the Netlify/Lambda runtime and the Netlify DB variable.
  const isNetlify = Boolean(
    env.NETLIFY || env.NETLIFY_DEV || env.SITE_ID || env.NETLIFY_DATABASE_URL || env.NETLIFY_BLOBS_CONTEXT || env.AWS_LAMBDA_FUNCTION_NAME || env.NETLIFY_FUNCTIONS_PORT,
  );
  const baseUrl = resolveBaseUrl(env);
  const effort = env.AI_EFFORT === "low" || env.AI_EFFORT === "high" ? env.AI_EFFORT : "medium";
  return {
    mode,
    baseUrl,
    databaseUrl: env.DATABASE_URL || env.NETLIFY_DATABASE_URL || null,
    databasePoolMax: Number(env.DATABASE_POOL_MAX || 3),
    pgliteDir: env.PGLITE_DIR || ".data/pglite",
    gateIdleMinutes: Number(env.GATE_IDLE_MINUTES || 30),
    gateAbsoluteMinutes: Number(env.GATE_ABSOLUTE_MINUTES || 240),
    storageDriver: (env.STORAGE_DRIVER as ServerConfig["storageDriver"]) || (isNetlify ? "netlify-blobs" : "local"),
    uploadDir: env.UPLOAD_DIR || ".data/uploads",
    maxUploadBytes: Number(env.MAX_UPLOAD_BYTES || 5 * 1024 * 1024),
    emailFrom: env.EMAIL_FROM || "Culturosity <hello@culturosity.io>",
    resendApiKey: env.RESEND_API_KEY || null,
    // Trim pasted spaces/quotes so a copied key still works.
    anthropicApiKey: (env.ANTHROPIC_API_KEY || "").trim().replace(/^["']|["']$/g, "") || null,
    aiModel: env.AI_MODEL || "claude-opus-5-5",
    aiEffort: effort,
    researchProvider: env.RESEARCH_SEARCH_PROVIDER || null,
    secureCookies: baseUrl.startsWith("https://"),
    isNetlify,
  };
}
