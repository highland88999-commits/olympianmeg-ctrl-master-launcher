-- World Engine module tables (Olympian Meg master launcher)
-- Scoped credit ledger, saved generations, user settings, and Stripe
-- webhook idempotency log. Run this in the Supabase SQL editor.
--
-- Nothing here touches shared launcher tables.

-- ------------------------------------------------------- credit ledger --
create table if not exists public.world_engine_credits (
  user_id uuid primary key,
  tokens integer not null default 0 check (tokens >= 0),
  free_used integer not null default 0 check (free_used >= 0),
  free_reset_month text,
  updated_at timestamptz not null default now()
);

alter table public.world_engine_credits enable row level security;

drop policy if exists "world_engine_credits own read" on public.world_engine_credits;
create policy "world_engine_credits own read"
  on public.world_engine_credits
  for select
  using (auth.uid() = user_id);

-- No client writes: the ledger is only mutated by the server routes with the
-- service-role key (synthesize deductions, Stripe webhook credits).

-- ---------------------------------------------------- saved generations --
create table if not exists public.world_engine_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  category text not null
    check (category in ('world', 'weather', 'character', 'creature', 'vehicle', 'object', 'weapon', 'asset_link')),
  asset_url text not null default 'procedural_generation',
  generation_params jsonb,
  created_at timestamptz not null default now()
);

alter table public.world_engine_assets enable row level security;

drop policy if exists "world_engine_assets own read" on public.world_engine_assets;
create policy "world_engine_assets own read"
  on public.world_engine_assets
  for select
  using (auth.uid() = user_id);

drop policy if exists "world_engine_assets own insert" on public.world_engine_assets;
create policy "world_engine_assets own insert"
  on public.world_engine_assets
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "world_engine_assets own delete" on public.world_engine_assets;
create policy "world_engine_assets own delete"
  on public.world_engine_assets
  for delete
  using (auth.uid() = user_id);

-- ------------------------------------------------------------ settings --
create table if not exists public.world_engine_settings (
  user_id uuid primary key,
  quality text not null default 'high' check (quality in ('low', 'medium', 'high')),
  audio_enabled boolean not null default true,
  particle_limit integer not null default 5000 check (particle_limit between 1000 and 20000),
  density_cap numeric not null default 1.0 check (density_cap between 0.1 and 2.0),
  updated_at timestamptz not null default now()
);

alter table public.world_engine_settings enable row level security;

drop policy if exists "world_engine_settings own read" on public.world_engine_settings;
create policy "world_engine_settings own read"
  on public.world_engine_settings
  for select
  using (auth.uid() = user_id);

drop policy if exists "world_engine_settings own upsert" on public.world_engine_settings;
create policy "world_engine_settings own upsert"
  on public.world_engine_settings
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "world_engine_settings own update" on public.world_engine_settings;
create policy "world_engine_settings own update"
  on public.world_engine_settings
  for update
  using (auth.uid() = user_id);

-- ------------------------------------------- stripe webhook idempotency --
-- Service-role only: clients never read or write this table.
create table if not exists public.world_engine_events (
  id text primary key,
  type text not null,
  user_id uuid,
  tier_id text,
  processed_at timestamptz not null default now()
);

alter table public.world_engine_events enable row level security;
-- No client policies: RLS enabled with zero policies denies all client access.
