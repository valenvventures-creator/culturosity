# Deployment — GitHub + Netlify

## 1. Prerequisites you must create (not included)

| Item | Why | Notes |
| --- | --- | --- |
| Hosted PostgreSQL | All persistent data | Netlify DB (Neon), Supabase Postgres, Neon, RDS… Use a **pooled** connection string for serverless. |
| Netlify site | Hosting + Functions | Connect this GitHub repository. |
| Netlify Blobs | Uploaded images | Available automatically inside Netlify Functions; no key needed. |
| Resend account (optional) | Sending verification/invite/reset emails | Without it, emails are stored in `email_outbox` only — **users will not receive them in production**. Configure email before inviting real users. |
| Anthropic API key (optional) | AI outreach drafts | Without it, outreach shows labelled *Example template* output. |

## 2. Netlify configuration

`netlify.toml` already defines:

- build command `npm run netlify:build` (applies migrations when `DATABASE_URL` is set, then type-checks and builds),
- publish directory `dist`,
- the `/api/*` function (declared `config.path` takes precedence over the SPA fallback `/* → /index.html 200`),
- security headers including a strict Content-Security-Policy,
- PGlite excluded from function bundles.

Set these **environment variables** in Netlify (Site settings → Environment variables). Mark secrets as secret; none start with `VITE_`.

| Variable | Value |
| --- | --- |
| `APP_MODE` | `production` |
| `APP_BASE_URL` | `https://your-site.netlify.app` (or custom domain) — used for links and secure cookies |
| `DATABASE_URL` | pooled Postgres URL (`?sslmode=require`) |
| `DATABASE_POOL_MAX` | `3` |
| `STORAGE_DRIVER` | `netlify-blobs` |
| `RESEND_API_KEY`, `EMAIL_FROM` | optional, for real email delivery |
| `ANTHROPIC_API_KEY`, `AI_MODEL`, `AI_EFFORT` | optional, for AI drafts |
| `GATE_IDLE_MINUTES`, `GATE_ABSOLUTE_MINUTES` | optional overrides (30 / 240) |

Do **not** set `GATE_INITIAL_CODE`, `BOOTSTRAP_ADMIN_*` or `SEED_DEMO_PASSWORD` as permanent site variables; use them once from a trusted machine (below).

## 3. One-time production bootstrap (from a trusted machine)

```bash
export APP_MODE=production DATABASE_URL='postgres://…'
```

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

```bash
BOOTSTRAP_ADMIN_EMAIL=you@yourdomain.com BOOTSTRAP_ADMIN_PASSWORD='a-strong-unique-password' npm run admin:bootstrap
```

```bash
GATE_INITIAL_CODE=1234567890 npm run gate:init
```

Then sign in, open **Admin Research & Sales**, unlock, and rotate the code from **Access settings** when you are ready to move away from the requested initial value.

The production seed creates the Culturosity workspace, settings (`hello@culturosity.io`, the configured demo-booking link) and the sourced research records. It does **not** create demo users or sample offers. `db:seed:demo` refuses to run when `APP_MODE=production`; use a separate demo database/site with `APP_MODE=demo` if you want a hosted demonstration.

## 4. Post-deploy checks

- `GET /api/health` → `{"ok":true,"db":"pg"}`
- `GET /api/config` → `integrations.database = "postgresql"`, `storage = "netlify-blobs"`
- `/dev/mailbox` and `/api/demo/session` return 404.
- Sign in as the bootstrap admin, create a client workspace, publish an offer, view it as an invited member on another device.
- `npm run test:e2e` against a **demo** deployment (not production).

## 5. Backups & restore

- Enable your Postgres provider's automated backups / point-in-time recovery.
- Before risky migrations: `pg_dump --format=custom "$DATABASE_URL" > culturosity-$(date +%F).dump`
- Restore into a fresh database: `pg_restore --no-owner --dbname "$NEW_DATABASE_URL" culturosity-YYYY-MM-DD.dump`, then point `DATABASE_URL` at it.
- Netlify Blobs: export via the Netlify CLI (`netlify blobs:list culturosity-assets`) or replicate to object storage on a schedule; `assets.storage_key` maps rows to blobs.

## 6. Environment separation

Use separate Netlify sites (or deploy contexts) and **separate databases** for production, staging and demo. Never point a demo deployment at the production database.

## 7. Operations notes

- Rate limits, sessions and gate attempts live in Postgres, so they work across serverless instances. Prune old rows periodically (`rate_limits` self-prunes opportunistically).
- Abandoned uploads (never attached within 24h) are removed opportunistically on new uploads.
- Logs never include passwords, session tokens, gate codes or redemption tokens; errors return a request ID (`X-Request-Id`) for correlation.
