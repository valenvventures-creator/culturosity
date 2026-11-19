-- Live research search: a salesperson or super admin asks Claude to search the public web for
-- affinity programs; results are suggestions with citations that a person must add or dismiss.
create table research_searches (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references app_users(id) on delete set null,
  query text not null,
  country text[] not null default '{}',
  region text not null default '',
  prospect_type text not null default '',
  sector text not null default '',
  depth text not null check (depth in ('quick','deep')),
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  run_token_hash text not null,
  web_searches integer not null default 0,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_cents integer not null default 0,
  model text,
  summary text not null default '',
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index research_searches_created_idx on research_searches (created_at desc);

create table research_suggestions (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null references research_searches(id) on delete cascade,
  organization text not null,
  program_name text not null default '',
  summary text not null default '',
  official_url text,
  country text[] not null default '{}',
  region text not null default '',
  prospect_type text not null default '',
  sector text not null default '',
  citations jsonb not null default '[]',
  status text not null default 'new' check (status in ('new','added','dismissed')),
  research_org_id uuid references research_organizations(id) on delete set null,
  decided_by uuid references app_users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index research_suggestions_search_idx on research_suggestions (search_id);

-- Sources found by live search are their own evidence level: never treated as reviewed.
alter table research_sources drop constraint if exists research_sources_review_level_check;
alter table research_sources add constraint research_sources_review_level_check
  check (review_level in ('page_reviewed','url_rechecked','imported','web_search'));
