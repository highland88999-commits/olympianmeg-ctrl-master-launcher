-- supabase/profiles.sql
-- USER PROFILES: every account gets TWO public profiles — Personal and Business.
-- Run this in the Supabase SQL editor (after supabase/agora.sql).
--
-- What this creates:
--   profiles        one row per (user, type); username is unique across both
--   art_pieces      gallery items on a profile; optional Stripe sale price
--   profile_posts   short posts on a profile timeline
--   art_orders      ledger of completed art checkouts (seller attribution for payouts)
--   storage bucket  profile-media (public read) for avatars / covers / art / posts
--   auth trigger    new signups automatically get both profiles
--
-- Identity note: profiles are keyed to auth.users.id, the same sign-in the
-- rest of the launcher uses. The old local-first rider profile (lib/profile.js,
-- /profile, /user-profile) is untouched — this is the new PUBLIC, cloud
-- profile system for display, art sales, posts, and sharing.

-- ============================================================ profiles
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('personal', 'business')),
  username text not null,
  display_name text not null default '',
  bio text not null default '',
  avatar_url text,
  profile_video_url text,
  cover_url text,
  cover_kind text not null default 'image' check (cover_kind in ('image', 'video')),
  website_urls jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, type),
  unique (username)
);

create index if not exists profiles_username_idx on public.profiles (username);
create index if not exists profiles_user_idx on public.profiles (user_id);

alter table public.profiles enable row level security;

drop policy if exists "profiles public read" on public.profiles;
create policy "profiles public read"
  on public.profiles for select using (true);

-- Writes go through the service-role API routes (and the signup trigger).
-- No direct client insert/update/delete: the anon key can only read.
drop policy if exists "profiles owner update" on public.profiles;
create policy "profiles owner update"
  on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================ art pieces
create table if not exists public.art_pieces (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null default '',
  media_url text not null,
  media_kind text not null default 'image' check (media_kind in ('image', 'video')),
  price_cents int check (price_cents is null or price_cents >= 0),
  for_sale boolean not null default false,
  sold_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists art_pieces_profile_idx on public.art_pieces (profile_id, created_at desc);

alter table public.art_pieces enable row level security;

drop policy if exists "art_pieces public read" on public.art_pieces;
create policy "art_pieces public read"
  on public.art_pieces for select using (true);

-- ============================================================ profile posts
create table if not exists public.profile_posts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  media_url text,
  media_kind text check (media_kind is null or media_kind in ('image', 'video')),
  created_at timestamptz not null default now()
);

create index if not exists profile_posts_profile_idx on public.profile_posts (profile_id, created_at desc);

alter table public.profile_posts enable row level security;

drop policy if exists "profile_posts public read" on public.profile_posts;
create policy "profile_posts public read"
  on public.profile_posts for select using (true);

-- ============================================================ art orders (ledger)
-- One row per completed art checkout. seller_user_id + amount_cents is the
-- payout source of truth: sellers are paid out from the platform account
-- (manual settlement now; Stripe Connect later — see BUILD_NOTES).
-- RLS enabled with NO policies: only the service role (webhook) can write.
create table if not exists public.art_orders (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text not null unique,
  art_piece_id uuid references public.art_pieces(id) on delete set null,
  seller_user_id uuid references auth.users(id) on delete set null,
  buyer_user_id uuid references auth.users(id) on delete set null,
  amount_cents int not null,
  currency text not null default 'cad',
  status text not null default 'paid',
  created_at timestamptz not null default now()
);

alter table public.art_orders enable row level security;

-- ============================================================ updated_at touch
create or replace function public.profiles_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.profiles_touch_updated_at();

-- ============================================================ auto-create on signup
-- Every new auth.users row gets a Personal AND a Business profile.
-- Username defaults to a sanitized email prefix; collisions get -2, -3, ...
create or replace function public.profiles_create_for_new_user()
returns trigger language plpgsql security definer as $$
declare
  base text;
  candidate text;
  n int := 0;
begin
  base := lower(regexp_replace(split_part(coalesce(new.email, 'user'), '@', 1), '[^a-z0-9]+', '-', 'g'));
  base := regexp_replace(base, '^-+|-+$', '', 'g');
  if base = '' or length(base) < 2 then base := 'user'; end if;
  base := left(base, 24);

  candidate := base;
  loop
    begin
      -- Reserve the username once; both profile rows share it.
      -- (unique(username) guard: loop until free)
      perform 1 from public.profiles where username = candidate;
      if found then
        n := n + 1;
        candidate := base || '-' || n::text;
        continue;
      end if;
      insert into public.profiles (user_id, type, username, display_name)
      values
        (new.id, 'personal', candidate, coalesce(new.raw_user_meta_data->>'username', new.raw_user_meta_data->>'callsign', split_part(coalesce(new.email, 'user'), '@', 1))),
        (new.id, 'business', candidate || '-biz', coalesce(new.raw_user_meta_data->>'username', split_part(coalesce(new.email, 'user'), '@', 1)) || ' Studio');
      exit;
    exception when unique_violation then
      n := n + 1;
      candidate := base || '-' || n::text;
    end;
  end loop;
  return new;
end;
$$;

drop trigger if exists profiles_on_signup on auth.users;
create trigger profiles_on_signup
  after insert on auth.users
  for each row execute function public.profiles_create_for_new_user();

-- ============================================================ storage bucket
insert into storage.buckets (id, name, public)
values ('profile-media', 'profile-media', true)
on conflict (id) do nothing;

-- Public read: avatars, covers, art, and post media are meant to be seen.
drop policy if exists "profile-media public read" on storage.objects;
create policy "profile-media public read"
  on storage.objects for select
  using (bucket_id = 'profile-media');

-- Uploads happen through service-role signed URLs minted by
-- /api/profiles/upload-url (owner-verified server-side), so no client
-- insert/update/delete storage policies are needed.
