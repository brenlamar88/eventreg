-- db/phase-p.sql — Record the Square payment that settled a lot
-- ---------------------------------------------------------------------------
-- Online lot payments moved from Stripe to Square (Payment Links). The Square
-- webhook (api/square-webhook.js) marks a lot buyer_paid and stores the Square
-- payment id here for reconciliation and to make the write traceable. Nullable
-- and additive — cash/check settlements simply leave it null.
-- Run once in the Supabase SQL editor. Safe to re-run.
-- ---------------------------------------------------------------------------
alter table lots add column if not exists square_payment_id text;

-- Refresh PostgREST's schema cache so the new column is writable immediately.
notify pgrst, 'reload schema';
