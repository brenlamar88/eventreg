-- db/phase-d.sql — White-label event configuration (Phase D)
-- ---------------------------------------------------------------------------
-- Run once in the Supabase SQL editor, AFTER db/phase-c.sql. Safe to re-run.
--
-- The event's branding, copy, and pricing become CONFIG, not code: one
-- event_settings row drives every page (names, tagline, logo, colors, ticket
-- price, donation presets). A new customer is a new row + the Event Setup
-- screen — never a fork of the codebase. Every column is nullable: NULL means
-- "use the built-in default" (the current Boil on the Bend look), so running
-- this migration changes nothing visible.
-- ---------------------------------------------------------------------------

alter table event_settings add column if not exists event_name         text;
alter table event_settings add column if not exists org_name           text;
alter table event_settings add column if not exists org_short          text;   -- short name used in copy ("Donation to EWA-LA")
alter table event_settings add column if not exists tagline            text;
alter table event_settings add column if not exists date_label         text;
alter table event_settings add column if not exists venue              text;
alter table event_settings add column if not exists city               text;
alter table event_settings add column if not exists ticket_name        text;
alter table event_settings add column if not exists ticket_price       numeric;
alter table event_settings add column if not exists donation_presets   jsonb;  -- e.g. [25,50,100]
alter table event_settings add column if not exists logo_url           text;
alter table event_settings add column if not exists color_primary      text;   -- default #123C2E (pine)
alter table event_settings add column if not exists color_primary_dark text;   -- default #0C2A20
alter table event_settings add column if not exists color_accent       text;   -- default #B9842B (gold)
alter table event_settings add column if not exists color_background   text;   -- default #F4EFE6 (bone)

-- One row per event year; make sure the current year's row exists so the
-- Event Setup screen always has something to update.
create unique index if not exists event_settings_event_year_key
  on event_settings (event_year);
insert into event_settings (event_year)
  values (2026)
  on conflict (event_year) do nothing;

-- Public bucket for the event logo (uploaded via /api/event-logo, service
-- role only — no client write access).
insert into storage.buckets (id, name, public)
  values ('event-assets', 'event-assets', true)
  on conflict (id) do nothing;
