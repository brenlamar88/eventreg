-- db/phase-a.sql — Ticketing spine (Phase A)
-- ---------------------------------------------------------------------------
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: every statement is guarded.
--
-- What this adds:
--   1. registrants.ticket_token   — the QR ticket. Opaque 128-bit token,
--      base64url, unique. This is what the QR code encodes and what the door
--      scanner exchanges for a check-in.
--   2. registrants.checked_in_at  — when the ticket was scanned (audit).
--   3. UNIQUE on registrants.stripe_session_id — makes the Stripe webhook
--      idempotent. A webhook redelivery can no longer create a duplicate
--      paid registrant.
--   4. ticket_scans — append-only log of every scan attempt (accepted,
--      duplicate, invalid), for door audit and Phase B offline reconciliation.
--   5. Backfill: every existing registrant without a token gets one, so
--      already-sold tickets are scannable immediately.
-- ---------------------------------------------------------------------------

-- 1 + 2. Ticket columns
alter table registrants add column if not exists ticket_token text;
alter table registrants add column if not exists checked_in_at timestamptz;

-- Unique token (partial: rows may predate tokens until backfill runs)
create unique index if not exists registrants_ticket_token_key
  on registrants (ticket_token) where ticket_token is not null;

-- 3. Webhook idempotency. Partial unique: simulated/cash rows have no session.
create unique index if not exists registrants_stripe_session_id_key
  on registrants (stripe_session_id) where stripe_session_id is not null;

-- 4. Scan log (append-only; service role only — no client policies on purpose)
create table if not exists ticket_scans (
  id            bigint generated always as identity primary key,
  ticket_token  text,
  registrant_id bigint,
  result        text not null check (result in ('accepted','duplicate','invalid')),
  scanned_by    text,                         -- free-text device/staff label
  scanned_at    timestamptz not null default now()
);
alter table ticket_scans enable row level security;  -- no policies: service role only

-- 5. Backfill tokens for existing registrants (128-bit random, base64url)
update registrants
   set ticket_token = translate(encode(gen_random_bytes(16), 'base64'), '+/=', '-_')
 where ticket_token is null;
