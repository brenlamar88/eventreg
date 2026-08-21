-- db/phase-n.sql — Add primary key to event_settings
-- ---------------------------------------------------------------------------
-- event_settings was created without a primary key. PostgREST requires a PK
-- to allow PATCH/POST mutations via the REST API; without one it rejects all
-- writes with a 400. This migration adds a surrogate UUID PK idempotently.
-- Run once in the Supabase SQL editor. Safe to re-run.
-- ---------------------------------------------------------------------------

do $$
begin
  -- Add id column if it doesn't exist yet
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='event_settings' and column_name='id'
  ) then
    alter table event_settings add column id uuid default gen_random_uuid();
  end if;

  -- Backfill any rows that have no id
  update event_settings set id = gen_random_uuid() where id is null;

  -- Make NOT NULL
  alter table event_settings alter column id set not null;

  -- Add PK only if one doesn't already exist
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema='public' and table_name='event_settings' and constraint_type='PRIMARY KEY'
  ) then
    alter table event_settings add primary key (id);
  end if;
end $$;
