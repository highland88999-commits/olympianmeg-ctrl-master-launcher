# STYX — the Passage (2026-09-29)

Second hybrid from the cross-account audit (first: ARGO, built in parallel).

## Concept

The four life stations already existed as separate pocket universes —
`/anti-life`, `/life`, `/meaning-of-life`, `/the-afterlife` — but there was no
way to walk them as one journey. STYX is the river between them: a guided
passage in four stations, walked in the order decay → orbit → question →
beyond.

## What was built

- `app/styx/page.jsx` — journey orchestrator. Station markers I–IV with
  visited/current/upcoming states, a briefing card for the current station,
  an "Enter the station" button, a completion state ("The Far Shore"), a
  "walk it again" reset, free-wander links to all four stations, and a return
  to the hub. Progress persists in `localStorage` (`styx-leg`); private-mode
  failure degrades gracefully (journey just doesn't persist).
- `lib/styx/journey.js` — pure state machine: `LEGS`, `sanitizeLeg`,
  `advanceLeg`, `isComplete`, `stationUrl`. Headless-tested.
- `components/styx/PassageLink.jsx` — floating "Continue the Passage →"
  button rendered inside all four stations, visible only when the traveler
  arrived via `?passage=1`. Links back to `/styx?advanced=1`, which advances
  the journey. Fixed position with `env(safe-area-inset-bottom)` clearance.
- All four station pages patched (import + one component each, additive only):
  `app/anti-life/page.jsx`, `app/life/page.jsx`,
  `app/meaning-of-life/page.jsx`, `app/the-afterlife/page.jsx`.
- Menu registration: `{ key: "styx", route: "/styx", pos: "MEDUSA_POS",
  section: "THERAPY", constellation: "MEDUSA" }` in `lib/i18n/satellites.ts`
  (hand-edited; the generator scripts are gone).

## Design notes

- The order is deliberate: anti-life first, the-afterlife last — from what
  falls apart, through the orbit and the question, to the beyond.
- Narration is spare and plain. No slogans minted.
- Static page, no animation loops — respects reduced-motion by construction.
- Mobile-friendly: large touch targets, Safari bar clearance, no mouse-only
  interactions.

## Tests

`tests/styx-journey.test.js` — 18/18 pass (state machine + route wiring +
registry entry + PassageLink presence in all four stations).

## Also fixed in this pass (found via live verification)

`lib/maptiles.js` used the wrong Map Tiles session endpoint
(`/v1/3dtiles/sessions`, HTTP 404 from Google). Corrected to the documented
`https://tile.googleapis.com/v1/createSession`. `tests/maptiles.test.mjs`
updated (62/62 pass), `tests/earth.test.mjs` still green (42/42). The fix
deploys with this publish; the live session route should return 200 after.
