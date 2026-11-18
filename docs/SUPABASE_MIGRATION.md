# Planned Supabase upgrade

Goal: move to **Supabase PostgreSQL, Supabase Auth and Supabase Storage** without rewriting the UI or discarding data.

## Boundaries already in place

| Concern | Boundary | Today | Supabase |
| --- | --- | --- | --- |
| Persistence | `server/db` (`Db`, `Queryable`) + plain SQL | `pg` / PGlite | Supabase Postgres via its pooled connection string — no code change |
| Identity | `AuthAdapter` (`server/lib/auth.ts`), `app_users` + `auth_identities` | password identities (`provider='password'`) | add `provider='supabase'` rows mapping `auth.users.id` → `app_users.id` |
| Media | `StorageAdapter` | Netlify Blobs / local | Supabase Storage adapter with signed URLs |
| Authorisation | Server checks in `server/lib/authz.ts` | always on | unchanged, plus RLS as defence in depth |

Business tables reference `app_users.id`, never an auth-vendor ID, so the cutover does not rewrite foreign keys.

## Migration map

| Data | Approach |
| --- | --- |
| organizations, programs, memberships, program_memberships, platform_grants, providers, provider_*, perks, perk_*, program_perks, favourites, redemptions, research_*, prospects, business_contacts, outreach_drafts, sales_activities, service_requests, settings, audit_logs, analytics_events | `pg_dump --data-only` → `pg_restore` into the Supabase database after running the same migrations |
| sessions, admin_unlocks, gate_attempts, rate_limits, verification_tokens, invitations | Do **not** migrate active sessions/unlocks; expire them at cutover. Re-issue pending invitations. |
| assets | Copy blobs to a Supabase Storage bucket keeping `storage_key`; verify counts and checksums |
| Passwords | Our hashes are scrypt (`scrypt$N$r$p$salt$hash`). Supabase Auth does not document importing scrypt hashes in this format, so plan a **controlled password reset**: create Supabase users by email (no password), map IDs into `auth_identities`, then send reset links. Never export plaintext passwords. |

## Row Level Security (defence in depth)

The server already enforces tenant scope on every query. If any table is exposed to the browser via Supabase, enable RLS and add policies such as:

```sql
alter table perks enable row level security;
create policy perks_member_read on perks for select using (
  exists (
    select 1 from program_perks pp
    join program_memberships pm on pm.program_id = pp.program_id
    join memberships m on m.id = pm.membership_id and m.status = 'active'
    join auth_identities ai on ai.user_id = m.user_id and ai.provider = 'supabase'
    where pp.perk_id = perks.id and pp.status = 'active' and ai.provider_user_id = auth.uid()::text
  )
);
```

- Internal research/sales tables (`research_*`, `prospects`, `business_contacts`, `outreach_drafts`, `sales_activities`, `admin_unlocks`, `gate_attempts`, `settings`) get **no browser policies**: server (service role) access only.
- Storage bucket policies mirror `assets.scope` and org membership.
- The service-role key stays in server environment variables only.
- Test policies with representative users from **at least two client organizations** (Northwind/Harbour-style fixtures exist in `tests/`).

## Cutover runbook

1. Dry run on a copy: apply migrations, restore data, run `TEST_DATABASE_URL=… npm test`, compare row counts per table.
2. Announce a short maintenance window; put the site in read-only mode (disable submissions/redemptions) to prevent split writes.
3. Final `pg_dump`, restore, verify counts and a checksum of key tables.
4. Switch `DATABASE_URL`, deploy the Supabase `AuthAdapter`/`StorageAdapter`.
5. Revoke all sessions (`update sessions set revoked_at = now()`), send password-reset emails.
6. Verify: sign-in, member catalogue, tenant isolation (two orgs), redemption, gate unlock, research access.
7. **Rollback:** keep the old database read-only for the retention window; to roll back, revert `DATABASE_URL` and adapters (writes made after cutover must be replayed manually — keep the window short).

No destructive migration runs automatically.
