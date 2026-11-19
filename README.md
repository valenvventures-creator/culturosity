# Culturosity

**Better perks. Stronger connections.** One platform for Culturosity experiences and your company's affinity program.

Culturosity is a multi-tenant affinity-program platform with three commercial purposes:

1. **Culturosity Perks** — Culturosity's own curated catalogue of offers rooted in culture, local experiences and community.
2. **Affinity Program Management** — private, branded program workspaces for employers, unions and associations.
3. **Culturosity Management Services** — consulting and managed delivery (Self-Service, Launch with Culturosity, Fully Managed by Culturosity), sold via *Request a Proposal* (no invented pricing).

Accounts are **invitation-only**: people join through a company invitation or an approved work-email domain (plus salesperson sign-up links and accounts created by Culturosity). Company workspaces are created by Culturosity super admins only.

It also includes an internal **Admin Research & Sales** area (numerical-code gate → research directory, AI-assisted outreach drafts, pipeline, demo guide).

> This repository is an implementation, not a launched service. See [docs/IMPLEMENTATION_REPORT.md](docs/IMPLEMENTATION_REPORT.md) for what is verified, what needs credentials, and what still needs external coordination.

---

## Stack

| Layer | Choice |
| --- | --- |
| Web app | React 18 + TypeScript + Vite 6, React Router 6, TanStack Query 5 |
| API | Hono 4 running as a single Netlify Function (`netlify/functions/api.mts` → `/api/*`) and as a local Node server |
| Database | PostgreSQL (any hosted Postgres: Netlify DB/Neon, Supabase, RDS…) via `pg`; versioned SQL migrations in `server/db/migrations` |
| Local demo DB | PGlite (embedded Postgres, WASM) in `.data/pglite` — **local demo only**, refused in production and on Netlify |
| Auth | `AuthAdapter` with scrypt password hashing (Node `crypto`), DB-backed opaque sessions (httpOnly `__Host-` cookie), email verification, recovery, invitations, revocation |
| Media | `StorageAdapter`: Netlify Blobs (production), local disk (demo) |
| Email | `EmailAdapter`: always written to `email_outbox`; sent via Resend when `RESEND_API_KEY` is set |
| AI drafts | `AiAdapter` using the official Anthropic SDK (`claude-opus-5-5` by default) when `ANTHROPIC_API_KEY` is set; otherwise labelled **Example template** output |
| Validation | Zod schemas in `shared/` used by both browser and server |

## Quick start (local demo)

Requirements: Node **22.9+**.

```bash
npm install
```

```bash
cp .env.example .env
```

