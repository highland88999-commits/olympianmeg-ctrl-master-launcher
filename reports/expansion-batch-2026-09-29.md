# Expansion batch — 2026-09-29

Merged to main: `681e7ffea789e91194b4e2168b09a5d181172397`
Branch: `expansion/2026-09-29-batch`

## Merlin's directives, all shipped

1. **TRON bikes, not trim.** Renamed everywhere: `components/nova/TronBikes.jsx`,
   `TRON_BIKE_TUNING` / `TRON_BIKE_KEYS` / `TRON_BIKES`, "Tron bike garage" copy,
   ARGO dock labels. Old `TrimBikes.jsx` deleted. (`TrimThrusterPods` untouched —
   that's aerodynamic stabilizer trim, unrelated.)
2. **Bike loads right in front of the user.** `snapCamRef` camera snap on launch,
   wormhole/sector jump, and gift disembark in `/nova`; same on launch in `/argo`;
   MYRIAD replicates the pattern on atlas entry and wormhole rides.
3. **100 universes to explore.** MYRIAD (`/myriad`): 100 deterministic procedural
   universes (seeded, same universe forever), searchable 10×10 atlas with anomaly
   filters, flyable explorer on the NOVA flight model, TRON bike garage (Wisp/Comet/Atlas),
   free exploration, wormhole anomalies that drop you into a different universe.
4. **`/life` gameplay.** PILOT mode: guide a spark through the orbital matrix.
   Blockers (void shards), boosts (golden surges, +25), occasional shield rings
   (absorb one hit, shatter the shard), 3-hit hull, difficulty ramps every 22s
   (faster spawns, faster shards, higher cap, homing shards from level 4). Score/best
   persisted locally. Start via "Pilot the spark", HUD shows score/hull/shield/level.
5. **Universal character creation + profile.** `/profile`: callsign, suit color,
   helmet color, TRON bike glow color, avatar frame, live rider preview, plus a real
   on-device photo/video gallery (IndexedDB, honestly labeled on-device). Rider
   colors are the single identity source for future multiplayer labels.
6. **ENYO — Call-of-Duty-style FPS.** `/enyo`: original maps/weapons only
   (no COD branding/assets). Ruined Plaza, Neon Depot, Dust Hollow; assault rifle,
   SMG, marksman rifle; 5 bots per match; pointer lock, WASD, R reload, Shift sprint,
   Space jump, mobile touch controls; kill feed, hit markers, HUD.
7. **Players visible to all players.** Presence library built on ~2.5s database
   polling (zero websockets/Realtime): `lib/presence.js`, `GhostRiders.jsx`,
   `supabase/presence.sql` (DRAFT — not run). Graceful solo mode until the SQL
   ships in the final consolidated pass. Route wiring (nova/myriad/argo) queued —
   see `reports/presence-integration-2026-09-29.md`.
8. **Sled wraps match their GitHub descriptions.** Audited all 28 luge sleds against
   the OG `highland88999-commits/Luge-Refuge` livery code: 25 already matched,
   3 fixed (g2 Urban Glider, p3 Street Samurai, p11 Rift Marauder) as labeled
   recreated-from-description procedurals. Lighting was already compliant
   (restrained bloom, textures stay readable).

## Test results
- life-game: 49/49 · myriad-universes: 72/72 · profile: 53/53
- enyo: 70/70 · presence: 62/62 · luge: 135/135
- `npm run build` green; `/myriad`, `/enyo`, `/profile`, `/life`, `/luge`, `/nova`, `/argo` all in the route manifest.

## Notes
- Two builder subagents were killed mid-run by runtime daemon restarts; both modules
  (ENYO, presence) were verified complete in the worktree and finished in place.
- ENYO menu entries (`satellites.ts` + 7 locales) were added centrally.
- Not yet done (queued, need Merlin or the SQL pass): rider visibly mounted on the
  TRON bike, bike upgrades, space races, presence route wiring, presence + profile
  cloud sync SQL, Fortress per-user buckets (noted, deferred per Merlin).
