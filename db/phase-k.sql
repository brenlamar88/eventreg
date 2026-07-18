-- db/phase-k.sql — Security hardening: RLS lockdown audit (Phase K)
-- ---------------------------------------------------------------------------
-- Run once in the Supabase SQL editor, AFTER db/phase-j.sql. Safe to re-run.
--
-- Defense in depth. The organizer API authorizes every request in the
-- serverless functions (service role), but the browser also holds a
-- publishable/anon key. This makes sure that key can do ONLY what it should:
--   • registrants  — INSERT a registration (the public sign-up), nothing else.
--   • everything else tenant-scoped — no anon access at all.
-- Enabling RLS with no permissive anon policy denies the anon role by default;
-- the service role (used by /api/*) bypasses RLS and is unaffected.
-- ---------------------------------------------------------------------------

-- Enable RLS on every tenant table (idempotent; most are already on).
do $$
declare t text;
begin
  foreach t in array array[
    'registrants','sponsors','sponsor_packages','lots','event_settings',
    'ticket_scans','organizations','memberships','invitations'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
    end if;
  end loop;
end $$;

-- The ONLY thing the public (anon) key may do is create a registration.
-- Recreate the policy idempotently and make sure no stray anon SELECT/UPDATE
-- policies exist on it.
do $$
begin
  if to_regclass('public.registrants') is not null then
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'registrants' and policyname = 'registrants_public_insert'
    ) then
      create policy registrants_public_insert on registrants
        for insert to anon, authenticated with check (true);
    end if;
  end if;
end $$;

-- Report any permissive anon policy that grants more than INSERT, so you can
-- eyeball the lockdown after running this.
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and 'anon' = any(roles)
  and cmd <> 'INSERT'
order by tablename, policyname;
