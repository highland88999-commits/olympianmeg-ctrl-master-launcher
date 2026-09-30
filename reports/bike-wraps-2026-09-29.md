# Bike Wraps — TRON bikes in Merlin's brand graphics (2026-09-29)

Merlin: "Wrap the vehicles in our graphics."

## What was delivered

All three TRON bikes — **Wisp** (agile scout), **Comet** (balanced), **Atlas** (heavy) —
now fly in Merlin's Nexus Vortex livery:

- `public/textures/nova/TronBikes/wisp-wrap.png` — gold vortex swirl on cosmic
  violet-black, crisp gold **KINGSLEY** mark + NEXUS VORTEX sub-mark
- `public/textures/nova/TronBikes/comet-wrap.png` — indigo-violet nebula, gold
  swirl, **MERLIN'S LEGACY** + NEXUS VORTEX
- `public/textures/nova/TronBikes/atlas-wrap.png` — near-black bronze-violet
  armor, heavy gold swirl, **NEXUS VORTEX** + MERLIN'S LEGACY

Bases generated via the media pipeline (no AI text — lettering composited in
PIL with DejaVu Sans Bold so the marks are razor-crisp at any distance).

## Wiring (BABEL wrap convention: `public/textures/<module>/<CallingFile>/`)

- `components/nova/TronBikes.jsx` — `useWrapTexture` hook loads each bike's
  wrap imperatively (no Suspense); hull falls back to plain paint until the
  texture arrives, so no page ever blocks on it. `Paint` receives the wrap as
  `map` with white base color when loaded.
- `components/argo/VehicleArchetypes.jsx` — ARGO's Wisp/Comet vehicle
  archetypes share the same wraps.
- Consumers (`/nova`, `/argo`, `/myriad`, `/erebus`, GhostRiders, BikeRig) all
  route through these two components — one wrap set covers every module.

## Standing rules honored

- **Lighting:** no new bloom/postprocessing; glows stay local (existing
  accent discs), textures stay readable.
- **Solid-state geometry:** untouched — all collision behavior as before.
- No UI changes, no new SQL, no payments, no pop-ups.

## Verification

- `tests/bike-wraps.test.mjs` — 5/5 green (PNG validity + wiring assertions).
- Production build: green (in-session).
- Published via incremental Git Data API on branch `feature/bike-wraps-2026-09-29`,
  allowlisted to wrap files + wiring + test + this report only; merged to main
  under approve-all; remote main tip verified.
