-- supabase/refinery.sql
-- LIQUID GOLD REFINERY — server persistence + conversion diary
-- (Merlin's corrected model, 2026-10-22: refinery state persists per
-- account; molten gold converts to GOLD BARS — the upgrade currency,
-- an internal uncapped loop — or to AETHER, the platform's true
-- currency, whose conversion leg is capped at 1000 gold-value/day).
--
-- *** NOT RUN *** — staged only. Executes when Merlin gives the SQL
-- green light. Until it runs, /api/economy/refinery/* answers
-- setupRequired and the refinery page plays locally with an honest
-- notice — nothing is fake-credited and nothing is fake-saved.
--
-- Two tables:
--   refinery_state       one row per user: the saved game (game_state +
--                        action-log tail, written by the client through
--                        the state route) and the server checkpoint
--                        (checkpoint_* columns, written ONLY by the
--                        claim route from its own replay — the client
--                        can never write them, so a checkpoint is always
--                        server-proven physics).
--   refinery_conversions append-only diary of AETHER conversions (the
--                        capped leg of the corrected model: molten gold
--                        -> bars is the refinery's internal loop and
--                        needs no diary; molten gold -> aether credits
--                        the server aether balance and is recorded
--                        here). One row per converted tranche of a mint;
--                        idempotency_key is unique. This diary is the
--                        daily-cap tally (1000 gold-value/day on the
--                        aether leg) and the per-mint progress record
--                        that makes partial conversions exact. The
--                        aether balance itself lives in the aether
--                        ledger (supabase/aether.sql, also staged).
--
-- Access model: RLS enabled with NO policies (the earth2 pattern). The
-- anon and authenticated roles can do nothing with these tables; every
-- read and write arrives through the /api/economy/refinery/* routes
-- with the service-role key, authenticated per user.

create table if not exists public.refinery_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  game_state jsonb not null default '{}'::jsonb,
  action_log jsonb not null default '[]'::jsonb,
  save_base jsonb,
  checkpoint_state jsonb,
  checkpoint_base_tick integer not null default 0,
  checkpoint_covered integer not null default 0,
  checkpoint_prefix_hash text,
  updated_at timestamptz not null default now()
);

create table if not exists public.refinery_conversions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mint_key text not null,
  mint_index integer not null,
  gold_value integer not null check (gold_value > 0),
  aether_credited integer not null default 0 check (aether_credited >= 0),
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists refinery_conversions_user_idx
  on public.refinery_conversions (user_id, created_at desc);
create index if not exists refinery_conversions_mint_idx
  on public.refinery_conversions (user_id, mint_key);

alter table public.refinery_state enable row level security;
alter table public.refinery_conversions enable row level security;

-- No policies on purpose: service-role only (see the header note).
