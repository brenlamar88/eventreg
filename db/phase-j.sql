-- db/phase-j.sql — Real accounts: team memberships + invitations (Phase J)
-- ---------------------------------------------------------------------------
-- Run once in the Supabase SQL editor, AFTER db/phase-i.sql. Safe to re-run.
--
-- Adds real user accounts (Supabase Auth) and team management ON TOP of the
-- existing passcode model — passcodes keep working, so nothing breaks. A user
-- belongs to organizations through `memberships`, with a role. Platform
-- admins are owners of the seeded 'house' org.
--
-- REQUIRES Supabase Auth to be enabled on the project (it is, by default) and
-- an email provider configured for magic-link sign-in (Supabase ships a
-- default sender; set SMTP for production volume).
--
-- Roles: owner | admin | staff | door
--   owner  — full control of the org (billing, team, events)
--   admin  — manage the org's events/roster/sponsors/auction
--   staff  — roster + check-in
--   door   — check-in only (kiosk)
-- ---------------------------------------------------------------------------

create table if not exists memberships (
  user_id    uuid not null references auth.users(id) on delete cascade,
  org_id     uuid not null references organizations(id) on delete cascade,
  role       text not null default 'admin' check (role in ('owner','admin','staff','door')),
  created_at timestamptz not null default now(),
  primary key (user_id, org_id)
);
create index if not exists memberships_org_idx on memberships (org_id);
alter table memberships enable row level security;  -- service role only (server derives context)

create table if not exists invitations (
  id          uuid primary key default gen_random_uuid(),
  token       text not null unique,
  email       text not null,
  org_id      uuid not null references organizations(id) on delete cascade,
  role        text not null default 'admin' check (role in ('owner','admin','staff','door')),
  invited_by  uuid,
  accepted_at timestamptz,
  expires_at  timestamptz not null default (now() + interval '14 days'),
  created_at  timestamptz not null default now()
);
create index if not exists invitations_email_idx on invitations (lower(email));
create index if not exists invitations_org_idx   on invitations (org_id);
alter table invitations enable row level security;  -- service role only
