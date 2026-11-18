# Implementation report

Date: 2026-11-18.

## What works (verified in this build)

| Area | Status |
| --- | --- |
| Accounts | Sign-up, email verification, sign-in, sign-out, password reset, invitations (7-day), session list and revocation, data export, account deactivation |
| Roles & tenancy | Org-scoped roles in `memberships`; internal grants in `platform_grants`; provider assignments. Every query is scoped on the server; missing access returns 404 |
| Culturosity catalogue | Public teaser (no codes, URLs or instructions); member catalogue with search, Favourites / New / A–Z / Ending soon, category, city, region, country, online/in-person, offer type and date filters, grid/list view, empty and loading states |
| Details | Value + Use Perk first, image, full details, event occurrences separate from the claim window, promo code copy, provider contact, Directions, member card with vertical MEMBER and QR |
| Submit a Perk | Dedicated page and per-company page; 7 steps; preview; server and device drafts; shared Zod validation; idempotent submission |
| Automatic publication | One transaction for provider, offer, occurrences, images and program publication; scheduled/live/expired derived at read time; review queue that approves through the same pipeline; edit, pause, resume, duplicate, archive |
| Redemption | Opaque 10-minute single-use codes (QR + manual); provider verification page with camera scan and manual fallback; atomic, race-safe usage; valid / expired / already-used / not-eligible / wrong-provider results |
| Company administration | Dashboard, offers, review queue, members (invite, bulk CSV, roles, suspend/remove, program groups, domain enrollment as member-only), providers (QR/POS reference, managers, locations), programs, branding (contrast-checked accent, logo), CSV import with mapping/preview/duplicates, export, aggregated reports with definitions, licensed Culturosity offers, launch-material drafts, service requests |
| Services | Services page, approaches, Request a Proposal form (saved before any email), internal service queue with owner, status, notes and next step |
| Internal gate | Numeric keypad, server-checked hashed code, session-bound unlock, idle/absolute expiry, Lock Portal, durable rate limits, code rotation without rebuild |
| Research directory | 20 sourced records + Beneplace legacy alias; A–Z with alphabet jump; search; filters; table/card views; detail drawer with facts, evidence levels, pipeline, contacts with provenance and permissions, activities; add, edit, CSV import (dedupe), export, SSRF-safe URL recheck |
| Outreach | Email (initial + 2 follow-ups), SMS, phone (opener, discovery, voicemail, outline, objections), demo outline + follow-up; editable, Copy, Regenerate, Save Draft (versioned), Mark Activity; Do Not Contact enforcement; nothing is sent |
| Demo | Isolated fictional orgs, offers and people, all labelled Demo; persona sign-in; resettable demo guide |
| PWA | Manifest, icons, service worker (shell only, never `/api`), offline page |

### Perk details page (app design)

- `/perks/:id` follows the Culturosity app's Details screen: value pill joined to **Use Perk** (or **Show card** for in-person perks), large image, provider name, green offer card (title, description, promo code with copy), provider about, **Website / Email / Directions** rows, and the member card.
- The member card shows **the perk's own QR code** (`perks.pos_reference`, editable as "Perk QR code for POS" in the offer form), rendered black-on-white for scanners. The one-time verification code is still available under "Provider asks for a verification code?".
- Signed-out visitors see the description, dates and provider contacts; promo codes (also masked inside the text), Use Perk links and the QR code need a free sign-in.
- Content pack `0003` (`server/seed/content/0003_culturosity_perk_details.ts`) holds the details transcribed from Culturosity's app screenshots for 37 perks, adds Musée Membership, La Belle Boutique Blanche and Crescendo Vocal Assessment, and corrects two titles. Content pack `0004` removes four listing-only perks Culturosity confirmed should not be listed (Fossil Centre Gift Shop, Tosca, Nonsuch happy hour, BPM X WAG-Qaumajuq).

### Workspace pause / delete (Culturosity super admins only)

- Available only to super admins: **Admin → Workspaces** (Pause / Resume / Delete… per client) and **Manage → Workspace → Pause or delete** inside any client workspace. Company owners, admins and members don't see these controls; the API returns 404 to them.
- **Pause** sets the workspace to `suspended`: everyone in it — owner, admins, provider managers, members — gets "This workspace is paused by Culturosity". Nothing is removed; **Resume** restores access.
- **Delete** requires typing the workspace name and the super admin's own password. It permanently removes the workspace with its programs, offers, providers, memberships, invitations, uploads and reports; user accounts are kept. Recorded in the audit log. The Culturosity workspace itself can't be paused or deleted.

### Sales team (salespeople)

- **Admin → Sales team** (super admins only): enter a salesperson's email to create a private, single-use sign-up link (valid 7 days; only its hash is stored). Email isn't connected yet, so copy the link and send it; it is also queued for email for when a provider is configured. Unused links can be cancelled; salespeople can be removed (access ends immediately).
- The link opens `/auth/sales/:token`: the person sets their name and password (or connects an existing account with its password) and gets the `sales_admin` role. They still need the numeric access code to open the area.
- Salespeople can use Overview, Research Directory, Sales Outreach, Pipeline, Demo Guide and the Service queue. They **cannot** change the access code, manage the sales team, see or manage any workspace (including the Culturosity catalogue), pause/delete workspaces, reset demo data or create workspaces. Super admin access can't be removed from the site.

