-- db/phase-0-bootstrap.sql — Base tables (run FIRST, before phase-a.sql)
-- ---------------------------------------------------------------------------
-- Creates the core schema on a FRESH Supabase project. Every statement is
-- guarded, so on a project that already has these tables (e.g. yellow-kite)
-- this is a complete no-op — safe to run anywhere, any number of times.
--
-- Column set is exactly what the app reads/writes today (api/*.js and the
-- client insert path). The phase-a → phase-d scripts then layer ticketing,
-- sponsor packages, offline reconciliation, and white-label config on top.
--
-- Order for a new project:
--   phase-0-bootstrap.sql → phase-a.sql → phase-b.sql → phase-c.sql → phase-d.sql
-- ---------------------------------------------------------------------------

-- Sponsors first (registrants reference them)
create table if not exists sponsors (
  id             uuid primary key default gen_random_uuid(),
  event_year     int not null default 2026,
  name           text not null,
  contact_name   text,
  contact_email  text,
  contact_phone  text,
  tier           text,
  amount_pledged numeric not null default 0,
  amount_paid    numeric not null default 0,
  payment_status text not null default 'Unpaid',
  benefits       text,
  logo_received  boolean not null default false,
  notes          text,
  created_at     timestamptz not null default now()
);

-- Registrants: written by the Stripe webhook (service role), the organizer
-- APIs (service role), and the public registration flow (publishable key,
-- INSERT-only via the policy below).
create table if not exists registrants (
  id                uuid primary key default gen_random_uuid(),
  event_id          text not null default 'boil85',
  name              text,
  email             text,
  phone             text,
  party             int not null default 1,
  source            text,                       -- Online | Walk-in | Jotform
  status            text not null default 'Paid',
  amount            numeric not null default 0,
  checked_in        boolean not null default false,
  notes             text,
  ranch             text,
  bidder_number     text,
  sponsor_id        uuid references sponsors(id) on delete set null,
  stripe_session_id text,
  created_at        timestamptz not null default now()
);

-- Auction lots (settlement module)
create table if not exists lots (
  id               uuid primary key default gen_random_uuid(),
  event_year       int not null default 2026,
  lot_no           text,
  description      text,
  auction_category text,
  consignor_name   text,
  consignor_ranch  text,
  buyer_name       text,
  buyer_ranch      text,
  amount           numeric not null default 0,
  donated          boolean not null default false,
  lot_fee          numeric,
  commission       numeric not null default 0,
  net              numeric not null default 0,
  buyer_paid       boolean not null default false,
  amount_paid      numeric not null default 0,
  delivered        boolean not null default false,
  check_no         text,
  check_date       text,
  created_at       timestamptz not null default now()
);

-- Event-wide settings (phase-d turns this into the white-label config row)
create table if not exists event_settings (
  event_year int not null default 2026,
  lot_fee    numeric not null default 50,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security. The service role (used by /api/*) bypasses RLS; the
-- browser's publishable key maps to `anon` and may ONLY insert registrations
-- — it can never read the roster, sponsors, lots, or settings.
alter table registrants    enable row level security;
alter table sponsors       enable row level security;
alter table lots           enable row level security;
alter table event_settings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'registrants' and policyname = 'registrants_public_insert'
  ) then
    create policy registrants_public_insert on registrants
      for insert to anon, authenticated with check (true);
  end if;
end $$;
