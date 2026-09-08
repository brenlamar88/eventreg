-- db/phase-l.sql — Demo-request leads for the marketing site (Phase L)
-- ---------------------------------------------------------------------------
-- Run once in the Supabase SQL editor, AFTER db/phase-k.sql. Safe to re-run.
--
-- The public "Book a demo" form on the marketing landing page writes a lead
-- here. The public (anon) key may INSERT a lead and nothing else; reading the
-- pipeline is platform-admin only (via /api/leads, service role).
-- ---------------------------------------------------------------------------

create table if not exists leads (
  id             uuid primary key default gen_random_uuid(),
  name           text,
  email          text not null,
  org_name       text,
  phone          text,
  event_type     text,          -- e.g. "banquet + auction", "registration only"
  message        text,
  preferred_time text,          -- free-text when they'd like the demo
  source         text,          -- landing page / referral / etc.
  status         text not null default 'new',   -- new | contacted | booked | won | lost
  created_at     timestamptz not null default now()
);
alter table leads enable row level security;

-- Anon may only create a lead (the public form). No anon read/update.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'leads' and policyname = 'leads_public_insert'
  ) then
    create policy leads_public_insert on leads
      for insert to anon, authenticated with check (true);
  end if;
end $$;
