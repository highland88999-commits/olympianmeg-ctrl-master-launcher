-- supabase/muse-messages.sql
-- Muse portal (floating universal-helper chat) + in-house console inbox.
-- Run in the Supabase SQL editor or via the Management API. Idempotent.

create table if not exists public.muse_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users (id) on delete set null,
  page_url text not null default '',
  status text not null default 'open'
    check (status in ('open', 'replied', 'closed')),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table if not exists public.muse_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.muse_threads (id) on delete cascade,
  sender text not null check (sender in ('user', 'muse', 'merlin')),
  body text not null check (char_length(body) between 1 and 4000),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists muse_messages_thread_idx
  on public.muse_messages (thread_id, created_at);
create index if not exists muse_threads_last_msg_idx
  on public.muse_threads (last_message_at desc);
create index if not exists muse_threads_user_idx
  on public.muse_threads (user_id);

alter table public.muse_threads enable row level security;
alter table public.muse_messages enable row level security;

-- Writes and reads happen server-side with the service-role key
-- (app/api/muse/*). No client policies by design: thread ids are
-- unguessable capabilities held in the visitor's own browser, and the
-- API is the only reader/writer.
