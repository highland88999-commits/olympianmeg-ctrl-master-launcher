# Report: mounted TRON bike rider — 2026-09-29

## What shipped
A visible, lightweight procedural rider now sits mounted on every TRON bike:

- **`components/nova/TronRider.jsx`** (new) — low-poly Three.js rider in a forward-leaning
  riding pose: hips on the seat behind the canopy, torso leaning to the grips, knees tucked
  into the frame, boots on the pegs, dark helmet with a glass visor and neon rim. Same design
  language as the bikes: dark materials + localized `meshBasicMaterial` neon trim — no lights,
  no bloom, no postprocessing, so texture wraps and backdrops stay readable.
- **`lib/tron-rider.js`** (new) — pure logic: per-bike fit constants (`riderFitFor`), name-tag
  rule (`riderTagText`), default theme. Headless-testable.
- **Mounted in three modules:**
  - `/nova` — flying rig AND the garage dock turntable.
  - `/myriad` — flying rig.
  - `/argo` — only on the two tron bike archetypes (Wisp, Comet); fleet skycraft have no
    open cockpits, so no rider there. Rides inside the existing `VEHICLE_SCALE` group so it
    scales with the bike.
- **Profile hookup:** on mount the rider reads the universal `/profile` character via
  `riderTheme(loadProfile())` — suit/helmet/glow colors drive the 3D rider. Floating name tag
  shows the rider's display name (or callsign when no name is set). No profile yet → a
  tasteful default rider (teal suit, dark helmet, cyan trim) and NO name tag — never a
  placeholder name, never a fake identity.
- **Reduced motion:** the rider's idle bob/sway is fully static when `reduced` is on; the
  parent rig still carries the rider with the bike so it never drifts from the seat.
- **No fake claims:** name tag only shows the user's own profile data; profile.cloud sync
  stays honestly labeled elsewhere (untouched).

## Tests
- `tests/tron-rider.test.mjs` — new, 30/30 green. Covers fit constants, tag rule, default
  theme hex validity, profile hookup, reduced-motion gate, no lights/bloom/network in the
  rider, and wiring in all three pages.
- Regression neighbors: profile 53/53, nova-flight 95/95, myriad-universes 72/72,
  argo-flight 62/62 — all green.
- Production build (`NODE_OPTIONS=--max-old-space-size=6144 npm run build`): green.

## Notes / not in scope
- The launcher home parked bike (`components/BikeRig.jsx`) intentionally keeps its
  rider-POV camera — no rider there, since the camera sits in the rider's seat.
- `presence/GhostRiders.jsx` deliberately stays a simplified ghost and was not touched.
