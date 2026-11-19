// Netlify Background Function (the "-background" suffix): runs one live research search for up to
// 15 minutes after the API has queued it. The caller gets 202 immediately. It only runs a job that
// is still queued and whose one-time token matches, so it can't be used to start searches directly.
import { createDeps } from "../../server/bootstrap";
import { runResearchSearch } from "../../server/lib/liveResearch";
import { sha256 } from "../../server/lib/crypto";

export default async (req: Request) => {
  if (req.method !== "POST") return;
  const body = (await req.json().catch(() => null)) as { id?: string; token?: string } | null;
  if (!body?.id || !body.token || !/^[0-9a-f-]{36}$/i.test(body.id)) return;
  try {
    const deps = await createDeps();
    const job = await deps.db.query(`select 1 from research_searches where id = $1 and status = 'queued' and run_token_hash = $2`, [body.id, sha256(body.token)]);
    if (!job.rows.length) return;
    await runResearchSearch(deps, body.id);
  } catch (e) {
    console.error("[research-search-background]", (e as Error).message);
  }
};
