-- Static public image path for curated Culturosity imagery shipped with the site
-- (uploaded media continues to use image_asset_id / Netlify Blobs).
alter table perks add column image_path text check (image_path is null or image_path ~ '^/perks/[a-z0-9/_-]+\.(webp|png|jpg)$');

-- An offer whose listing is published but whose details/redemption information has not
-- been provided yet. Use Perk, redemption codes and the member card are disabled until cleared.
alter table perks add column details_pending boolean not null default false;

-- One-time content updates (like migrations, but for catalogue data).
create table content_packs (
  name text primary key,
  applied_at timestamptz not null default now()
);
