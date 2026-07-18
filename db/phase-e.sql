-- db/phase-e.sql — Multi-event support (Phase E)
-- ---------------------------------------------------------------------------
-- Run once in the Supabase SQL editor, AFTER db/phase-d.sql. Safe to re-run.
--
-- One deployment, many events. "An event" = an event_settings row, now keyed
-- by a URL-safe slug (event_id) instead of the year. Every data table gains
-- the same event_id; existing rows are backfilled to 'boil85', which stays
-- the default event, so nothing changes for the current site.
--
-- URLs select the event: /?event=<id> (registration, stations, ticket
-- pages, organizer apps). No param = the default event.
-- ---------------------------------------------------------------------------

-- 1. event_settings becomes the events table, keyed by slug.
alter table event_settings add column if not exists event_id  text;
alter table event_settings add column if not exists is_default boolean not null default false;
update event_settings set event_id = 'boil85', is_default = true
  where event_id is null and event_year = 2026;
create unique index if not exists event_settings_event_id_key
  on event_settings (event_id);
-- The per-year uniqueness must go — two events can share a year now.
drop index if exists event_settings_event_year_key;

-- 2. Scope every data table by event_id (registrants already have it).
alter table sponsors         add column if not exists event_id text;
alter table lots             add column if not exists event_id text;
alter table sponsor_packages add column if not exists event_id text;
update sponsors         set event_id = 'boil85' where event_id is null;
update lots             set event_id = 'boil85' where event_id is null;
update sponsor_packages set event_id = 'boil85' where event_id is null;

create index if not exists registrants_event_id_idx      on registrants (event_id);
create index if not exists sponsors_event_id_idx         on sponsors (event_id);
create index if not exists lots_event_id_idx             on lots (event_id);
create index if not exists sponsor_packages_event_id_idx on sponsor_packages (event_id);
