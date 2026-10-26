-- 20261026_wallet_lock_2027.sql
-- Move the doomsday / accumulative lock (and the launch target with it)
-- from Dec 11, 2026 to Dec 11, 2027 (Merlin, 2026-10-26: regulatory
-- runway — FINTRAC and the rest).
--
-- The original migration (20261004_wallet_ledger.sql) seeded
-- wallet_settings.withdrawals_locked_until with '2026-12-11T07:00:00Z'
-- (on conflict do nothing), so the live /api/wallet/lock feed reads that
-- row first and the compiled constant in lib/wallet/lock.js only backs it
-- up. Updating the constant alone would leave the live clock counting to
-- 2026 while the label says 2027 — this row update is what actually moves
-- the live countdown. Run in the Supabase dashboard SQL Editor.
--
-- 00:00 America/Edmonton (MST, UTC-7) on Dec 11, 2027 = 07:00 UTC.

update public.wallet_settings
set value = '2027-12-11T07:00:00Z'
where key = 'withdrawals_locked_until';
