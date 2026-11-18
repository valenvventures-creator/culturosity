// Production-safe base seed: Culturosity operating workspace, its default program and settings.
// Contains no demo offers, users or invented partnerships.
import type { Db } from "../db";
import { hashSecret } from "../lib/crypto";
import { getSetting, setSetting } from "../lib/settings";

export async function seedBase(db: Db, opts: { gateCode?: string | null } = {}) {
  await db.tx(async (q) => {
    const org = await q.query<{ id: string }>(
      `insert into organizations (slug, name, kind, program_display_name, contact_email)
       values ('culturosity', 'Culturosity', 'culturosity', 'Culturosity Perks', 'hello@culturosity.io')
       on conflict (slug) do update set updated_at = now() returning id`,
    );
    await q.query(
      `insert into programs (org_id, slug, name, description, is_default, moderation_required)
       values ($1, 'culturosity-perks', 'Culturosity Perks', 'Curated offers rooted in culture, local experiences, community and life beyond work.', true, true)
       on conflict (org_id, slug) do nothing`,
      [org.rows[0].id],
    );
  });
  const defaults: [string, unknown][] = [
    ["contact_email", "hello@culturosity.io"],
    ["demo_booking_url", "https://calendar.app.google/TgkAW4rUMJhzUgqY9"],
    ["new_window_days", 21],
  ];
  for (const [k, v] of defaults) if ((await getSetting(db, k)) === null) await setSetting(db, k, v);
  if (opts.gateCode) await initGate(db, opts.gateCode, false);
}

/** Server-only: store a hash of the numerical access code. Never stores or logs the raw value. */
export async function initGate(db: Db, code: string, overwrite: boolean): Promise<"set" | "kept"> {
  if (!/^\d{4,20}$/.test(code)) throw new Error("Gate code must be 4–20 digits.");
  if (!overwrite && (await getSetting(db, "gate_code_hash"))) return "kept";
  await setSetting(db, "gate_code_hash", await hashSecret(code));
  await db.query(`update admin_unlocks set revoked_at = now() where revoked_at is null`);
  return "set";
}
