-- db/phase-o.sql — Swap event_settings primary key from event_year to event_id
-- ---------------------------------------------------------------------------
-- The original table had PRIMARY KEY (event_year) — one event per year.
-- Phase-e added event_id for multi-event support but never changed the PK,
-- so inserting a second event in the same year failed with a PK violation.
-- This migration promotes event_id to the primary key.
-- Safe to re-run.
-- ---------------------------------------------------------------------------

-- Backfill any null event_id rows.
update event_settings set event_id = 'boil85' where event_id is null;

-- Drop the old event_year PK.
alter table event_settings drop constraint if exists event_settings_pkey;

-- Promote event_id to NOT NULL + primary key.
alter table event_settings alter column event_id set not null;
alter table event_settings add primary key (event_id);

-- Drop the now-redundant unique index (PK implies uniqueness).
drop index if exists event_settings_event_id_key;
