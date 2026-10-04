-- supabase/migrations/20261004_trifold_fallback_pages.sql
-- TRIFOLD upgrade (2026-10-04): late-post fallback pipeline + Stripe Connect
-- revenue split + studio authoring data model.
--
--   * trifold_editions:
--       page_count / pages / og_file_url / og_file_type — the studio's
--         paginated authoring model. pages = jsonb
--         { og: [page], negative: [page], positive: [page] },
--         page = { blocks: [block] },
--         block = { id, kind: 'text'|'image'|'video',
--                   text?, url?, embed_url?, caption?, source? }.
--         Legacy fields (og_stories, negative_fiction, positive_fiction)
--         stay the source of truth for text; pages are the presentation.
--       pipeline_note — the fallback cron's failure notes (best-effort).
--       Full pipeline status lifecycle:
--         draft -> review -> devan_submitted | ai_generated -> ready -> published
--         (Tue 3AM checkpoint prefers devan_submitted over ai_generated.)
--   * trifold_settings: Devan's Stripe Connect account id + onboarded flag.
--   * trifold_revenue_log: one row per paid invoice — gross, platform fee
--     (Merlin's $1.00), Devan's share ($4.99).
--   * storage bucket trifold-uploads (public read; writes service-role only,
--     50MB cap, restricted mime types).
--
-- Idempotent: every statement is guarded (add column if not exists, drop
-- policy if exists, on conflict do nothing). The original migration used an
-- inline check on status, so the constraint name is auto-generated — a DO
-- block drops ANY check constraint mentioning status before the new one is
-- added.

-- ---------------------------------------------------------------- editions
alter table public.trifold_editions
  add column if not exists page_count int not null default 3;
alter table public.trifold_editions
  add column if not exists pages jsonb not null default '{"og":[],"negative":[],"positive":[]}'::jsonb;
alter table public.trifold_editions
  add column if not exists og_file_url text not null default '';
alter table public.trifold_editions
  add column if not exists og_file_type text not null default '';
alter table public.trifold_editions
  add column if not exists pipeline_note text not null default '';

-- page_count stays within the studio's stepper range (1..40).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.trifold_editions'::regclass
      and conname = 'trifold_editions_page_count_check'
  ) then
    alter table public.trifold_editions
      add constraint trifold_editions_page_count_check
      check (page_count between 1 and 40);
  end if;
end $$;

-- Widen the status lifecycle for the fallback pipeline.
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.trifold_editions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute 'alter table public.trifold_editions drop constraint ' || quote_ident(c.conname);
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.trifold_editions'::regclass
      and conname = 'trifold_editions_status_check'
  ) then
    alter table public.trifold_editions
      add constraint trifold_editions_status_check
      check (status in ('draft','review','devan_submitted','ai_generated','ready','published'));
  end if;
end $$;

-- ---------------------------------------------------------------- settings
alter table public.trifold_settings
  add column if not exists connect_account_id text not null default '';
alter table public.trifold_settings
  add column if not exists connect_onboarded boolean not null default false;

-- ------------------------------------------------------------ revenue log
create table if not exists public.trifold_revenue_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  stripe_invoice_id text not null,
  stripe_subscription_id text,
  amount_cents int not null default 0,
  fee_cents int not null default 0,
  devan_cents int not null default 0,
  currency text not null default 'usd'
);
create unique index if not exists trifold_revenue_log_invoice_uidx
  on public.trifold_revenue_log (stripe_invoice_id);

alter table public.trifold_revenue_log enable row level security;

-- Deny-all for anon/authenticated (service role bypasses RLS; the webhook
-- writes through the service client). Mirrors the other private tables.
drop policy if exists trifold_revenue_log_deny on public.trifold_revenue_log;
create policy trifold_revenue_log_deny
  on public.trifold_revenue_log for all
  using (false) with check (false);

-- ------------------------------------------------------- uploads bucket
-- Studio uploads: newspaper originals (pdf/image/text) and page blocks
-- (images/video). Public-read so the issue viewer can render them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'trifold-uploads',
  'trifold-uploads',
  true,
  52428800,
  '{application/pdf,image/jpeg,image/png,image/webp,image/gif,text/plain,text/markdown,video/mp4,video/webm,video/quicktime}'
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public can READ the uploaded files (they render inside published issues).
drop policy if exists trifold_uploads_public_read on storage.objects;
create policy trifold_uploads_public_read
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'trifold-uploads');

-- Nobody writes from the client — uploads go through the buddy-gated
-- service-role route (POST /api/trifold/upload), never from the browser.
drop policy if exists trifold_uploads_write_deny on storage.objects;
create policy trifold_uploads_write_deny
  on storage.objects for insert
  to anon, authenticated
  using (false) with check (false);

drop policy if exists trifold_uploads_update_deny on storage.objects;
create policy trifold_uploads_update_deny
  on storage.objects for update
  to anon, authenticated
  using (false) with check (false);

drop policy if exists trifold_uploads_delete_deny on storage.objects;
create policy trifold_uploads_delete_deny
  on storage.objects for delete
  to anon, authenticated
  using (false);
