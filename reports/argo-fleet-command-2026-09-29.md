# ARGO — Fleet Command over the real Earth — 2026-09-29

## What it is
New pocket-universe module **ARGO** (`/argo`), a hybrid of two real codebases:
- **omega-fleet** (Merlin's second GitHub account, `olympianmeg-ctrl`): the
  procedural R3F vehicle archetypes, adapted for flight.
- **The launcher's photorealistic Earth**: Google 3D Tiles via the existing
  `components/GoogleEarthTiles.jsx` + server-minted session
  (`/api/earth/tiles/session` — API key never reaches the browser).

Concept: command a fleet of flying vehicles over the REAL photorealistic 3D
Earth. Staging dock UI: pick a skycraft, pick a destination, launch it and
watch it fly a great-circle route. Follow-cam included.

## Files added
- `app/argo/page.jsx` — route page: R3F Canvas, flight rig (great-circle
  slerp animation, vehicle orientation, follow-cam), staging-dock UI,
  in-flight bar, layer badge, reduced-motion handling, Safari clearance.
- `lib/argo-flight.js` — headless globe math: `latLonToHub` (exact hub frame
  from the task spec: `k·cosφ·cosλ, k·sinφ, −k·cosφ·sinλ`), `hubUnit`,
  `angleBetween`, `slerpUnit` (antipodal-safe), `easeInOut`,
  `flightDuration` (4s floor, 24s cap, proportional to angular distance),
  `flightPosition` / `parkedPosition` at 300 km cruise altitude,
  8-destination list (Edmonton home + Paris, Tokyo, New York, Sydney, Giza,
  Rio de Janeiro, London).
- `components/argo/VehicleArchetypes.jsx` — 5 archetypes ported from
  omega-fleet's `VehicleArchetypes.tsx` (TSX→JSX), flight-adapted: wheels
  replaced with hover pods, small local engine glow, nose = +Z. Named
  Skiff / Cruiser / Hauler / Titan / Dart in the `FLEET` registry.
- `components/argo/StylizedGlobe.jsx` — honest fallback: procedural canvas
  texture on a 54.85-radius sphere + procedural starfield, rendered whenever
  Google's tiles are unavailable. Never a blank screen.
- `tests/argo-flight.test.js` — 62 headless tests, all passing.

## Files edited
- `lib/i18n/satellites.ts` — added
  `{ key: "argo", route: "/argo", pos: "ARGUS_POS", section: "OBSERVATORY", constellation: "ARGUS" }`
  (hand-edited; generator scripts are gone; exact object format kept).
- `lib/i18n/locales/{de,el,en,es,fr,it,pt}.json` — added
  `sat.argo.title` / `sat.argo.subtitle` ("Argo" / localized "Fleet Command")
  after the bearth entries.

## Behavior
- **Globe layers:** `GoogleEarthTiles` streams Google's photorealistic tiles
  when the session mints; header badge reads "Photorealistic · Google".
  On any failure the badge reads "Stylized Earth — photorealistic tiles
  unavailable" and the procedural globe renders. Loading state shows the
  stylized globe with "Contacting Google tiles…".
- **Flight:** great-circle slerp at 300 km, ease in/out, duration ∝ angular
  distance (4–24 s). Vehicle oriented by lookAt matrix: nose (+Z) along the
  velocity vector, up = away from Earth center. Route arc + surface markers.
- **Cameras:** dock = free OrbitControls; flying/arrived = Follow (chase cam)
  / Free toggle.
- **Recall:** flies back to Edmonton; Dock button returns to the staging UI.
- **Reduced motion** (`prefers-reduced-motion`): flights jump-cut to the
  destination, no hover bob, no camera chase, no auto-rotation.
- **Mobile:** dock is a bottom sheet, all touch targets ≥ 44 px (Launch is
  52 px), `env(safe-area-inset-bottom)` clearance on dock panel, flight bar,
  and a bottom spacer — content always clears Safari's browser bar.
- **Rules honored:** no telemetry/phone-home anywhere (source-checked in
  tests); glows are small emissive materials on the vehicles only — no
  bloom, Earth textures stay readable; no secrets in code; plain-English UI.

## Verification
- `node tests/argo-flight.test.js` — **62 passed, 0 failed**.
- `npm run build` — green (exit 0); `/argo` route generated
  (`.next/server/app/argo/page.js` present).
- Not published or merged per instructions — everything is in the worktree,
  ready for the parent's publish pipeline.

## Notes for the parent
- ET-Phone-Home voice was intentionally NOT touched (already integrated as
  `/phone-home`); ARGO is fleet-only.
- The stylized fallback texture is deterministic (seeded RNG) so SSR/prerender
  and client agree.
- `GoogleEarthTiles` was reused untouched — no changes to `lib/maptiles.js`.

## Addendum — Trim bikes join the dock (2026-09-29)

Merlin asked for his trim bikes. Two joined the ARGO staging dock:
- **Trim Bike · Wisp** (`wisp`) — agile scout bike, fastest off the line. Accent #00ffcc.
- **Trim Bike · Comet** (`comet`) — balanced bike, steady and sharp. Accent #38bdf8.
Both are single-rider space bikes (narrow frame, glass canopy, side trim-thruster pods, stern engine glow, nose +Z) in `components/argo/VehicleArchetypes.jsx`, registered in `FLEET` — the dock and flight rig pick them up automatically. The full trim bike garage (Wisp/Comet/Atlas) lives in the NOVA deep-space module.
