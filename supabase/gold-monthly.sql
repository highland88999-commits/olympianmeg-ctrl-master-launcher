-- ============================================================
-- gold-monthly.sql — monthly-respawn gold source gating
-- Worker D (economy-skins), Tron batch, 2026-10-02
-- Idempotent: safe to re-run via query-file.
-- ============================================================
-- All gold sources respawn MONTHLY per user. Each user gets a fresh
-- source each calendar month; collecting removes it until the next month.
--
-- Writes are service-role only (the /api/gold/collect route inserts with
-- the service key). Clients get SELECT on their own rows for UI state
-- ("collected this month" badges) but can never insert/update/delete.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.gold_collect (
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_id    text        NOT NULL,
  month        text        NOT NULL,            -- 'YYYY-MM', UTC calendar month
  collected_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, source_id, month),
  CONSTRAINT gold_collect_month_format CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT gold_collect_source_id_not_empty CHECK (length(trim(source_id)) > 0)
);

CREATE INDEX IF NOT EXISTS gold_collect_user_month_idx
  ON public.gold_collect (user_id, month);

ALTER TABLE public.gold_collect ENABLE ROW LEVEL SECURITY;

-- Owner read-only: a user may SELECT their own collect rows (for badges /
-- "already collected" UI state). No client writes: INSERT/UPDATE/DELETE go
-- through the service role only (supabase gold.sql convention).
DROP POLICY IF EXISTS "gold_collect_owner_read" ON public.gold_collect;
CREATE POLICY "gold_collect_owner_read"
  ON public.gold_collect
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Defensive: explicitly deny client writes even if a permissive default
-- were ever applied at the table level. (Service role bypasses RLS, so
-- the collect route is unaffected.)
DROP POLICY IF EXISTS "gold_collect_no_client_insert" ON public.gold_collect;
CREATE POLICY "gold_collect_no_client_insert"
  ON public.gold_collect
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "gold_collect_no_client_update" ON public.gold_collect;
CREATE POLICY "gold_collect_no_client_update"
  ON public.gold_collect
  FOR UPDATE
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS "gold_collect_no_client_delete" ON public.gold_collect;
CREATE POLICY "gold_collect_no_client_delete"
  ON public.gold_collect
  FOR DELETE
  TO authenticated
  USING (false);
