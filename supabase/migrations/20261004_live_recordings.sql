-- supabase/migrations/20261004_live_recordings.sql
--
-- LIVE RECORDINGS (Part 2: community video category)
-- ==================================================
-- *** AWAITS MERLIN'S EXPLICIT GREEN LIGHT — DO NOT RUN THIS YET. ***
-- Per Merlin's rule, all Supabase SQL runs only on his explicit go.
-- Hand him this file first (as a clean copy), he reviews/approves via
-- Gemini, then the coordinator executes and reports back.
--
-- What this creates:
--   live_recordings   community video posts (newest-first feed)
--   recording_likes   per-user like ledger; trigger keeps likes_count honest
--   tiktok_post_queue queue for the TikTok posting pipeline (owned by requester only)
--   storage bucket    live-recordings (public read, ≤100MB video uploads)
--   function          bump_recording_view(uuid) — SECURITY DEFINER so views
--                     can be counted under RLS without exposing writes
--
-- Identity table is public.profiles (personal row), and the TikTok handle
-- snapshot lives on live_recordings.tiktok_handle (frozen at post time so a
-- later profile handle change never rewrites attribution on old posts).

-- ============================================================ live_recordings
create table if not exists public.live_recordings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  video_url text not null,
  thumbnail_url text,
  tiktok_handle text,          -- snapshot of the poster's handle at post time
  created_at timestamptz not null default now(),
  view_count integer not null default 0,
  likes_count integer not null default 0
);

create index if not exists live_recordings_created_at_idx
  on public.live_recordings (created_at desc);

alter table public.live_recordings enable row level security;

drop policy if exists "live_recordings public read" on public.live_recordings;
create policy "live_recordings public read"
  on public.live_recordings for select
  using (true);

drop policy if exists "live_recordings owner insert" on public.live_recordings;
create policy "live_recordings owner insert"
  on public.live_recordings for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "live_recordings owner update" on public.live_recordings;
create policy "live_recordings owner update"
  on public.live_recordings for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "live_recordings owner delete" on public.live_recordings;
create policy "live_recordings owner delete"
  on public.live_recordings for delete
  to authenticated
  using (auth.uid() = user_id);

-- ============================================================ recording_likes
create table if not exists public.recording_likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  recording_id uuid not null references public.live_recordings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, recording_id)
);

alter table public.recording_likes enable row level security;

drop policy if exists "recording_likes public read" on public.recording_likes;
create policy "recording_likes public read"
  on public.recording_likes for select
  using (true);

drop policy if exists "recording_likes owner insert" on public.recording_likes;
create policy "recording_likes owner insert"
  on public.recording_likes for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "recording_likes owner delete" on public.recording_likes;
create policy "recording_likes owner delete"
  on public.recording_likes for delete
  to authenticated
  using (auth.uid() = user_id);

-- Trigger: keep live_recordings.likes_count in sync with recording_likes.
create or replace function public.sync_recording_likes_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (TG_OP = 'INSERT') then
    update public.live_recordings
      set likes_count = likes_count + 1
      where id = NEW.recording_id;
    return NEW;
  elsif (TG_OP = 'DELETE') then
    update public.live_recordings
      set likes_count = greatest(likes_count - 1, 0)
      where id = OLD.recording_id;
    return OLD;
  end if;
  return null;
end;
$$;

drop trigger if exists recording_likes_count_trigger on public.recording_likes;
create trigger recording_likes_count_trigger
  after insert or delete on public.recording_likes
  for each row execute function public.sync_recording_likes_count();

-- ============================================================ tiktok_post_queue
create table if not exists public.tiktok_post_queue (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references public.live_recordings(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'posted', 'failed')),
  created_at timestamptz not null default now(),
  posted_at timestamptz,
  error text
);

create index if not exists tiktok_post_queue_status_idx
  on public.tiktok_post_queue (status, created_at);

alter table public.tiktok_post_queue enable row level security;

-- No public access: the requester owns their rows.
drop policy if exists "tiktok_post_queue requester read" on public.tiktok_post_queue;
create policy "tiktok_post_queue requester read"
  on public.tiktok_post_queue for select
  to authenticated
  using (auth.uid() = requested_by);

drop policy if exists "tiktok_post_queue requester insert" on public.tiktok_post_queue;
create policy "tiktok_post_queue requester insert"
  on public.tiktok_post_queue for insert
  to authenticated
  with check (auth.uid() = requested_by);

-- ============================================================ views counter
-- SECURITY DEFINER so anyone (even anonymous) can count a view on a public
-- video without getting write access to the table itself.
create or replace function public.bump_recording_view(rec_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.live_recordings
    set view_count = view_count + 1
    where id = rec_id;
end;
$$;

revoke all on function public.bump_recording_view(uuid) from public;
grant execute on function public.bump_recording_view(uuid) to anon, authenticated;

-- ============================================================ storage bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'live-recordings',
  'live-recordings',
  true,
  104857600,
  '{video/mp4,video/quicktime,video/webm}'
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public read.
drop policy if exists "live-recordings public read" on storage.objects;
create policy "live-recordings public read"
  on storage.objects for select
  using (bucket_id = 'live-recordings');

-- Authenticated uploads, namespaced to the user's own folder.
drop policy if exists "live-recordings owner insert" on storage.objects;
create policy "live-recordings owner insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'live-recordings'
    and (storage.foldername(name))[1] = 'recordings'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- Owner deletes their own recordings.
drop policy if exists "live-recordings owner delete" on storage.objects;
create policy "live-recordings owner delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'live-recordings'
    and (storage.foldername(name))[1] = 'recordings'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
