-- db/phase-b.sql — Sponsor packages, benefit checklists, logo storage,
--                  and live/silent auction separation (Phase B)
-- ---------------------------------------------------------------------------
-- Run once in the Supabase SQL editor, AFTER db/phase-a.sql.
-- Safe to re-run: every statement is guarded.
-- ---------------------------------------------------------------------------

-- 1. Sponsor packages: tiers become data the organizer creates FIRST, then
--    sponsors are added into a package. `benefits` is a JSON array of strings
--    (e.g. ["5 registrations","Full-page program ad","1 table"]) that seeds
--    each sponsor's delivery checklist.
create table if not exists sponsor_packages (
  id          uuid primary key default gen_random_uuid(),
  event_year  int not null default 2026,
  name        text not null,
  price       numeric not null default 0,
  description text,
  benefits    jsonb not null default '[]'::jsonb,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
alter table sponsor_packages enable row level security;  -- service role only

-- 2. Sponsors link to a package and track per-benefit delivery + logo asset.
--    benefits_done is an object keyed by benefit text: {"1 table": true}
alter table sponsors add column if not exists package_id uuid references sponsor_packages(id) on delete set null;
alter table sponsors add column if not exists benefits_done jsonb not null default '{}'::jsonb;
alter table sponsors add column if not exists logo_url text;

-- 3. Public storage bucket for sponsor logos (uploaded via /api/sponsor-logo,
--    which uses the service role — no client write access is granted).
insert into storage.buckets (id, name, public)
  values ('sponsor-logos', 'sponsor-logos', true)
  on conflict (id) do nothing;

-- 4. Live vs. silent auction: every lot carries a sale type. Existing lots
--    default to Live.
alter table lots add column if not exists sale_type text not null default 'Live';
