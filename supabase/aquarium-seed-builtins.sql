-- ============================================================================
-- Aquarium seed — migrate the live rotation into Supabase (Merlin, 2026-11-16).
--
-- WHY: the cleanup SQL ran Nov 16 ~00:43 and public.nexus_nodes came back
-- EMPTY (0 rows) — nothing ever seeded the built-in feeds into the table, so
-- the live rotation was always the code list. Merlin's call Nov 16 ~00:45:
-- "Yes migrate to supabase... this is better handling."
-- This file inserts the 34 live built-ins (the exact code list in
-- lib/aquarium/nodes.js BUILTIN_NODES, same names, same order) with
-- origin 'builtin', so the database becomes the real source of truth and
-- the page stops showing UPLINK FAILED. USING LOCAL CACHE.
--
-- SAFE: ON CONFLICT (id) DO NOTHING — re-running changes nothing, and no
-- existing row (including any user-added feed) is ever touched. The 16
-- dead + black-screen ids are NOT inserted; the merge law in
-- lib/aquarium/nodes.js can never re-admit them.
-- created_at is staggered 1 second per row in code-list order, because the
-- page orders by created_at — the rotation order is preserved exactly.
-- ============================================================================

insert into public.nexus_nodes (id, name, origin, created_at) values
  ('DHUnz4dyb54', 'AQUARIUM', 'builtin', '2026-11-16 00:45:01+00'),
  ('XsOU8JnEpNM', 'OL DONYO LODGE', 'builtin', '2026-11-16 00:45:02+00'),
  ('5e4lsEe4Vew', 'WOLF CENTER NORTH', 'builtin', '2026-11-16 00:45:03+00'),
  ('dIChLG4_WNs', 'NKORHO BUSH LODGE', 'builtin', '2026-11-16 00:45:04+00'),
  ('ItdXaWUVF48', 'ROSIE''S PAN AFRICA', 'builtin', '2026-11-16 00:45:05+00'),
  ('ydYDqZQpim8', 'NAMIB DESERT LIVE', 'builtin', '2026-11-16 00:45:06+00'),
  ('S46DdA8Mc4I', 'MAKOV STORK NEST', 'builtin', '2026-11-16 00:45:07+00'),
  ('F0GOOP82094', 'MORTEN HILMER FOREST', 'builtin', '2026-11-16 00:45:08+00'),
  ('4BrvMGznLTo', 'MOUNTAIN WATERFALL', 'builtin', '2026-11-16 00:45:09+00'),
  ('ayMw6zvsUpQ', 'PACIFIC REEF CAM', 'builtin', '2026-11-16 00:45:10+00'),
  ('jzx_n25g3kA', 'UTOPIA UNDERWATER', 'builtin', '2026-11-16 00:45:11+00'),
  ('ouWBQoVFegI', 'BALD EAGLE NEST', 'builtin', '2026-11-16 00:45:12+00'),
  ('aXAsMcmtJTc', 'NETHERLANDS SEAL CAM', 'builtin', '2026-11-16 00:45:13+00'),
  ('yfSyjwY6zSQ', 'GRACE GORILLA FOREST', 'builtin', '2026-11-16 00:45:14+00'),
  ('azNqXbUW-K4', 'TROPICAL FISH CAM', 'builtin', '2026-11-16 00:45:15+00'),
  ('yuIm1V7Ne7I', 'ONGUMA WATERHOLE', 'builtin', '2026-11-16 00:45:16+00'),
  ('QOzC_AbsPlw', 'SPACE AMBIENT HUD', 'builtin', '2026-11-16 00:45:17+00'),
  ('XyPU5-pNg5E', 'AQUARIUM FEED 01', 'builtin', '2026-11-16 00:45:18+00'),
  ('Io1Kle7QR-E', 'AQUARIUM FEED 02', 'builtin', '2026-11-16 00:45:19+00'),
  ('RZFMYVNhd4k', 'AQUARIUM FEED 03', 'builtin', '2026-11-16 00:45:20+00'),
  ('JMMoRwYo5kE', 'AQUARIUM FEED 04', 'builtin', '2026-11-16 00:45:21+00'),
  ('-qvYCbvbeN8', 'AQUARIUM FEED 08', 'builtin', '2026-11-16 00:45:22+00'),
  ('SUXPnIEpbn4', 'AQUARIUM FEED 09', 'builtin', '2026-11-16 00:45:23+00'),
  ('tEtg5Kg3voQ', 'AQUARIUM FEED 10', 'builtin', '2026-11-16 00:45:24+00'),
  ('abbR-Ttd-cA', 'AQUARIUM FEED 11', 'builtin', '2026-11-16 00:45:25+00'),
  ('qi0mY6zVQnY', 'AQUARIUM FEED 14', 'builtin', '2026-11-16 00:45:26+00'),
  ('MwcqP3ta6RI', 'AQUARIUM FEED 15', 'builtin', '2026-11-16 00:45:27+00'),
  ('fIMbMz2P7Bs', 'AQUARIUM FEED 16', 'builtin', '2026-11-16 00:45:28+00'),
  ('UDAZWxehMAI', 'AQUARIUM FEED 19', 'builtin', '2026-11-16 00:45:29+00'),
  ('w3LjpFhySTg', 'AQUARIUM FEED 20', 'builtin', '2026-11-16 00:45:30+00'),
  ('3e_uPkJCTNo', 'AQUARIUM FEED 21', 'builtin', '2026-11-16 00:45:31+00'),
  ('gJVnp5fF0vM', 'AQUARIUM FEED 23', 'builtin', '2026-11-16 00:45:32+00'),
  ('typxqJU-pFQ', 'AQUARIUM FEED 25', 'builtin', '2026-11-16 00:45:33+00'),
  ('E0TZTmTK-Ws', 'AQUARIUM FEED 27', 'builtin', '2026-11-16 00:45:34+00')
on conflict (id) do nothing;

-- Verify (read-only): expect 34 builtin rows, 0 of the 16 deleted ids.
select origin, count(*) as feeds from public.nexus_nodes group by origin order by origin;
select id, name from public.nexus_nodes where id in (
  'iws3rh5vLAQ', 'FqQJmDiW0xs', 'qJ8lYplu1y0', 'HlJ4aRtYhoo',
  'iWCeBAxRCBo', 'dN1uDn-Luno', '-479TZi-EAs', 'h8O0UXsL7uk',
  '0FBiyFpV__g', 'UpwNqncnqTE', '3n-5EA9augs', 'qHXFLsnKDq0',
  '3szkFHfr6sA', 'g6wxYiESkE4', 'ZrePsYz4c6g', '-Vck0hn-zqk'
);
