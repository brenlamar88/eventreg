-- db/phase-i.sql — Stripe Connect payouts + Billing (Phase I)
-- ---------------------------------------------------------------------------
-- Run once in the Supabase SQL editor, AFTER db/phase-h.sql. Safe to re-run.
--
-- Adds the per-organization Stripe columns for the two money flows:
--   • CONNECT (their ticket/auction revenue): the platform collects the money,
--     keeps a platform fee, and pays out to the org's connected Express
--     account. stripe_account_id + stripe_payouts_enabled gate the routing;
--     platform_fee_pct / platform_fee_flat_cents set your cut per charge.
--   • BILLING (your SaaS fee): stripe_customer_id + subscription_status track
--     the org's subscription to your platform.
--
-- stripe_account_id / stripe_customer_id already exist from phase-h; the rest
-- are added here. All nullable; nothing charges until an org is onboarded.
-- ---------------------------------------------------------------------------

alter table organizations add column if not exists stripe_payouts_enabled boolean not null default false;
alter table organizations add column if not exists platform_fee_pct        numeric;      -- e.g. 0.05 = 5%
alter table organizations add column if not exists platform_fee_flat_cents integer not null default 0;
alter table organizations add column if not exists subscription_status     text;         -- active | past_due | canceled | null
