-- ============================================================================
-- PREPARED — DO NOT RUN YET.
--
-- Creator attribution for Custom Product Designer creations
-- (/store/custom). Prepared 2026-10-13 alongside the creator markup
-- step; runs only through Merlin's SQL green-light sequence (clean
-- copy -> Gemini pass -> explicit go), like every other migration.
--
-- Until this runs, nothing breaks: the create route ALSO stamps the
-- same record onto the Stripe product's metadata, and
-- lib/store/custom-creations.js reads/writes this table best-effort
-- (a missing table is swallowed). Once live, this table is the
-- queryable system of record for:
--   - creator pages (everything a user has created, shareable through
--     their profile, each row opening its store page), and
--   - the wallet-crediting step (on a verified sale, credit the
--     creator markup_cents, net of real Stripe fees, per the standing
--     wallet policy). Gross figures only are recorded here — whether
--     the $1.00 platform fee applies to custom-product sales is
--     undecided and NOT encoded in this schema.
--
-- Baseline offer: Merlin's rule is that a creator's first copy of
-- their own creation is offered at the baseline price (no markup).
-- baseline_offer_session_id / _claimed_at track an open baseline
-- checkout; baseline_offer_redeemed_at is set by the store webhook
-- once that session is actually paid — one redemption per creation.
--
-- Writers: server routes via the service role only (create route,
-- custom buy route, store webhook). Readers: the same routes, plus
-- (via the RLS policy below) a signed-in creator reading their own
-- rows for their creator page.
-- ============================================================================

create table if not exists public.store_custom_creations (
  id uuid primary key default gen_random_uuid(),
  creator_user_id text,
  creator_email text,
  template_key text not null,
  design_name text,
  product_name text,
  printful_product_id text not null unique,
  stripe_product_id text,
  baseline_cents int not null,
  markup_cents int not null default 0,
  final_cents int not null,
  currency text not null default 'cad',
  baseline_offer_session_id text,
  baseline_offer_claimed_at timestamptz,
  baseline_offer_redeemed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists store_custom_creations_creator_idx
  on public.store_custom_creations (creator_user_id);
create index if not exists store_custom_creations_created_idx
  on public.store_custom_creations (created_at desc);

-- RLS: creators may read their own creations (creator pages); all
-- writes are service-role only (the service role bypasses RLS, and no
-- insert/update/delete policy is granted to anon/authenticated).
alter table public.store_custom_creations enable row level security;

drop policy if exists store_custom_creations_select_own on public.store_custom_creations;
create policy store_custom_creations_select_own
  on public.store_custom_creations for select
  to authenticated
  using (creator_user_id = auth.uid()::text);
