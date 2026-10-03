-- supabase/ui-state.sql — per-account UI state (Muse FAB position, etc.)
--
-- Storage: public.account_state(user_id PK, preferences jsonb, state jsonb, updated_at)
-- UI preferences live under preferences.<key>, e.g. preferences.muse_fab = {"x":0.9,"y":0.8}
-- with x/y as viewport fractions (0..1) of the button's top-left corner.
--
-- Executed 2026-10-02 via the Supabase Management API. Idempotent.

CREATE OR REPLACE FUNCTION public.merge_account_preferences(p_user_id uuid, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefs jsonb;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'p_patch must be a JSON object';
  END IF;
  INSERT INTO public.account_state(user_id, preferences, state, updated_at)
  VALUES (p_user_id, p_patch, '{}'::jsonb, now())
  ON CONFLICT (user_id) DO UPDATE SET
    preferences = public.account_state.preferences || EXCLUDED.preferences,
    updated_at = now();
  SELECT preferences INTO v_prefs FROM public.account_state WHERE user_id = p_user_id;
  RETURN v_prefs;
END
$$;
