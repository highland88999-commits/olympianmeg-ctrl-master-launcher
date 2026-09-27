-- ============================================================
-- ARES — Autonomous Response & Evidence System (Supabase schema)
-- Run this in the Supabase SQL editor.
--
-- PRIVACY RULE: raw IP addresses are NEVER stored. The app writes
-- SHA-256(ip + ARES_IP_SALT) into ip_hash columns only. Whitelisted
-- people are stored as hashes with a plain-English label.
-- ============================================================

-- Evidence log: every defensive event the system records.
create table if not exists public.ares_events (
  id bigint generated always as identity primary key,
  ip_hash text not null,                       -- SHA-256 hex, never a raw IP
  event_type text not null
    check (event_type in ('honeypot_hit','scanner_path','bot_blocked','rate_limited','blocked_ip_hit')),
  path text,                                   -- request path that triggered it
  user_agent text,                             -- truncated to 300 chars by the app
  details jsonb not null default '{}'::jsonb,  -- reasons, scores, whatever helps
  created_at timestamptz not null default now()
);
create index if not exists ares_events_created_idx on public.ares_events (created_at desc);
create index if not exists ares_events_type_idx on public.ares_events (event_type);
create index if not exists ares_events_iphash_idx on public.ares_events (ip_hash);

-- Temporary bans (Phalanx). Rows expire; the app treats missing/expired
-- rows as "not banned".
create table if not exists public.ares_blocks (
  ip_hash text primary key,                    -- SHA-256 hex, never a raw IP
  reason text not null,
  strikes integer not null default 1,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists ares_blocks_expires_idx on public.ares_blocks (expires_at);

-- Allowlist: hashes with human labels ("Miles", "Home"). The raw IPs
-- live only in server env (MILES_IP, ARES_HOME_IPS), never here.
create table if not exists public.ares_whitelist (
  ip_hash text primary key,
  label text not null,
  created_at timestamptz not null default now()
);

-- Runtime settings: module toggles the dashboard controls.
create table if not exists public.ares_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.ares_settings (key, value) values
  ('sentinel_enabled', 'true'),
  ('phalanx_enabled', 'true')
on conflict (key) do nothing;

-- ------------------------------------------------------------
-- Retention: 90-day purge of the evidence log.
-- Schedule with pg_cron if available:
--   select cron.schedule('ares-purge', '0 3 * * *',
--     $$select public.purge_old_ares_events()$$);
-- Otherwise call it manually now and then.
-- ------------------------------------------------------------
create or replace function public.purge_old_ares_events()
returns integer
language plpgsql
security definer
as $$
declare
  removed integer;
begin
  delete from public.ares_events
  where created_at < now() - interval '90 days';
  get diagnostics removed = row_count;
  delete from public.ares_blocks
  where expires_at < now() - interval '7 days';
  return removed;
end;
$$;

-- ------------------------------------------------------------
-- Row Level Security
-- Writes happen ONLY through server API routes using the service
-- role key (ingest + admin routes verify auth themselves).
-- No direct client writes. Dashboard reads go through the
-- authenticated /api/ares/* routes, never straight from the browser.
-- ------------------------------------------------------------
alter table public.ares_events enable row level security;
alter table public.ares_blocks enable row level security;
alter table public.ares_whitelist enable row level security;
alter table public.ares_settings enable row level security;

-- Service role bypasses RLS by default; these policies simply make
-- sure no other role can read or write the tables directly.
create policy "ares_events: no direct access"
  on public.ares_events for all
  using (false) with check (false);

create policy "ares_blocks: no direct access"
  on public.ares_blocks for all
  using (false) with check (false);

create policy "ares_whitelist: no direct access"
  on public.ares_whitelist for all
  using (false) with check (false);

create policy "ares_settings: no direct access"
  on public.ares_settings for all
  using (false) with check (false);
