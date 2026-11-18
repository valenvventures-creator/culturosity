import type { Queryable } from "../db";

export async function getSetting<T>(q: Queryable, key: string): Promise<T | null> {
  const r = await q.query<{ value: T }>(`select value from settings where key = $1`, [key]);
  return r.rows[0]?.value ?? null;
}

export async function setSetting(q: Queryable, key: string, value: unknown, userId: string | null = null) {
  await q.query(
    `insert into settings (key, value, updated_by) values ($1, $2::jsonb, $3)
     on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
    [key, JSON.stringify(value), userId],
  );
}