## Tests run

- `npm test`: 30 tests passed.
  - Business rules: timezone and DST windows, lifecycle transitions, A–Z ordering, value labels, validation edge cases, CSV injection, SSRF address filtering.
  - 19 API integration tests covering acceptance journeys 1–10:
    - CSRF and cross-origin blocking; teaser content.
    - Browsing, filters and favourites; details and Use Perk.
    - Publication visible from another session; idempotent retry; field errors; upload byte sniffing; review queue.
    - Scheduled, paused and expired offers.
    - Tenant isolation through API, URL, assets, exports and submissions.
    - Provider scope; concurrent scans give exactly one success.
    - Gate: wrong code, non-admin, anonymous, other session, expired grant, rate limit, code never stored.
    - Research A–Z, filters and export; outreach labelling; DNC; draft does not change stage.
    - Service requests; enrollment never grants admin; session revocation.
- The same 19 API tests also passed against **real PostgreSQL 16** (`TEST_DATABASE_URL`).
- `npm run test:e2e` (Playwright, Chromium) passed 4 journeys:
  - Admin publishes through the UI, and a member on a phone viewport sees it.
  - Cross-tenant API request is refused.
  - Keypad unlock leads to the research directory.
- Manual screenshot pass at 1360px and iPhone 13: no console errors, no horizontal overflow.
- The production build succeeds. The Netlify function bundles with PGlite excluded. The bundled function, run in `APP_MODE=production` against Postgres:
  - health returns `db=pg`,
  - the session cookie is `__Host-`, `Secure`, `HttpOnly`,
  - the dev mailbox and demo sign-in return 404,
  - the demo seed is refused.
- The raw gate code does not appear in `dist/`, the function bundle, server, shared or src code (CI checks `dist/`).

## Needs credentials or external setup (not done)

| Item | What to do |
| --- | --- |
| Hosted PostgreSQL | Create one and set `DATABASE_URL`. The app refuses to run on Netlify without it. |
| Netlify site | Connect the GitHub repo and set the environment variables (docs/DEPLOYMENT.md). Not deployed from this session: no Netlify account or token was available. |
| Email delivery | Set `RESEND_API_KEY` (or swap the `EmailAdapter`). Until then verification, invitation and reset emails are only stored in `email_outbox`, so real users won't receive them. |
| AI drafts | Set `ANTHROPIC_API_KEY`. The live model path has **not** been exercised, because no key was available; outreach currently produces labelled example templates. |
| Live research search | No provider is wired in (see docs/RESEARCH.md). URL recheck works but was only unit-tested here, because outbound HTTP from this sandbox goes through a proxy. |
| POS integrations | None connected. Only provider/POS references are stored. Each merchant's POS must be validated before building an adapter. |
| App stores | PWA only. Capacitor packaging, signing, store listings and privacy disclosures are still to do (docs/MOBILE.md). |
| Supabase | Planned; see docs/SUPABASE_MIGRATION.md. |
| Gate code | Initialise in production with `GATE_INITIAL_CODE=1234567890 npm run gate:init`, then rotate when ready. |

## Deliberate decisions and deviations

- **Auth:** I implemented the `AuthAdapter` on Node's built-in scrypt with DB-backed opaque sessions, instead of adding Better Auth. This kept one portable schema that runs identically on embedded and hosted Postgres, with revocable sessions and the CSRF model described in the README. It is an established algorithm but not a third-party auth framework. Swapping in Better Auth or Supabase Auth only touches `server/lib/auth.ts` and `auth_identities`.
- **Library versions:** Zod 4, React Router 7 and @hono/node-server 2 were adopted after `npm audit` flagged the earlier majors. `npm audit --omit=dev` reports 0 vulnerabilities.
- **Demo data:** demo offers live only in demo programs (`is_demo`). The public teaser shows them only when `APP_MODE=demo`. The production seed creates no offers.
- **Timezones:** offer windows use the runtime's IANA data. Current tz data puts `America/Vancouver` on permanent UTC-7 (British Columbia's move to permanent daylight time). Keep Node updated.
- **Prompt-stated values:** the contact email (`hello@culturosity.io`) and demo-booking link are editable settings, not hard-coded in the UI. Booking availability was not verified.

## Known limitations / next steps

- The client bundle's main chunk is about 160 kB gzipped. Admin areas are already code-split.
- Rich text is plain text with preserved line breaks; no HTML is rendered from user input.
- There is no in-app UI yet to edit `settings` (contact email, booking link, New window). Change them with SQL or a small admin form.
- Use a Postgres scheduled job or Netlify scheduled function to prune `rate_limits`, `gate_attempts` and expired tokens.
