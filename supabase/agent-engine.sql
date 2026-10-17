-- ============================================================
-- NEXUS VORTEX — Agent Engine (Phase 1)
-- Run ledger + per-agent engine flags
-- ============================================================
-- DO NOT EXECUTE without Merlin's explicit green light.
-- Phase 1 is READ-ONLY omniscience: the engine can look at
-- anything but changes nothing. Write tools arrive in Phase 2.
--
-- 'merlin' is a VIRTUAL agent ref in Phase 1 (handled in code
-- with a built-in system prompt); no user_agents row is needed.
-- Set is_merlin_agent=true on a real row if one is created later.
-- ============================================================

-- 1. Ledger: every tool call the engine makes, auditable.
create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  agent_ref text not null,              -- 'merlin' or user_agents.id
  tool_name text not null,
  args jsonb not null default '{}',
  result_summary text,
  created_at timestamptz not null default now()
);

create index if not exists agent_runs_user_idx on agent_runs (user_id, created_at desc);
create index if not exists agent_runs_agent_idx on agent_runs (agent_ref, created_at desc);

-- 2. Engine flags on user agents (additive, non-breaking).
alter table user_agents
  add column if not exists engine_enabled boolean not null default false,
  add column if not exists tools_allowed text[] not null default '{}',
  add column if not exists is_merlin_agent boolean not null default false;

-- 3. RLS: users may read their own runs. All writes go through
--    the service-role client in the API route (bypasses RLS).
alter table agent_runs enable row level security;

drop policy if exists agent_runs_read_own on agent_runs;
create policy agent_runs_read_own
  on agent_runs for select
  using (auth.uid() = user_id);

-- No insert/update/delete policies for the authenticated role:
-- the engine writes with the service-role key only.
