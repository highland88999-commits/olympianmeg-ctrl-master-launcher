-- supabase/land-of-the-dead-souls.sql
-- SOUL ARRIVALS — the Land of the Dead's server-side field
-- (Merlin, 2026-11-16 ~04:02, Land of the Dead round, worker D).
--
-- *** NOT RUN *** — staged only, like supabase/souls.sql was
-- before it ran. Executes when Merlin gives the SQL green light.
-- Until it runs, kill-event arrivals are DEVICE-LOCAL only
-- (localStorage key 'olympus:land-of-the-dead:arrivals:v1', written
-- by recordSoulArrival in lib/land-of-the-dead/souls.js) — the
-- Land of the Dead page shows the seed + the device's own
-- arrivals, never a shared field.
--
-- WHY A NEW TABLE: the server soul ledger (supabase/souls.sql) is
-- a BALANCE ledger — it holds how many souls a user owns. It has
-- no row for *which* souls arrived in the Land of the Dead, and
-- no kill may mint a balance soul (no such decision exists), so
-- arrivals cannot be written through soul_apply(). This table is
-- the arrival record itself: one row per death that the wired
-- kill paths report, so the field is shared across devices
-- instead of per-device. A future API route (not built in this
-- round) inserts here with the service-role key; no client
-- insert/update/delete policies exist on purpose, mirroring
-- souls.sql. Reads are public: every arrival stands in the shared
-- field for everyone, like medusa_statues.
--
-- Depends on nothing: this table stands alone. (supabase/souls.sql
-- itself is still staged too — the balance ledger and this arrival
-- table are independent; either may run first.)

-- One row per reported death.
create table if not exists public.soul_arrivals (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  name text not null,
  origin text not null,
  died_at timestamptz not null,
  arrived_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists soul_arrivals_origin_idx on public.soul_arrivals (origin, created_at desc);
create index if not exists soul_arrivals_created_idx on public.soul_arrivals (created_at desc);
create index if not exists soul_arrivals_arrived_by_idx on public.soul_arrivals (arrived_by, created_at desc);

alter table public.soul_arrivals enable row level security;

-- The field is shared: every arrival is visible to everyone.
drop policy if exists soul_arrivals_public_read on public.soul_arrivals;
create policy soul_arrivals_public_read
  on public.soul_arrivals for select
  using (true);
