-- db/phase-r.sql — Per-lot quantity
-- ---------------------------------------------------------------------------
-- Some lots sell as multiples of an identical item (e.g. 3 semen straws). Add
-- a quantity so `amount` is the per-unit price and the lot total is
-- amount × quantity. Every monetary figure — fee, commission, net, and the
-- consignor/buyer ledger totals — derives from that line total. Defaults to 1,
-- so every existing lot keeps its current math (amount × 1 = amount).
-- Run once in the Supabase SQL editor. Safe to re-run.
-- ---------------------------------------------------------------------------
alter table lots add column if not exists quantity integer not null default 1;

-- Refresh PostgREST's schema cache so the new column is writable immediately.
notify pgrst, 'reload schema';
