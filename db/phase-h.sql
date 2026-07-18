-- db/phase-h.sql — Multi-tenant foundation: client organizations (Phase H)
-- ---------------------------------------------------------------------------
-- Run once in the Supabase SQL editor, AFTER db/phase-g isn't a SQL phase, so:
-- AFTER db/phase-f.sql. Safe to re-run.
--
-- Turns "our events" into "a platform where many CLIENT ORGANIZATIONS each
-- run their own events." An organization owns events; an event belongs to
-- exactly one organization. This is the additive foundation — nothing here
-- changes how the current site behaves. All existing events are assigned to a
-- seeded "house" organization that maps to your platform master passcode.
--
-- Auth tiers after this migration (see api/_lib/auth.js):
--   platform master (env ORGANIZER_PASSCODE) — you; works everywhere, manages orgs
--   org owner passcode (organizations.owner_passcode) — a client org's admin
--   event passcode (event_settings.organizer_passcode) — door staff, one event
--
-- Stripe columns are provisioned now but wired in the next phase:
--   stripe_account_id  — the org's Stripe Connect (Express) account → payouts
--   stripe_customer_id — the org's Stripe Billing customer → your SaaS fee
-- ---------------------------------------------------------------------------

create table if not exists organizations (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,          -- URL id: ?client=<slug>
  name               text not null,
  owner_passcode     text,                           -- write-only; org admin key
  contact_email      text,
  plan               text not null default 'trial',  -- trial | active | paused
  stripe_account_id  text,                            -- Connect Express (payouts)
  stripe_customer_id text,                            -- Billing (your SaaS fee)
  status             text not null default 'active',  -- active | suspended
  created_at         timestamptz not null default now()
);
alter table organizations enable row level security;  -- service role only

-- Events belong to an organization.
alter table event_settings add column if not exists org_id uuid references organizations(id) on delete set null;

-- Seed the "house" org for everything that already exists, so the current
-- site keeps working unchanged. Its slug is 'house'; your env master passcode
-- remains the platform key over it (and every org).
insert into organizations (slug, name, plan, status)
  values ('house', 'House (default)', 'active', 'active')
  on conflict (slug) do nothing;

update event_settings
   set org_id = (select id from organizations where slug = 'house')
 where org_id is null;

create index if not exists event_settings_org_id_idx on event_settings (org_id);
