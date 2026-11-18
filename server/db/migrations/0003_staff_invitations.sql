-- Private sign-up links for Culturosity staff (salespeople). A super admin creates a link for one
-- email address; opening it lets that person create (or connect) an account with the sales role.
create table staff_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  grant_name text not null default 'sales_admin' check (grant_name in ('sales_admin')),
  token_hash text not null unique,
  invited_by uuid references app_users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references app_users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index staff_invitations_email_idx on staff_invitations (lower(email));
