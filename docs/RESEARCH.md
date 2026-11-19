# Research directory

Internal, gate-protected directory of **publicly discoverable** affinity, employee-discount and member-benefit programs in Canada and the USA. It is a prospecting tool, never a complete list and never a list of partners.

## Rules implemented

- Records are classified as one or more of: employer/organization, association/union/membership organization, program operator/aggregator, merchant/provider.
- Program-owning organizations are separate from operators (`research_programs.operator_org_id`). AT&T and UPS are seeded as employers operated by BenefitHub, which is its own operator record.
- Deduplication is by display name, alias and primary domain. Legacy brands are linked with `legacy_of`: Beneplace → Working Advantage is seeded as a *needs review* legacy alias and is not counted.
- Unknown fields stay empty and display **Not publicly confirmed**. Internal "potential fit" text is stored separately (`fit_assessment`) and labelled as internal analysis.
- Evidence levels in `research_sources.review_level`:
  - `page_reviewed`: a person reviewed the page.
  - `url_rechecked`: the server confirmed reachability and redirects only, not the claims on the page.
  - `imported`: a CSV import that needs review. Outreach grounding ignores these sources.
- Imports create research records only, never offers or partnerships.
- Fetched content is untrusted. URL rechecks:
  - allow only http/https on standard ports,
  - resolve DNS and refuse private, loopback, link-local, CGNAT and metadata addresses,
  - pin the resolved address for the connection,
  - follow up to 5 redirects manually, re-validating each one,
  - cap responses at 512 KB and 8 seconds,
  - extract only the HTTP status, final URL and `<title>` text.

## Seed set

The 20 records from the master prompt (§19) reviewed on 2026-11-17, with official source URLs preserved (`server/seed/research.ts`). Revalidate before outreach.

## Live search (Claude web search)

Enabled when `ANTHROPIC_API_KEY` is set (model `AI_MODEL`, default `claude-opus-5-5`).

- **Admin Research & Sales → Live Search** (salespeople and super admins). A request plus optional country, province/state, sector and prospect type; Quick (4 searches / 3 page reads) or Deep (12 / 8).
- Two opt-in checkboxes, off by default: **Extra-deep search** (25 searches / 20 page reads, up to 20 suggestions, high effort; also assesses each candidate for a mobile app, whether the program is professionally managed (vendor named) or in-house, and Culturosity fit — strong/possible/weak, best-matching service and reasons; app/management claims without retrieved evidence are downgraded to "unknown"; results are ranked best fit first and Add writes the assessment into the record's `fit_assessment`) and **Research each suggestion in depth** (up to 8 suggestions; each gets its own job with 6 searches / 6 page reads that returns program details, perk categories, eligibility, coverage, member cost, operator, audience size and a public contact page — only sourced fields are kept). Each in-depth pass runs in its own Netlify background invocation and stops if the monthly budget is used up.
- Runs as a job: the API queues it and calls the Netlify background function `research-search-background` (up to 15 minutes) with a one-time token; locally it runs in-process. The page polls for results.
- Claude uses the server-side `web_search_20260209` and `web_fetch_20260209` tools, then calls a strict `submit_candidates` tool. Web content is treated as untrusted data.
- **Every suggestion must cite pages actually retrieved in that run** (checked against the tool results); unsupported candidates and unverified official URLs are dropped. Organizations already in the directory (name or domain) are skipped.
- Suggestions are never written to the directory automatically. **Add to directory** creates a `needs_review` record with `web_search` sources, which outreach grounding ignores until reviewed.
- Spend is estimated per search (tokens at list price + $10 per 1,000 web searches) and capped by a monthly limit the owner sets in Access settings (default $25).

## Outreach guardrails

- Drafts are generated for one selected record, from stored verified sources only. Nothing is ever sent.
- The AI prompt forbids invented relationships, referrals, testimonials, savings, guarantees and decision-maker names. Fetched text is fenced as data.
- Do Not Contact is an account-wide stage that blocks drafting. Individual contact suppression and per-channel permission (email/SMS/phone) are stored separately, with provenance. SMS drafts warn when no permission is recorded.
- Saving a draft never changes the pipeline stage. Only a logged activity or a manual stage change does.
