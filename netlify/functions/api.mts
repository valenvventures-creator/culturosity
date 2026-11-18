// Netlify Function entry: serves every /api/* route. Declared paths take precedence over the SPA redirect.
import type { Config } from "@netlify/functions";
import { createApp } from "../../server/app";
import { createDeps } from "../../server/bootstrap";

// Dependencies are created lazily once per warm instance; failures (e.g. missing DATABASE_URL)
// surface as a clear 500 with a request ID instead of a crashed function.
const app = createApp(() => createDeps());

export default async (req: Request) => {
  try {
    return await app.fetch(req);
  } catch (e) {
    console.error("[api] fatal", (e as Error).message);
    return new Response(
      JSON.stringify({ error: { code: "not_configured", message: "The API is not configured. See README → Deploying to Netlify." } }),
      { status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
    );
  }
};

export const config: Config = { path: "/api/*" };
