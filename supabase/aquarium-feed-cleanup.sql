-- ============================================================================
-- DRAFT — DO NOT RUN YET.
--
-- Aquarium feed cleanup (Merlin, 2026-11-15): delete the feeds that do
-- not load, and make user-added feeds permanent.
--
-- WHAT HAPPENED: Merlin's video (Nov 15 ~22:34) showed many of the 50
-- aquarium nodes never loading — black screen with "ESTABLISHING
-- CONNECTION..." forever, or YouTube's "Playback on other websites has
-- been disabled by the video owner". Every feed was live-checked
-- (YouTube oEmbed, curl, 2026-11-16): a feed counts as dead only if
-- YouTube itself refuses it — 401/403 (owner disabled embedding) or
-- 404 (video gone). Ten feeds failed; six more were black in the video
-- but pass the live check right now (24/7 live streams, dark in that
-- moment) and are KEPT.
--
-- WHY THIS FILE EXISTS: the live site loads its rotation from the
-- nexus_nodes table, NOT from the code list — so deleting the dead
-- feeds from app/aquarium/page.tsx alone only fixes the offline
-- fallback. This file does the live deletion, and adds the `origin`
-- column that marks built-in feeds vs user-added feeds, so a future
-- sweep can never touch a user feed.
--
-- RUNNING this still needs Merlin's explicit green light (standing
-- rule: Supabase SQL migrations need his green light before
-- executing). Until it runs, the dead feeds stay in the live rotation
-- (the code list is already pruned, so the offline fallback is clean).
--
-- USER FEEDS ARE NEVER TOUCHED BY THIS FILE. The DELETE below names
-- exactly ten built-in ids. The UPDATE only marks the forty live
-- built-ins. Rows with origin 'user' — every feed added through ADD
-- FEED — are not named anywhere below and are never deleted by any
-- sweep; deleting one is a manual, PIN-gated act in the app.
-- ============================================================================

-- The table the aquarium client already uses (select * order by
-- created_at; insert {id, name}; delete eq id). Create it only if a
-- fresh environment lacks it; in production it already exists and
-- this is a no-op. Policies are NOT changed here: the table already
-- serves the client in production, and touching RLS could break the
-- live page.
create table if not exists public.nexus_nodes (
  id text primary key,
  name text not null,
  origin text not null default 'user',
  created_at timestamptz not null default now()
);

-- Mark which rows are built-in and which are user-added. New inserts
-- (ADD FEED) default to origin 'user'; the forty live built-ins are
-- marked 'builtin' below. This column is the guard that keeps user
-- feeds permanent: no sweep may ever delete a row with origin 'user'.
alter table public.nexus_nodes
  add column if not exists origin text not null default 'user';

-- ---------------------------------------------------------------------------
-- 1) Delete the ten dead built-in feeds (live-verified dead, oEmbed):
--    13 KILAUEA VOLCANO            iws3rh5vLAQ  oEmbed 401 (embedding disabled)
--    17 ANCIENT EGYPT LIVE         FqQJmDiW0xs  oEmbed 403 (embedding disabled)
--    19 MAUNAKEA METEOR CAM        qJ8lYplu1y0  oEmbed 404 (video gone)
--    28 AQUARIUM FEED 05           HlJ4aRtYhoo  oEmbed 401 (embedding disabled)
--    29 AQUARIUM FEED 06           iWCeBAxRCBo  oEmbed 403 (embedding disabled)
--    35 AQUARIUM FEED 12           dN1uDn-Luno  oEmbed 403 (embedding disabled)
--    36 AQUARIUM FEED 13           -479TZi-EAs  oEmbed 404 (video gone)
--    40 AQUARIUM FEED 17           h8O0UXsL7uk  oEmbed 403 (embedding disabled)
--    41 AQUARIUM FEED 18           0FBiyFpV__g  oEmbed 401 (embedding disabled)
--    49 AQUARIUM FEED 26           UpwNqncnqTE  oEmbed 403 (embedding disabled)
--    The delete is scoped to built-in rows only: a user-added feed can
--    never share one of these ids by accident — the app refuses an
--    insert whose id already exists — but the origin guard is here
--    anyway so the intent is explicit.
-- ---------------------------------------------------------------------------
delete from public.nexus_nodes
  where id in (
    'iws3rh5vLAQ',
    'FqQJmDiW0xs',
    'qJ8lYplu1y0',
    'HlJ4aRtYhoo',
    'iWCeBAxRCBo',
    'dN1uDn-Luno',
    '-479TZi-EAs',
    'h8O0UXsL7uk',
    '0FBiyFpV__g',
    'UpwNqncnqTE'
  )
  and (origin is null or origin <> 'user');

-- ---------------------------------------------------------------------------
-- 2) Mark the forty live built-ins as origin 'builtin', so the sweep
--    boundary is stored in the data, not just in the app code.
-- ---------------------------------------------------------------------------
update public.nexus_nodes
  set origin = 'builtin'
  where id in (
    'DHUnz4dyb54', 'XsOU8JnEpNM', '5e4lsEe4Vew', '3n-5EA9augs',
    'dIChLG4_WNs', 'ItdXaWUVF48', 'ydYDqZQpim8', 'S46DdA8Mc4I',
    'qHXFLsnKDq0', 'F0GOOP82094', '4BrvMGznLTo', 'ayMw6zvsUpQ',
    'jzx_n25g3kA', 'ouWBQoVFegI', '3szkFHfr6sA', 'aXAsMcmtJTc',
    'yfSyjwY6zSQ', 'azNqXbUW-K4', 'yuIm1V7Ne7I', 'QOzC_AbsPlw',
    'XyPU5-pNg5E', 'Io1Kle7QR-E', 'RZFMYVNhd4k', 'JMMoRwYo5kE',
    'g6wxYiESkE4', '-qvYCbvbeN8', 'SUXPnIEpbn4', 'tEtg5Kg3voQ',
    'abbR-Ttd-cA', 'qi0mY6zVQnY', 'MwcqP3ta6RI', 'fIMbMz2P7Bs',
    'UDAZWxehMAI', 'w3LjpFhySTg', '3e_uPkJCTNo', 'ZrePsYz4c6g',
    'gJVnp5fF0vM', '-Vck0hn-zqk', 'typxqJU-pFQ', 'E0TZTmTK-Ws'
  );

-- ---------------------------------------------------------------------------
-- 3) Verify (read-only — run after the statements above and check the
--    numbers before calling it done):
--    - 40 built-in rows remain, 0 of the 10 dead ids remain;
--    - every user-added row (origin 'user') is still there.
-- ---------------------------------------------------------------------------
select origin, count(*) as feeds from public.nexus_nodes group by origin order by origin;
select id, name from public.nexus_nodes where id in (
  'iws3rh5vLAQ', 'FqQJmDiW0xs', 'qJ8lYplu1y0', 'HlJ4aRtYhoo',
  'iWCeBAxRCBo', 'dN1uDn-Luno', '-479TZi-EAs', 'h8O0UXsL7uk',
  '0FBiyFpV__g', 'UpwNqncnqTE'
);
