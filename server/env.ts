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

export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const mode: AppMode = env.APP_MODE === "production" ? "production" : "demo";
  // Build-time vars (NETLIFY, SITE_ID) are not always present inside the function runtime,
  // so also detect the Netlify/Lambda runtime and the Netlify DB variable.
  const isNetlify = Boolean(
    env.NETLIFY || env.NETLIFY_DEV || env.SITE_ID || env.NETLIFY_DATABASE_URL || env.NETLIFY_BLOBS_CONTEXT || env.AWS_LAMBDA_FUNCTION_NAME || env.NETLIFY_FUNCTIONS_PORT,
  );
  const baseUrl = (env.APP_BASE_URL || env.URL || "http://localhost:5173").replace(/\/$/, "");
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
    anthropicApiKey: env.ANTHROPIC_API_KEY || null,
    aiModel: env.AI_MODEL || "claude-opus-5-5",
    aiEffort: effort,
    researchProvider: env.RESEARCH_SEARCH_PROVIDER || null,
    secureCookies: baseUrl.startsWith("https://"),
    isNetlify,
  };
}
