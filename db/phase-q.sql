-- db/phase-q.sql — Flag Grand Auction lots that include animal sales
-- ---------------------------------------------------------------------------
-- Grand Auction lots are commission-free by default (only the flat lot fee).
-- Lots that include animal sales DO owe the tiered commission, so organizers
-- tick a per-lot "animal sale" checkbox in the settlement grand-auction table.
-- When set, calc() applies the normal 9–11% commission to that lot. Nullable
-- default false — every existing lot keeps its current (no-commission) math.
-- Run once in the Supabase SQL editor. Safe to re-run.
-- ---------------------------------------------------------------------------
alter table lots add column if not exists animal_sale boolean not null default false;

-- Refresh PostgREST's schema cache so the new column is writable immediately.
notify pgrst, 'reload schema';
