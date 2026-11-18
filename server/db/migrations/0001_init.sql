-- Culturosity initial schema.
-- Conventions: UUID primary keys, timestamptz everywhere, money as integer minor units + ISO currency,
-- every business record carries an owning organization (org_id) or an explicit internal scope.

-- ============ Identity ============
create table app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text not null default '',
  email_verified_at timestamptz,
  status text not null default 'active' check (status in ('active','deactivated')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index app_users_email_lower_uq on app_users (lower(email));

-- Maps an application user to one or more auth-provider identities (password today, Supabase later).
create table auth_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  provider text not null,
  provider_user_id text not null,
  password_hash text,
  created_at timestamptz not null default now(),
  unique (provider, provider_user_id)
);
create index auth_identities_user_idx on auth_identities(user_id);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  token_hash text not null unique,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index sessions_user_idx on sessions(user_id);

create table verification_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  purpose text not null check (purpose in ('verify_email','reset_password')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table email_outbox (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  subject text not null,
  body_text text not null,
  delivered_via text not null default 'outbox',
  created_at timestamptz not null default now()
);

-- ============ Organizations & roles ============
create table assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,                                 -- owning org (null = internal Culturosity scope)
  scope text not null check (scope in ('public','org','internal')),
  storage_key text not null unique,
  mime text not null,
  bytes integer not null,
  alt text not null default '',
  status text not null default 'pending' check (status in ('pending','attached','orphaned')),
  uploaded_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text not null,
  kind text not null check (kind in ('culturosity','client')),
  is_demo boolean not null default false,
  status text not null default 'active' check (status in ('active','suspended','archived')),
  logo_asset_id uuid references assets(id) on delete set null,
  program_display_name text,
  welcome_copy text,
  accent_color text check (accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  contact_name text,
  contact_email text,
  coverage text,
  approx_member_count integer check (approx_member_count is null or approx_member_count >= 0),
  delivery_preference text check (delivery_preference in ('self_service','launch','managed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table assets add constraint assets_org_fk foreign key (org_id) references organizations(id) on delete cascade;

create table memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  role text not null check (role in ('owner','admin','provider_manager','member')),
  status text not null default 'active' check (status in ('active','suspended','removed')),
  eligible_from date,
  eligible_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, org_id)
);
create index memberships_org_idx on memberships(org_id, status);

-- Internal Culturosity permissions, deliberately separate from client roles.
create table platform_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  grant_name text not null check (grant_name in ('super_admin','sales_admin')),
  granted_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index platform_grants_active_uq on platform_grants(user_id, grant_name) where revoked_at is null;

create table programs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text not null,
  description text not null default '',
  is_default boolean not null default false,
  is_demo boolean not null default false,
  moderation_required boolean not null default false,
  status text not null default 'active' check (status in ('active','paused','archived')),
  created_at timestamptz not null default now(),
  unique (org_id, slug)
);
create unique index programs_one_default_uq on programs(org_id) where is_default;

create table program_memberships (
  program_id uuid not null references programs(id) on delete cascade,
  membership_id uuid not null references memberships(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (program_id, membership_id)
);

-- A client org may distribute offers from a Culturosity source program only when granted.
create table program_entitlements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  source_program_id uuid not null references programs(id) on delete cascade,
  granted_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index program_entitlements_active_uq on program_entitlements(org_id, source_program_id) where revoked_at is null;

create table invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner','admin','provider_manager','member')),
  program_id uuid references programs(id) on delete set null,
  token_hash text not null unique,
  invited_by uuid references app_users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index invitations_org_idx on invitations(org_id);

-- Approved enrollment rule: verified email at a domain grants MEMBER role only (never admin).
create table enrollment_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  email_domain text not null check (email_domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  program_id uuid references programs(id) on delete set null,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- ============ Providers & perks ============
create table providers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text not null default '',
  category text not null default '',
  website text,
  public_email text,
  public_phone text,
  logo_asset_id uuid references assets(id) on delete set null,
  provider_ref text not null unique,           -- stable human-readable provider/QR identity
  pos_reference text,                          -- admin-configured merchant/POS reference
  is_demo boolean not null default false,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index providers_org_idx on providers(org_id);

create table provider_locations (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references providers(id) on delete cascade,
  label text not null default '',
  address_line text,
  city text, region text, postal_code text, country text,
  lat double precision, lng double precision
);

create table provider_assignments (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references providers(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index provider_assignments_active_uq on provider_assignments(provider_id, user_id) where revoked_at is null;

create table perks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  provider_id uuid not null references providers(id),
  title text not null,
  short_description text not null default '',
  full_description text not null default '',
  category text not null default '',
  tags text[] not null default '{}',
  value_type text not null check (value_type in ('percent','amount','free','bogo','special')),
  value_label text not null,
  value_percent numeric(5,2) check (value_percent is null or (value_percent > 0 and value_percent <= 100)),
  value_amount_minor integer check (value_amount_minor is null or value_amount_minor > 0),
  currency char(3),
  conditions text not null default '',
  is_ongoing boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,                         -- exclusive end
  timezone text not null default 'America/Toronto',
  booking_deadline timestamptz,
  blackout_dates jsonb not null default '[]',
  redemption_method text not null check (redemption_method in ('online','in_person','hybrid')),
  redemption_url text,
  redemption_instructions text not null default '',
  promo_code text,
  usage_limit_per_member integer check (usage_limit_per_member is null or usage_limit_per_member > 0),
  pos_reference text,
  is_online_only boolean not null default false,
  address_line text, city text, region text, postal_code text, country text,
  lat double precision, lng double precision,
  eligibility_text text not null default '',
  household_allowed boolean not null default false,
  exclusions text not null default '',
  terms text not null default '',
  image_asset_id uuid references assets(id) on delete set null,
  image_alt text not null default '',
  allow_distribution boolean not null default false,
  public_teaser boolean not null default true,
  status text not null default 'draft'
    check (status in ('draft','pending_review','scheduled','published','paused','rejected','expired','archived')),
  is_demo boolean not null default false,
  published_at timestamptz,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check (is_ongoing or ends_at is not null),
  check (starts_at is null or ends_at is null or starts_at < ends_at),
  check (value_type <> 'amount' or (value_amount_minor is not null and currency is not null)),
  check (value_type <> 'percent' or value_percent is not null),
  check (redemption_method = 'in_person' or redemption_url is not null)
);
create index perks_org_status_idx on perks(org_id, status);
create index perks_provider_idx on perks(provider_id);

create table perk_occurrences (
  id uuid primary key default gen_random_uuid(),
  perk_id uuid not null references perks(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz,
  venue text not null default '',
  notes text not null default '',
  check (ends_at is null or ends_at > starts_at)
);
create index perk_occurrences_perk_idx on perk_occurrences(perk_id, starts_at);

create table perk_images (
  perk_id uuid not null references perks(id) on delete cascade,
  asset_id uuid not null references assets(id) on delete cascade,
  sort integer not null default 0,
  alt text not null default '',
  primary key (perk_id, asset_id)
);

create table program_perks (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  perk_id uuid not null references perks(id) on delete cascade,
  status text not null default 'active' check (status in ('active','paused','revoked')),
  granted_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (program_id, perk_id)
);
create index program_perks_perk_idx on program_perks(perk_id);

create table perk_submissions (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  submitter_user_id uuid references app_users(id) on delete set null,
  submitter_name text not null,
  submitter_email text not null,
  submitter_org_text text not null default '',
  destination_org_id uuid not null references organizations(id) on delete cascade,
  destination_program_id uuid not null references programs(id) on delete cascade,
  payload jsonb not null,
  authority_confirmed boolean not null default false,
  status text not null check (status in ('draft','pending_review','approved','rejected','published')),
  perk_id uuid references perks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index perk_submissions_dest_idx on perk_submissions(destination_org_id, status);

create table submission_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references perk_submissions(id) on delete cascade,
  reviewer_id uuid references app_users(id) on delete set null,
  decision text not null check (decision in ('approved','rejected')),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table favourites (
  user_id uuid not null references app_users(id) on delete cascade,
  program_id uuid not null references programs(id) on delete cascade,
  perk_id uuid not null references perks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, program_id, perk_id)
);

-- ============ Redemption ============
create table redemption_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,             -- sha256 of opaque QR token
  code_hash text not null unique,              -- sha256 of short manual-entry code
  user_id uuid not null references app_users(id) on delete cascade,
  membership_id uuid not null references memberships(id) on delete cascade,
  perk_id uuid not null references perks(id) on delete cascade,
  program_id uuid not null references programs(id) on delete cascade,
  provider_id uuid not null references providers(id) on delete cascade,
  max_uses integer not null default 1 check (max_uses > 0),
  uses integer not null default 0 check (uses >= 0),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (uses <= max_uses)
);

create table redemptions (
  id uuid primary key default gen_random_uuid(),
  token_id uuid not null references redemption_tokens(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  perk_id uuid not null references perks(id) on delete cascade,
  program_id uuid not null references programs(id) on delete cascade,
  provider_id uuid not null references providers(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  verified_by uuid references app_users(id) on delete set null,
  perk_snapshot jsonb not null,               -- keeps history interpretable after edits/archive
  is_demo boolean not null default false,
  verified_at timestamptz not null default now()
);
create index redemptions_user_perk_idx on redemptions(user_id, perk_id);
create index redemptions_org_idx on redemptions(org_id, verified_at);

-- ============ Services ============
create table service_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete set null,
  organization_name text not null,
  contact_name text not null,
  contact_email text not null,
  approx_member_count integer,
  service_needs text[] not null default '{}',
  approach text check (approach in ('self_service','launch','managed','unsure')),
  coverage text not null default '',
  target_launch text not null default '',
  message text not null default '',
  status text not null default 'new' check (status in ('new','contacted','scoping','proposal_sent','won','closed')),
  owner_user_id uuid references app_users(id) on delete set null,
  notes text not null default '',
  next_step text not null default '',
  submitted_by uuid references app_users(id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ Internal research & sales (internal scope only) ============
create table research_organizations (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  aliases text[] not null default '{}',
  primary_domain text,
  country text[] not null default '{}',
  region text not null default '',
  industry text not null default '',
  prospect_types text[] not null default '{}',
  audience text not null default '',
  research_focus text not null default '',
  internal_notes text not null default '',
  fit_assessment text not null default '',    -- internal analysis, not a verified fact
  verification_status text not null default 'unverified'
    check (verification_status in ('source_reviewed','url_rechecked','unverified','needs_review')),
  last_checked_at timestamptz,
  legacy_of uuid references research_organizations(id) on delete set null,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index research_org_domain_uq on research_organizations(lower(primary_domain)) where primary_domain is not null and legacy_of is null;
create index research_org_name_idx on research_organizations(lower(display_name));

create table research_programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references research_organizations(id) on delete cascade,
  operator_org_id uuid references research_organizations(id) on delete set null,
  name text not null,
  summary text not null default '',
  coverage text not null default '',
  perk_categories text[] not null default '{}',
  eligibility text not null default '',
  pricing text not null default '',
  official_website text,
  program_url text,
  contact_url text,
  public_email text,
  public_phone text,
  last_checked_at timestamptz,
  verification_status text not null default 'unverified'
    check (verification_status in ('source_reviewed','url_rechecked','unverified','needs_review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index research_programs_org_idx on research_programs(organization_id);

create table research_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references research_organizations(id) on delete cascade,
  program_id uuid references research_programs(id) on delete cascade,
  url text not null,
  title text not null default '',
  review_level text not null check (review_level in ('page_reviewed','url_rechecked','imported')),
  reviewed_at timestamptz not null,
  http_status integer,
  redirected_to text,
  note text not null default '',
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index research_sources_org_idx on research_sources(organization_id);

create table prospects (
  id uuid primary key default gen_random_uuid(),
  research_org_id uuid not null unique references research_organizations(id) on delete cascade,
  stage text not null default 'researching' check (stage in
    ('researching','qualified','contact_planned','contacted','demo_booked','proposal','won','lost','do_not_contact')),
  owner_user_id uuid references app_users(id) on delete set null,
  next_action text not null default '',
  due_date date,
  notes text not null default '',
  do_not_contact boolean not null default false,   -- account-wide suppression
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table business_contacts (
  id uuid primary key default gen_random_uuid(),
  research_org_id uuid not null references research_organizations(id) on delete cascade,
  name text not null default '',
  title text not null default '',
  email text, phone text,
  provenance text not null,                        -- where this contact detail came from
  source_url text,
  email_permission text not null default 'unknown' check (email_permission in ('unknown','permitted','opted_out')),
  sms_permission text not null default 'unknown' check (sms_permission in ('unknown','permitted','opted_out')),
  phone_permission text not null default 'unknown' check (phone_permission in ('unknown','permitted','opted_out')),
  do_not_contact boolean not null default false,   -- individual suppression
  created_at timestamptz not null default now()
);

create table outreach_drafts (
  id uuid primary key default gen_random_uuid(),
  research_org_id uuid not null references research_organizations(id) on delete cascade,
  author_id uuid references app_users(id) on delete set null,
  parent_id uuid references outreach_drafts(id) on delete set null,
  version integer not null default 1,
  objective text not null,
  persona text not null default '',
  tone text not null default '',
  channel text not null,
  content jsonb not null,
  generator text not null check (generator in ('template','ai')),
  model text,
  source_ids uuid[] not null default '{}',
  source_urls text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table sales_activities (
  id uuid primary key default gen_random_uuid(),
  research_org_id uuid not null references research_organizations(id) on delete cascade,
  user_id uuid references app_users(id) on delete set null,
  kind text not null check (kind in ('email','call','sms','meeting','demo','note','stage_change')),
  summary text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ============ Gate, settings, rate limits ============
create table settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references app_users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table admin_unlocks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index admin_unlocks_session_idx on admin_unlocks(session_id);

create table gate_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete set null,
  source_hash text not null,
  success boolean not null,
  created_at timestamptz not null default now()
);

create table rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (bucket, window_start)
);

create table idempotency_keys (
  key text primary key,
  user_scope text not null,
  response jsonb not null,
  created_at timestamptz not null default now()
);

-- ============ Analytics & audit ============
create table analytics_events (
  id uuid primary key default gen_random_uuid(),
  event text not null check (event in
    ('catalogue_view','perk_view','favourite_add','favourite_remove','use_perk_click','redemption_initiated','redemption_verified','share')),
  user_id uuid references app_users(id) on delete set null,
  org_id uuid references organizations(id) on delete cascade,
  program_id uuid references programs(id) on delete cascade,
  perk_id uuid references perks(id) on delete cascade,
  provider_id uuid references providers(id) on delete cascade,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index analytics_events_org_idx on analytics_events(org_id, event, created_at);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references app_users(id) on delete set null,
  org_id uuid references organizations(id) on delete set null,
  action text not null,
  target_type text not null default '',
  target_id text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_logs_org_idx on audit_logs(org_id, created_at);

create table announcement_drafts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  body text not null,
  updated_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
