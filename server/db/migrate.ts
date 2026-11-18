import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "./index";

/** Apply SQL migrations in filename order. Each file runs inside one transaction. */
export async function migrate(db: Db, dir: string): Promise<string[]> {
  await db.query(`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
  const applied = new Set((await db.query<{ name: string }>(`select name from schema_migrations`)).rows.map((r) => r.name));
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const ran: string[] = [];
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = readFileSync(join(dir, f), "utf8");
    await db.tx(async (q) => {
      await q.query(sql); // multi-statement script, no parameters
      await q.query(`insert into schema_migrations (name) values ($1)`, [f]);
    });
    ran.push(f);
  }
  return ran;
}
