# NOVA — Deep Space (2026-09-29)

Merlin's deep-space expansion: trim bikes, a boardable floating space
gift, wormholes, and galaxies to explore.

## Concept

`/nova` is free-flight deep space on Merlin's signature single-rider trim
bikes. Three sectors connected by wormhole portals: The Shallows (garage
dock), The Gift Drift (THE GIFT — boardable), Spiral Reach (three named
procedural galaxies + two nebulae).

## What was built

- `app/nova/page.jsx` — route: R3F canvas, garage UI (pick bike → Launch),
  HUD (sector name, bike, plain-English speed), autopilot tour toggle,
  gift boarding overlay + interior plaque, touch joystick + thrust slider,
  desktop keyboard flight.
- `lib/nova-flight.js` — headless: trim-bike tuning table (wisp/comet/atlas),
  sector graph, wormhole jump logic, gift proximity, arcade flight step,
  autopilot steering helper, plain-English speed words. Zero DOM/THREE.
- `components/nova/TrimBikes.jsx` — 3 procedural trim bikes, shared design
  language (nose +Z, narrow frame, glass canopy, two side trim-thruster
  pods with glow discs, one accent stripe, stern engine glow, no bloom):
  Wisp #00ffcc (agile), Comet #38bdf8 (balanced), Atlas #f59e0b (heavy).
  Registry `TRIM_BIKES` + `bikeByKey`.
- `components/nova/DeepSpace.jsx` — starfields, 3 point-cloud spiral
  galaxies (The Pinwheel, Ember Spiral, Hollow Eye — distinct palettes),
  2 additive-sprite nebulae (Violet Veil, Amber Deep), swirling wormhole
  portals labeled with destinations, THE GIFT exterior (crimson box, gold
  ribbon + bow, slow rotation), warm GiftInterior (golden rotating star,
  drifting motes).
- `tests/nova-flight.test.js` — **95 passed, 0 failed**.
- Menu registration: `{ key: "nova", route: "/nova", pos: "ZEUS_POS",
  section: "GAMES", constellation: "ZEUS" }` in `lib/i18n/satellites.ts`
  (hand-edited, same style as argo/styx). `"sat.nova.title": "Nova"` /
  `"sat.nova.subtitle": "Deep Space"` in all 7 locale files.

## Flight model

- Desktop: WASD/arrows thrust + turn, R/F pitch, Shift boost, Space brake.
- Mobile: left-half steer stick, right-half thrust slider, all ≥44px.
- Chase cam with smoothing; autopilot tour flies a cinematic loop through
  all sectors (pauses on any input).
- Speed in plain English: drifting / cruising / flying fast / boosting.

## Wormholes + THE GIFT

- Fly into a swirling ring → white flash → linked sector. Reduced motion:
  static swirl, instant fade cut.
- Fly within 16 units of THE GIFT → "Board the Gift" button. Boarding
  fades into a warm interior chamber with a golden star and a plaque
  bearing Merlin's own words: "Poverty needs to end." Disembark returns
  the bike outside the gift. Interior panel scrolls with Safari clearance.

## Verification

- `node tests/nova-flight.test.js`: 95/95 (tuning, connected graph,
  jumps, gift radius, registry, locales, no-telemetry scans).
- Regression: argo-flight 62/62, styx-journey 18/18 still green.
- `npm run build`: green, `/nova` route generated (14.1 kB).
- Bugs caught in review before build: sector swaps mutated only a ref
  (scene never re-rendered — fixed with `sectorKey` state); garage
  rendered the bike twice (rig + turntable — rig now flying-only);
  interior camera started outside the chamber (snap on entry).

## Rules honored

No telemetry, no phone-home, zero network calls (no external fetches at
all). No secrets. No pop-ups. Plain-English UI. Reduced motion respected
throughout. No argo files modified.
