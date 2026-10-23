-- supabase/earth2-poc-grants.sql
-- EARTH 2 — PROOF-OF-CONCEPT LAND GRANTS (Merlin, 2026-10-23).
-- NOT RUN — staged only; run in the Supabase SQL editor on Merlin's
-- green light, AFTER supabase/earth2.sql has run.
--
-- Merlin's order: "We are going to give the account
-- fishstart@hotmail.com one parcel of land in earth 2… One parcel
-- for him, one parcel for me. That will be our proof of concept…
-- bypass payment for this move please."
--
-- What this does, and nothing else:
--   · Grants E2-0619 (Onyx Meadows) to the owner,
--     olympiannexus@gmail.com.
--   · Grants E2-0719 (Onyx Meadows) to the guest,
--     fishstart@hotmail.com.
--   · The parcel between them, E2-0669, is NOT granted — it stays
--     unowned in the First Round Land Sale pool.
--   · Titles are written exactly the way the buy route writes them
--     (app/api/earth2/buy/route.js): the same table, the same
--     columns (parcel_id, owner_id, owner_email, price_gold,
--     acquired_at by default). price_gold is 0 and each grant is
--     diarised in earth2_ledger as kind 'buy', amount_gold 0,
--     counterparty 'poc-grant' — the honest record of a
--     zero-gold, payment-bypassed proof-of-concept grant. No gold
--     moves: balances are never touched here.
--   · Because the titles land in earth2_parcels — the very rows
--     /api/earth2/state serves and lib/earth2/land-sale.js counts —
--     the First Round reads 998 of 1,000 ownable parcels remaining
--     the moment this runs. Each account's home base (and therefore
--     its world spawn) resolves from these rows server-side.
--
-- Safety:
--   · Idempotent — re-running changes nothing: titles use
--     ON CONFLICT DO NOTHING and each ledger row is written once.
--   · Fails LOUDLY (the whole script aborts, nothing is written)
--     when either email has no auth account yet, when either
--     parcel is not ownable-class under the grid's interleave
--     arithmetic (lib/earth2/parcels.js: index%5 in {0,3}), when
--     either parcel is the castle or museum-grounds commons, or
--     when either parcel already belongs to a different account.
--     (The landform-protected parcels — mountains, volcanoes and
--     friends — are computed in lib/earth2/world.js and cannot be
--     asserted from SQL; neither granted parcel is one, and that
--     is pinned by tests/earth2.test.mjs against
--     lib/earth2/building.js protectedParcelIds().)

do $$
declare
  g record;
  uid uuid;
  parcel_index int;
begin
  for g in
    select * from (values
      ('olympiannexus@gmail.com', 'E2-0619'),
      ('fishstart@hotmail.com',   'E2-0719')
    ) as t(email, parcel)
  loop
    -- Resolve the account. No account, no grant — say so, loudly.
    select id into uid from auth.users where lower(email) = lower(g.email);
    if uid is null then
      raise exception
        'POC GRANT ABORTED: no auth account for % — the account must register first, then re-run this script.',
        g.email;
    end if;

    -- Ownable-class assertion, in the grid's own arithmetic
    -- (parcel E2-NNNN -> index NNNN-1; ownable iff (index*2)%5 < 2).
    parcel_index := substring(g.parcel from 4)::int - 1;
    if ((parcel_index * 2) % 5) >= 2 then
      raise exception
        'POC GRANT ABORTED: % is not an ownable parcel under the interleave.',
        g.parcel;
    end if;
    if g.parcel in ('E2-2476', 'E2-0460', 'E2-0510', 'E2-0560') then
      raise exception
        'POC GRANT ABORTED: % is protected Free Commons (Castle Transylvania / museum grounds) and can never be granted.',
        g.parcel;
    end if;

    -- Already someone else's land is a hard stop, never an overwrite.
    if exists (
      select 1 from public.earth2_parcels p
      where p.parcel_id = g.parcel and p.owner_id <> uid
    ) then
      raise exception
        'POC GRANT ABORTED: % already belongs to a different account.',
        g.parcel;
    end if;

    -- The title, in the buy route's exact shape; 0 gold = the
    -- payment bypass this grant exists to record.
    insert into public.earth2_parcels (parcel_id, owner_id, owner_email, price_gold)
    values (g.parcel, uid, lower(g.email), 0)
    on conflict (parcel_id) do nothing;

    -- The diary row: a zero-gold 'buy' marked as the POC grant,
    -- written exactly once per parcel.
    insert into public.earth2_ledger (user_id, kind, parcel_id, amount_gold, counterparty)
    select uid, 'buy', g.parcel, 0, 'poc-grant'
    where not exists (
      select 1 from public.earth2_ledger l
      where l.user_id = uid
        and l.kind = 'buy'
        and l.parcel_id = g.parcel
        and l.counterparty = 'poc-grant'
    );

    raise notice 'POC grant in place: % -> %', g.parcel, g.email;
  end loop;
end $$;

-- The receipt: both titles, or obvious silence where one is missing.
select parcel_id, owner_email, price_gold, acquired_at
from public.earth2_parcels
where parcel_id in ('E2-0619', 'E2-0719')
order by parcel_id;
