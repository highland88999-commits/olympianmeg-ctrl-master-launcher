# BABEL walk mode (first-person camera) — 2026-09-29

Unit 2c of the overnight build queue. Camera-mode only: no content, scene, or
character changes (the toy/hybrid content request stays deferred pending
Takeout part 2).

## What was added

`/babel` now has an opt-in first-person **Walk mode** alongside the unchanged
orbit view. The orbit view remains the default everywhere.

- `lib/babel/walk.js` (new) — pure walker logic: per-view walkable areas,
  `clampWalker` (simple containment, no physics), `stepWalker` (yaw-relative
  movement with diagonal normalization), `applyLook` (pitch-clamped drag look),
  `toggleCameraMode` (orbit <-> walk state machine), `prefersReducedMotion` /
  `isTouchDevice` gates.
- `components/babel/WalkMode.jsx` (new) — react-three-fiber walker. Snaps the
  camera to the view's spawn point instantly (no glides), consumes key/joystick/
  drag input from a shared ref each frame, gentle walk bob (disabled under
  reduced motion), and on unmount restores the exact orbit camera defaults so
  Orbit view is untouched.
- `app/babel/page.jsx` (modified) — adds:
  - Plain-English toggle button ("Walk mode" / "Orbit view"), bottom-right,
    above the Safari safe-area inset, 44px touch target.
  - WASD / arrow-key movement on desktop; pointer-drag (mouse) or touch-drag
    to look around.
  - Touch joystick (bottom-left, touch devices only) with pointer capture.
  - Walkable areas: tower plaza ring (radius 12–62, stays out of the shaft),
    Sylva circle r=76, Duat box ±150, Avalon circle r=80, Hermes room box ±20.
  - Riding the elevator resets to orbit; walk mode never replaces the default.
  - Reduced motion: instant non-animated transitions (no fade veil), no walk bob.
  - Elevator panel hides in walk mode so the mobile layout stays clean.
- `lib/babel/test-walk.mjs` (new) — 35 headless tests: bounds clamping for
  ring/circle/box areas and spawn-in-bounds for all five views, movement math
  (forward/strafe/diagonal normalization), look pitch clamping, the mode-toggle
  state machine, and the environment gates.

## Test results

- babel suite: crypto 20/20, floors 11/11, rand 4/4, vault 20/20, walk 35/35 —
  all green (`node test-*.mjs`).
- Production build: `NODE_OPTIONS=--max-old-space-size=6144 npm run build` —
  green, exit 0, `/babel` route compiled.

## Merlin-only actions

None for this unit. No new Supabase SQL, no env vars, no webhook registrations.
