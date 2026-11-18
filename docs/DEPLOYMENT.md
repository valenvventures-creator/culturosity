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

- build command `npm run netlify:build` (database setup when a database URL is set — see §3 — then type-check and build),
- publish directory `dist`,
- the `/api/*` function (declared `config.path` takes precedence over the SPA fallback `/* → /index.html 200`),
- security headers including a strict Content-Security-Policy,
- PGlite excluded from function bundles.

Set these **environment variables** in Netlify (Site settings → Environment variables). Mark secrets as secret; none start with `VITE_`.

| Variable | Value |
| --- | --- |
| `APP_MODE` | `production` |
| `APP_BASE_URL` | `https://your-site.netlify.app` (or custom domain) — used for links and secure cookies |
| `DATABASE_URL` | pooled Postgres URL (`?sslmode=require`); not needed with Netlify DB, which sets `NETLIFY_DATABASE_URL` |
| `DATABASE_POOL_MAX` | `3` |
| `STORAGE_DRIVER` | `netlify-blobs` |
| `RESEND_API_KEY`, `EMAIL_FROM` | optional, for real email delivery |
| `ANTHROPIC_API_KEY`, `AI_MODEL`, `AI_EFFORT` | optional, for AI drafts |
| `GATE_IDLE_MINUTES`, `GATE_ABSOLUTE_MINUTES` | optional overrides (30 / 240) |

Never set `SEED_DEMO_PASSWORD` on a production site. `GATE_INITIAL_CODE` and `BOOTSTRAP_ADMIN_*` are for the first deploy only (§3) — delete them afterwards.

## 3. First deploy entirely from the Netlify dashboard (no terminal)

The build command (`npm run netlify:build`) runs `scripts/netlify-prebuild.ts` before building. When a database URL is present it:

- applies migrations,
- runs the safe base seed (Culturosity workspace, settings, sourced research records — no demo data),
- applies any new **content packs** (`server/seed/content/`, recorded in `content_packs`), e.g. Culturosity's own perk listings,
- stores the hashed gate code **only if** `GATE_INITIAL_CODE` is set and no code exists yet,
- creates or promotes the super admin **only if** `BOOTSTRAP_ADMIN_EMAIL` is set.

Every step is idempotent, so it is safe on every deploy.

1. **Import the site:** Netlify → *Add new project* → *Import an existing project* → GitHub → `valenvventures-creator/culturosity` (authorise Netlify's GitHub app for the repo). Netlify reads `netlify.toml`; leave the build settings as detected.
2. **Database — Netlify DB:** on the site, add Netlify DB (Neon) — from the site's *Extensions*/*Database* section in the dashboard, or with `npx netlify db init` from a checkout. It sets `NETLIFY_DATABASE_URL`, which the app reads automatically. Netlify DB databases must be **claimed into a Neon account** within the period Netlify shows, or they are removed — claim it right away. (Any other Postgres works too: set `DATABASE_URL` instead.)
3. **Environment variables** (Site configuration → Environment variables), as in the table above, plus for the first deploy only:

   | Variable | Value |
   | --- | --- |
   | `GATE_INITIAL_CODE` | `1234567890` |
   | `BOOTSTRAP_ADMIN_EMAIL` | your admin email |
   | `BOOTSTRAP_ADMIN_PASSWORD` | a strong unique password (10+ chars) — mark as secret |

4. **Deploy** (*Deploys → Trigger deploy*). The deploy log shows `[prebuild] migrations applied`, `gate code hash stored` and `super admin created`.
5. **Delete `BOOTSTRAP_ADMIN_PASSWORD` and `GATE_INITIAL_CODE`** from the environment variables. Later deploys leave the stored hash and the admin untouched.
6. Sign in at `/auth/signin`, open **Admin Research & Sales**, unlock, and rotate the code in **Access settings** when ready.

### Alternative: bootstrap from a terminal

```bash
export APP_MODE=production DATABASE_URL='postgres://…'
```

```bash
npm run db:migrate && npm run db:seed
```

```bash
BOOTSTRAP_ADMIN_EMAIL=you@yourdomain.com BOOTSTRAP_ADMIN_PASSWORD='a-strong-unique-password' npm run admin:bootstrap
```

```bash
GATE_INITIAL_CODE=1234567890 npm run gate:init
```

The production seed creates no demo users or sample offers. `db:seed:demo` refuses to run when `APP_MODE=production`; use a separate demo database/site with `APP_MODE=demo` for a hosted demonstration.

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
