-- db/phase-c.sql — Offline door reconciliation (Phase C)
-- ---------------------------------------------------------------------------
-- Run once in the Supabase SQL editor, AFTER db/phase-b.sql.
-- Safe to re-run.
--
-- Offline scans are queued on the device and replayed through
-- /api/scan-batch when connectivity returns. Each queued scan carries a
-- client-generated op id; logging it uniquely in ticket_scans makes the
-- replay idempotent — a retried batch gets its recorded verdicts echoed back
-- instead of being re-judged (which could misreport our own accepted scan as
-- a duplicate).
-- ---------------------------------------------------------------------------

alter table ticket_scans add column if not exists client_op_id text;

create unique index if not exists ticket_scans_client_op_id_key
  on ticket_scans (client_op_id) where client_op_id is not null;