Edit `.env` and set the gate code (see [Numerical gate](#numerical-gate)), then:

```bash
npm run dev
```

Open http://localhost:5173. On first start the API applies migrations and seeds:

- the Culturosity workspace and settings,
- the 20 sourced research records (plus the Beneplace legacy alias),
- the **isolated demo**: Northwind Demo Co., Harbour Demo Union, a "Culturosity Perks — Demo" program, fictional providers/offers and synthetic people.

### Demo accounts (local demo only)

All demo users share the password `culturosity-demo-2026` (override with `SEED_DEMO_PASSWORD` before first start). The **Product demo** page (`/demo`) also has one-click persona sign-in.

| Email | Role |
| --- | --- |
| `super@demo.culturosity.test` | Culturosity super admin, owner of the Culturosity workspace |
| `sales@demo.culturosity.test` | Culturosity sales admin (research/outreach after unlock; demo workspaces only) |
| `member@demo.culturosity.test` | Member of Culturosity Perks — Demo and Northwind |
| `admin@northwind.example` / `member@northwind.example` | Northwind owner / member |
| `admin@harbour.example` / `member@harbour.example` | Harbour owner / member (used for tenant-isolation checks) |
| `provider@demo.culturosity.test` | Provider manager (Cedar Lane Fitness, Lumen Hall Gallery) |

Emails that would be sent appear at `/dev/mailbox` (local demo only; 404 when deployed or in production).

Reset the local demo database: `npm run db:reset:local`. Reset only demo data from the UI: **Admin → Demo Guide → Reset demo data**.

## Numerical gate

The internal **Admin Research & Sales** entry is shown only to users with an internal platform grant (`super_admin` or `sales_admin`). Company-workspace "admins" are never eligible. The person keeps their normal session and unlocks with a numeric keypad.

- The requested initial code is **`1234567890`**. It is kept out of source code, the client bundle and logs: set it as `GATE_INITIAL_CODE=1234567890` in the server environment, then run `npm run gate:init` (local dev does this automatically on start). Only an scrypt hash is stored (`settings.gate_code_hash`).
- The unlock is checked on the server and bound to the session (`admin_unlocks`). It locks after 30 minutes idle (`GATE_IDLE_MINUTES`), at an absolute limit (`GATE_ABSOLUTE_MINUTES`, default 240), on **Lock Portal**, sign-out, session revocation or grant revocation.
- Failed attempts are rate-limited durably in Postgres: 5 per account and 20 per source per 15 minutes. Attempts are recorded without the entered code.
- Every research, outreach, export, contact and AI endpoint requires both the grant **and** an active unlock.
- Rotate without rebuilding, either in **Admin → Access settings** (super admin) or on the server: `GATE_NEW_CODE=… npm run gate:rotate`. Rotation locks other sessions.

## Roles

| Role | Where it lives | Can |
| --- | --- | --- |
| Culturosity super admin | `platform_grants` | Manage any workspace, Culturosity catalogue, entitlements, gate rotation, research/sales after unlock |
| Culturosity sales admin | `platform_grants` | Research/outreach after unlock; demo workspaces only |
| Company owner / admin | `memberships.role` per org | Offers, members, roles (owners only for owner/admin), providers, branding, imports, reports, service requests |
| Provider manager | `memberships` + `provider_assignments` | Create/edit offers for **assigned providers only**; verify redemptions for those providers |
| Member | `memberships` + `program_memberships` | View/save/use offers in eligible programs, member card, account |

A person can belong to several organizations. The workspace selector in the header changes context only; every API call re-derives permissions on the server.

## Core workflows

- **Submit a Perk** (`/submit-perk`, `/app/:org/submit-perk`): a 7-step form (destination & provider → perk → value → dates & events → redemption & location → eligibility & media → review/preview), with save draft (account or device), inline errors and an idempotency key.
  - Owners/admins and assigned provider managers publish directly. One transaction creates the provider (if new), offer, event occurrences, images and program publication, so the offer appears in the catalogue immediately. Future start dates are **Scheduled**.
  - Members and the public go to the program's **review queue**. Approval publishes through the same pipeline.
- **Catalogue:** search; Favourites, New (publication date within `new_window_days`, default 21) and A–Z (provider name, then title, case-insensitive); filters for category, city, region, country, online/in-person, offer type and dates; grid/list view. Expired, paused and scheduled offers never appear to members. Availability is enforced in SQL at read and redeem time.
- **Details:** value and Use Perk first, then image, full details (dates, event occurrences, booking deadline, redemption, eligibility, restrictions), promo code with copy, provider contact and Directions, and the member card with a vertical **MEMBER** edge.

## Redemption & POS (implemented mode)

**Implemented:** server-verified QR and manual codes.

- Every provider gets a stable, human-readable **provider reference** (`CUL-P-XXXXXX`) and an optional admin-configured **POS reference**.
- A member taps *Show my redemption code*. The server issues an opaque token valid for 24 hours and one use. The QR payload is `CUL1:<providerRef>:<token>`, with a manual code alongside. No names, emails or membership numbers are encoded.
- The provider verification page (`/provider/verify`) uses camera scanning via `BarcodeDetector` where supported, with manual entry as a fallback. The server checks:
  - the token,
  - the verifier's assignment to that provider,
  - the member's active membership and program,
  - that the offer is live and still distributed,
  - per-member usage limits.

  Usage is consumed atomically (a conditional `UPDATE` plus a per-member advisory lock). Results are *valid*, *expired*, *already used*, *not eligible*, *wrong provider* or *not recognised*.
- **No POS system is connected.** The POS reference is stored for a future authenticated API/webhook adapter, and each merchant's system must be validated before such an integration is enabled.

## Reporting definitions

| Metric | Definition |
| --- | --- |
| `perk_view` | An eligible signed-in member opened offer details. |
| `use_perk_click` | Use Perk sent a member to the configured redemption URL. **A click is not proof of a purchase or saving.** |
| `redemption_initiated` | A member generated a redemption code. |
| `redemption_verified` | A provider verified the code on the server. This is the realised-use measure. |
| Estimated savings | **Not reported**: no defensible calculation is configured. |

Demo workspaces are labelled and their events are flagged `is_demo` and excluded from production totals. Company reports are aggregated; salespeople cannot see member-level behaviour.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | API (tsx watch, :8787) + Vite (:5173) with `/api` proxy |
| `npm run build` | Type-check + production build to `dist/` |
| `npm test` | 30 Vitest tests: business rules, plus API integration tests on embedded Postgres. Set `TEST_DATABASE_URL` to run them on real PostgreSQL |
| `npm run test:e2e` | Browser journeys (Playwright) against a running instance; `GATE_E2E_CODE` enables the keypad test |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |
| `npm run db:seed` / `db:seed:demo` | Safe base seed + research records / plus isolated demo (refused when `APP_MODE=production`) |
| `npm run admin:bootstrap` | Create/promote the first super admin from `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` |
| `npm run gate:init` / `gate:rotate` | Store/rotate the hashed numerical code |

## Deploying

GitHub + Netlify instructions, environment variables and post-deploy checks are in **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**. In short:

1. Import the GitHub repo in Netlify and add Netlify DB (or set `DATABASE_URL` to any hosted Postgres).
2. Set the server environment variables. Never prefix secrets with `VITE_`. For the first deploy, also set `GATE_INITIAL_CODE` and `BOOTSTRAP_ADMIN_EMAIL`/`BOOTSTRAP_ADMIN_PASSWORD`.
3. Deploy. The build migrates, seeds the base workspace and research records, stores the gate hash and creates your admin. All steps are idempotent.
4. Remove the two bootstrap secrets from Netlify.

## More documentation

- [docs/IMPLEMENTATION_REPORT.md](docs/IMPLEMENTATION_REPORT.md) — what works, what was tested, what still needs credentials/coordination
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — GitHub, Netlify, database, storage, email, AI, backups/restore
- [docs/SUPABASE_MIGRATION.md](docs/SUPABASE_MIGRATION.md) — planned move to Supabase Postgres/Auth/Storage with RLS
- [docs/MOBILE.md](docs/MOBILE.md) — PWA today; Capacitor packaging roadmap
- [docs/RESEARCH.md](docs/RESEARCH.md) — research directory rules and the live-search connector contract
- [docs/DESIGN_TOKENS.md](docs/DESIGN_TOKENS.md) — brand tokens and palette extensions

## Project layout

```
server/            Hono API: routes, auth/authz, publication pipeline, adapters, seeds, SQL migrations
shared/            Zod schemas, time/CSV/perk rules shared by browser and server
src/               React app: components (catalogue, detail, member card, form), pages (public, auth, org, provider, internal)
netlify/functions  Netlify Function entry for /api/*
scripts/           migrate, seed, gate, bootstrap-admin, dev runner, e2e
tests/             Vitest unit + API integration tests
public/            Logo (official asset), PWA manifest/icons, service worker, offline page
```
