// Netlify Background Function (the "-background" suffix): runs one live research search, or one
// in-depth research pass on a suggestion, for up to 15 minutes after the API has queued it. The
// caller gets 202 immediately. It only runs work that is still queued and whose one-time search
// token matches, so it can't be used to start searches directly.
import { createDeps } from "../../server/bootstrap";
import { runDeepDive, runResearchSearch } from "../../server/lib/liveResearch";
import { sha256 } from "../../server/lib/crypto";

const UUID = /^[0-9a-f-]{36}$/i;

export default async (req: Request) => {
  if (req.method !== "POST") return;
  const body = (await req.json().catch(() => null)) as { id?: string; token?: string; suggestionId?: string } | null;
  if (!body?.id || !body.token || !UUID.test(body.id) || (body.suggestionId && !UUID.test(body.suggestionId))) return;
  try {
    const deps = await createDeps();
    const job = await deps.db.query<{ status: string; origin: string | null }>(
      `select status, origin from research_searches where id = $1 and run_token_hash = $2`,
      [body.id, sha256(body.token)],
    );
    const search = job.rows[0];
    if (!search) return;
    if (body.suggestionId) {
      const g = await deps.db.query(`select 1 from research_suggestions where id = $1 and search_id = $2 and dive_status = 'queued'`, [body.suggestionId, body.id]);
      if (g.rows.length) await runDeepDive(deps, body.suggestionId);
      return;
    }
    if (search.status !== "queued") return;
    // Each in-depth research pass gets its own background invocation (and its own 15 minutes).
    const startDive = async (suggestionId: string) => {
      if (!search.origin) throw new Error("no site address");
      const res = await fetch(`${search.origin}/.netlify/functions/research-search-background`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: body.id, token: body.token, suggestionId }),
      });
      if (!res.ok && res.status !== 202) throw new Error(`status ${res.status}`);
    };
    await runResearchSearch(deps, body.id!, startDive);
  } catch (e) {
    console.error("[research-search-background]", (e as Error).message);
  }
};
