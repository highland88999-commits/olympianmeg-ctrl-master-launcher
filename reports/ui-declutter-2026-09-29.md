# UI Declutter — launcher shell declutter + transport controls (2026-09-29)

Merlin's directives from his screenshot review of the home shell:
1. Back/forward transport buttons in a slim row directly above the music bar.
2. The floating video button (bottom-left) becomes the single home for ALL programs.
3. Main interface back toward the original early launcher design, modernized.
4. Remove ALL portal entry points except the original few — too cluttered.
Plus a visible bug: on the HOLOFRAME NEXUS viewport the "FEED:" label overlapped the signal pill.

## What changed

**`components/radio/RadioBar.jsx`** — new slim transport strip directly above the
collapsed now-playing bar: previous-track and next-track buttons in a small
pill. Rendered only when the library sheet is closed (the sheet already has a
full TransportRow) and never in the minimized dock-chip state. Uses the real
`prev`/`next` from `useRadio` — no new playback logic. The bar below keeps its
`env(safe-area-inset-bottom)` padding, so the strip always clears the Safari
chrome. Outer wrapper is `pointer-events-none` so taps pass through around the
pill.

**`app/page.jsx`**
- Removed the `SpacePortalGates` import and the entire portal-gate field (the
  ~138-gate ring added 2026-09-29 — the clutter Merlin flagged). The component
  file and `lib/space-portals.js` stay in the codebase with their tests; only
  the interface usage is gone.
- `GodOrbitRings` now renders visual-only: `<GodOrbitRings satIndex={satIndex} />`
  with no launcher props. The bands and god labels remain as the scene's
  signature visual; nodes no longer launch anything.
- Kept: the launch-travel portal effects (`kingHoleTex`/`payloadTex` in
  `SequenceController`) — these are the *original* portals from the first
  launcher version, transient travel effects, not interface clutter.
- Kept: constellation towers with the stake.com native ad panels (untouched),
  entrance cinematic, Renewal Plan pill (the roadmap's only entry point — it is
  not in the satellite menu, so removing the pill would orphan it), Earth
  console, spawn-to-bike, settings.

**`components/GodOrbitRings.jsx`** — node click/hover handlers now guard on
`canLaunch && onLaunch`; inert nodes show no pointer cursor and don't scale.
Props are optional, so the component degrades to pure decoration.

**`app/waste-extraction/page.jsx`** — the "FEED: {name}" and
"SIM SIGNAL {n}% • LOOPING" labels now share one flex row: the feed name
truncates (`min-w-0 truncate`), the signal pill is `shrink-0`. No more overlap
on narrow screens.

**`tests/god-menus.test.js`** — fixed two stale assertions that were already
failing on remote main before this task: `GodMenuPanel` was never rendered in
the shell (replaced with an honest single-launcher assertion), and the
spawn-to-bike button's class changed under the placement-language commit
(now asserts the real `bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-5`).

**`tests/ui-declutter.test.mjs`** (new, 11 assertions) — covers all four
directives plus the label fix.

## Design calls (for Merlin to veto)

- Orbit bands kept as pure decoration. If you'd rather they go entirely, say
  the word — one prop removal.
- Renewal Plan pill kept as the roadmap's only entry point.
- SatelliteMenu (the floating button's menu) needed no changes — it already
  lists every program and launches through the single `launchPocketUniverse`.

## History reference (original design)

Checked via GitHub API: the earliest `app/page.jsx` (2026-09-28, `23ba4dea`)
was constellation towers + Earth + sun/Mars + floating video menu button with a
simple section menu — no portal gates, no orbit rings, no entrance sequence.
This change restores that composition: towers, Earth, bands (visual), floating
menu. The portal gate field was only ever in for a day (added `33aff2ef`).

## Verification

- New tests: 11/11 green (`node --test tests/ui-declutter.test.mjs`).
- god-menus: 113/113 green as-published (the 2 stale assertions repaired; the
  2 failures seen in the shared worktree were the Erebus builder's in-flight
  `lib/god-menus.js` change — not part of this publish; verified 113/113
  against remote main + these 7 files).
- space-portals lib tests: 9/9 green (component unused by the page, lib intact).
- holoframe: 21/21 green.
- Production build: green (`npm run build` in-session, exit 0).
- Published incrementally via GitHub API (blob-diff vs remote main, base_tree)
  on branch `feature/ui-declutter-2026-09-29`, merged to main under the
  standing approve-all directive.
- Merge commit: __MERGE_SHA__
- Report amend commit (this file): __AMEND_SHA__
- Remote main tip verified: __VERIFY_TS__

No new Supabase tables. No payments. No settings touched.
