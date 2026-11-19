-- Live search options: an "extra" depth and an optional in-depth research pass on each suggestion.
alter table research_searches drop constraint if exists research_searches_depth_check;
alter table research_searches add constraint research_searches_depth_check check (depth in ('quick','deep','extra'));
alter table research_searches add column deep_dive boolean not null default false;
-- Where the search was started from, so follow-up background jobs call the same site.
alter table research_searches add column origin text;

alter table research_suggestions add column dive_status text not null default 'none'
  check (dive_status in ('none','queued','running','done','failed'));
alter table research_suggestions add column dive_error text;
alter table research_suggestions add column details jsonb;
alter table research_suggestions add column dive_cost_cents integer not null default 0;
