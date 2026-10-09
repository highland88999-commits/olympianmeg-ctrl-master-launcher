-- Cloud Phone v1 — product surface scaffolding.
-- DO NOT RUN without Merlin's explicit green light (standing SQL rule).
--
-- What this creates:
--   1. cloud_phone_catalog   — the installable app catalog (seeded below).
--      Public read; NO client write policies (Merlin curates the catalog).
--   2. cloud_phone_instances — one row per user per installed app.
--      Users can read/write ONLY their own rows (RLS).
--
-- What this does NOT create: the Android container runtime. Instance rows
-- track status (provisioning/running/stopped); the actual provisioning call
-- (Anbox Cloud or DIY containers) is a pending infra decision — see
-- app/cloud-phone/STATUS.md.

create table if not exists public.cloud_phone_catalog (
  app_id text primary key,
  name text not null,
  description text not null default '',
  category text not null default 'Utilities',
  apk_size_mb integer not null default 0,
  icon_url text,
  source text not null default 'fdroid'
    check (source in ('fdroid', 'direct-apk', 'publisher')),
  added_at timestamptz not null default now()
);

alter table public.cloud_phone_catalog enable row level security;

-- Public read so signed-out visitors can browse the catalog.
drop policy if exists "catalog public read" on public.cloud_phone_catalog;
create policy "catalog public read"
  on public.cloud_phone_catalog for select
  using (true);
-- No insert/update/delete policies: catalog is curated by Merlin only.

create table if not exists public.cloud_phone_instances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  app_id text not null references public.cloud_phone_catalog (app_id) on delete restrict,
  status text not null default 'provisioning'
    check (status in ('provisioning', 'running', 'stopped')),
  container_ref text,
  created_at timestamptz not null default now(),
  last_launched_at timestamptz,
  unique (user_id, app_id)
);

alter table public.cloud_phone_instances enable row level security;

drop policy if exists "instances owner read" on public.cloud_phone_instances;
create policy "instances owner read"
  on public.cloud_phone_instances for select
  using (auth.uid() = user_id);

drop policy if exists "instances owner insert" on public.cloud_phone_instances;
create policy "instances owner insert"
  on public.cloud_phone_instances for insert
  with check (auth.uid() = user_id);

drop policy if exists "instances owner update" on public.cloud_phone_instances;
create policy "instances owner update"
  on public.cloud_phone_instances for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "instances owner delete" on public.cloud_phone_instances;
create policy "instances owner delete"
  on public.cloud_phone_instances for delete
  using (auth.uid() = user_id);

-- Seed catalog: real open-source Android apps. apk_size_mb is approximate
-- and honest — what the app would occupy on-device (0 MB on Cloud Phone).
insert into public.cloud_phone_catalog (app_id, name, description, category, apk_size_mb, source) values
  ('vlc', 'VLC', 'Plays every video and audio format you throw at it.', 'Media', 40, 'fdroid'),
  ('firefox', 'Firefox', 'Private, extensible web browser from Mozilla.', 'Browser', 90, 'direct-apk'),
  ('signal', 'Signal', 'Encrypted messaging and calls, no ads, no trackers.', 'Communication', 70, 'direct-apk'),
  ('telegram', 'Telegram', 'Fast cloud messaging with channels and large groups.', 'Communication', 60, 'direct-apk'),
  ('nextcloud', 'Nextcloud', 'Your own private cloud for files, photos and docs.', 'Files', 45, 'fdroid'),
  ('antennapod', 'AntennaPod', 'Podcast manager and player, free forever.', 'Audio', 25, 'fdroid'),
  ('newpipe', 'NewPipe', 'Lightweight video streaming without the bloat.', 'Media', 12, 'fdroid'),
  ('keepassdx', 'KeePassDX', 'Offline password vault that never phones home.', 'Security', 15, 'fdroid'),
  ('osmand', 'OsmAnd', 'Offline maps and navigation for the whole planet.', 'Maps', 120, 'fdroid'),
  ('joplin', 'Joplin', 'Note-taking with sync you control.', 'Productivity', 35, 'direct-apk'),
  ('thunderbird-android', 'Thunderbird', 'Full-featured email from the Mozilla family.', 'Productivity', 20, 'fdroid'),
  ('syncthing', 'Syncthing', 'Peer-to-peer file sync with no cloud in the middle.', 'Files', 18, 'fdroid')
on conflict (app_id) do nothing;
