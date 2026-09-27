-- supabase/agora.sql
-- AGORA: the community town square. Scoped tables with RLS.
-- Run this in the Supabase SQL editor.
--
-- Identity note: agora_profiles is keyed to auth.users.id, the same sign-in
-- the rest of the launcher uses. OASIS keeps its own oasis_profiles table for
-- gaming identity (handle, avatar); AGORA keeps display name + bio for
-- community identity. One login, two facets — no competing auth systems.

-- ---------------------------------------------------------------- profiles
create table if not exists public.agora_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  bio text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.agora_profiles enable row level security;

drop policy if exists "agora_profiles public read" on public.agora_profiles;
create policy "agora_profiles public read"
  on public.agora_profiles for select using (true);

drop policy if exists "agora_profiles owner write" on public.agora_profiles;
create policy "agora_profiles owner write"
  on public.agora_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------------ posts
create table if not exists public.agora_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  category text not null default 'civic',
  like_count int not null default 0,
  comment_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agora_posts_category_idx on public.agora_posts (category, created_at desc);
create index if not exists agora_posts_user_idx on public.agora_posts (user_id, created_at desc);

alter table public.agora_posts enable row level security;

drop policy if exists "agora_posts public read" on public.agora_posts;
create policy "agora_posts public read"
  on public.agora_posts for select using (true);

drop policy if exists "agora_posts signed-in create" on public.agora_posts;
create policy "agora_posts signed-in create"
  on public.agora_posts for insert
  with check (auth.uid() = user_id);

drop policy if exists "agora_posts owner edit" on public.agora_posts;
create policy "agora_posts owner edit"
  on public.agora_posts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "agora_posts owner delete" on public.agora_posts;
create policy "agora_posts owner delete"
  on public.agora_posts for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------- comments
create table if not exists public.agora_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.agora_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists agora_comments_post_idx on public.agora_comments (post_id, created_at);

alter table public.agora_comments enable row level security;

drop policy if exists "agora_comments public read" on public.agora_comments;
create policy "agora_comments public read"
  on public.agora_comments for select using (true);

drop policy if exists "agora_comments signed-in create" on public.agora_comments;
create policy "agora_comments signed-in create"
  on public.agora_comments for insert
  with check (auth.uid() = user_id);

drop policy if exists "agora_comments owner delete" on public.agora_comments;
create policy "agora_comments owner delete"
  on public.agora_comments for delete
  using (auth.uid() = user_id);

-- -------------------------------------------------------------------- likes
create table if not exists public.agora_likes (
  post_id uuid not null references public.agora_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.agora_likes enable row level security;

drop policy if exists "agora_likes public read" on public.agora_likes;
create policy "agora_likes public read"
  on public.agora_likes for select using (true);

drop policy if exists "agora_likes owner toggle" on public.agora_likes;
create policy "agora_likes owner toggle"
  on public.agora_likes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- --------------------------------------- denormalized counters via trigger
-- like_count / comment_count stay accurate server-side; clients never write
-- them, so post UPDATE policies stay owner-only.

create or replace function public.agora_bump_counters()
returns trigger language plpgsql security definer as $$
begin
  if TG_TABLE_NAME = 'agora_likes' then
    if TG_OP = 'INSERT' then
      update public.agora_posts set like_count = like_count + 1 where id = NEW.post_id;
    elsif TG_OP = 'DELETE' then
      update public.agora_posts set like_count = greatest(like_count - 1, 0) where id = OLD.post_id;
    end if;
  elsif TG_TABLE_NAME = 'agora_comments' then
    if TG_OP = 'INSERT' then
      update public.agora_posts set comment_count = comment_count + 1 where id = NEW.post_id;
    elsif TG_OP = 'DELETE' then
      update public.agora_posts set comment_count = greatest(comment_count - 1, 0) where id = OLD.post_id;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists agora_likes_counter on public.agora_likes;
create trigger agora_likes_counter
  after insert or delete on public.agora_likes
  for each row execute function public.agora_bump_counters();

drop trigger if exists agora_comments_counter on public.agora_comments;
create trigger agora_comments_counter
  after insert or delete on public.agora_comments
  for each row execute function public.agora_bump_counters();
