import type { ServerConfig } from "../env";

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}
export interface Queryable {
  query<T = any>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
}
export interface Db extends Queryable {
  kind: "pg" | "pglite";
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Normalise JS values so both drivers bind them identically. */
function normaliseParams(params: unknown[] = []): unknown[] {
  return params.map((p) => {
    if (p === undefined) return null;
    if (p instanceof Date) return p.toISOString();
    if (p !== null && typeof p === "object" && !Array.isArray(p) && !(p instanceof Uint8Array)) return JSON.stringify(p);
    return p;
  });
}

export async function createPgDb(url: string, max = 3): Promise<Db> {
  const pg = await import("pg");
  const Pool = (pg as any).default?.Pool ?? (pg as any).Pool;
  const local = /localhost|127\.0\.0\.1/.test(url) || /sslmode=disable/.test(url);
  const pool = new Pool({ connectionString: url, max, idleTimeoutMillis: 10_000, ssl: local ? undefined : { rejectUnauthorized: true } });
  const run = async <T>(client: { query: (s: string, p: unknown[]) => Promise<any> }, sql: string, params?: unknown[]) => {
    const r = await client.query(sql, normaliseParams(params));
    return { rows: r.rows as T[], rowCount: r.rowCount ?? 0 };
  };
  return {
    kind: "pg",
    query: (sql, params) => run(pool, sql, params),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const out = await fn({ query: (sql, params) => run(client, sql, params) });
        await client.query("commit");
        return out;
      } catch (e) {
        await client.query("rollback").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

export async function createPgliteDb(dataDir: string | null): Promise<Db> {
  // Variable specifier keeps bundlers from pulling the local-only engine into production functions.
  const modName = "@electric-sql/pglite";
  const { PGlite } = await import(/* @vite-ignore */ modName);
  const db = dataDir ? new PGlite(dataDir) : new PGlite();
  await db.waitReady;
  const run = async <T>(q: { query: (s: string, p?: unknown[]) => Promise<any> }, sql: string, params?: unknown[]) => {
    const r = await q.query(sql, normaliseParams(params));
    return { rows: r.rows as T[], rowCount: r.affectedRows ?? r.rows.length };
  };
  return {
    kind: "pglite",
    query: (sql, params) =>
      params && params.length ? run(db, sql, params) : db.exec(sql).then((rs: any[]) => {
        const last = rs[rs.length - 1] ?? { rows: [], affectedRows: 0 };
        return { rows: last.rows, rowCount: last.affectedRows ?? last.rows.length };
      }),
    tx: (fn) =>
      db.transaction((t: any) =>
        fn({
          query: (sql, params) =>
            params && params.length ? run(t, sql, params) : t.exec(sql).then((rs: any[]) => {
              const last = rs[rs.length - 1] ?? { rows: [], affectedRows: 0 };
              return { rows: last.rows, rowCount: last.affectedRows ?? last.rows.length };
            }),
        }),
      ),
    close: () => db.close(),
  };
}

export async function createDbFromConfig(cfg: ServerConfig): Promise<Db> {
  if (cfg.databaseUrl) return createPgDb(cfg.databaseUrl, cfg.databasePoolMax);
  if (cfg.mode === "production" || cfg.isNetlify) {
    throw new Error(
      "DATABASE_URL is not configured. Production and Netlify deployments require a hosted PostgreSQL database; " +
        "the embedded PGlite database is for the local demo only.",
    );
  }
  return createPgliteDb(cfg.pgliteDir);
}
