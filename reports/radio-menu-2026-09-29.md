# Radio onboarding + Hermes-style two-axis menu — build report (2026-09-29)

## What shipped

**1. ENCOM first-load ritual.** Every user's first load now opens the radio with
Daft Punk's "Encom Part I" → "Encom Part II" (in that order), then the queue
shuffles normally behind them. Later loads go straight to the normal shuffle.
- URIs verified against Spotify's own catalog (not guessed): the album-level
  lookup resolved `spotify:track:0wuXtDn3vPxvG6szydUznc` (Encom Part I) and
  `spotify:track:37OFlKZy7bJeF6vzFmekfK` (Encom Part II) from
  "TRON: Legacy – The Complete Edition" (`spotify:album:3AMXFnwHWXCvNr5NCCpLZI`,
  cross-confirmed on MusicBrainz as the 2020 Walt Disney Records release).
  Note: Spotify's partner API refused Daft Punk track search with a UMG
  catalog restriction — the album-scoped `experience` call resolved them fine.
- `lib/radio/station.js`: new `ENCOM_OPENER` constant + `buildFirstLoadQueue()`
  (opener block → shuffled station+vault pool → shuffled contribution encore).
  Merlin's `STATION_TRACKS` source array is never reordered; opener tracks are
  filtered out of the pool so they can't double up if they also sit in the vault.
- `components/radio/RadioProvider.jsx`: per-user first-load gating.
  Device flag `nexus.radio.firstLoadDone` is the fast path; a per-user flag
  (`nexus.radio.firstLoadDone.<uid>`) covers shared devices and returning users
  on new devices — a signed-in user who never got the ritual on this device gets
  the ENCOM opener served once.
- 19/19 tests green (`tests/radio-menu.test.mjs`), plus the existing
  `tests/radio.test.mjs` suite still green.

**2. Collaborate invite (tasteful, dismissible, no spam).**
- New `components/radio/CollabInviteCard.jsx`: an inline card shown during the
  first-load session only, dismissible via "Not now" or the × button, persisted
  in `nexus.radio.collabDismissed` — once dismissed it never shows again.
- Copy is honest: collaboration happens through Spotify's own
  invite-collaborators flow (Merlin flips that toggle himself and approves
  collaborators there); the card only links the real station playlist.
- Provider exposes `showCollabInvite` / `dismissCollabInvite`.

**3. Two-axis Hermes-style satellite menu** (`components/SatelliteMenu.jsx`).
- Categories ride a horizontal slider rail across the top (scroll-snap,
  swipeable, sticky so it stays pinned while items scroll).
- Items for the selected category scroll vertically beneath it, all inside the
  menu window opened by the floating button — never a full-screen takeover,
  never a detached edge drawer.
- Satellite programs slide open with the Hermes drawer motion: max-height 0 →
  open on `cubic-bezier(0.19, 1, 0.22, 1)` at 0.6s, padding easing with it,
  terse "DEPLOY ▸/▾" toggle language, frosted dark panels.
- Launching still goes through the single `onLaunch(route, key, pos)` →
  `launchPocketUniverse` path; menu content (god menus, BABEL floors,
  translations, fx sounds) untouched.

## Coordination note — UI declutter gate

The declutter merge was VERIFIED on remote main during this task (branch
`feature/ui-declutter-2026-09-29` is a fully-merged ancestor of main as of
`35f43526`; all 6 declutter code files in main's tree match the branch tip —
only the report markdown differs, amended on main afterward). The gate is
open, so `components/radio/RadioBar.jsx` was touched for exactly two lines:
the `CollabInviteCard` import and its one-line render inside `LibrarySheet`'s
house-station section, right after the Spotify player notice. The other 6
declutter files were not touched:
`app/page.jsx`, `components/GodOrbitRings.jsx`,
`app/waste-extraction/page.jsx`, `tests/god-menus.test.js`,
`tests/ui-declutter.test.mjs`, `reports/ui-declutter-2026-09-29.md`.

## Files changed (this branch)

- `lib/radio/station.js` — `ENCOM_OPENER` + `buildFirstLoadQueue()` + opener
  source label.
- `components/radio/RadioProvider.jsx` — per-user first-load gating,
  `isFirstLoad` / `showCollabInvite` / `dismissCollabInvite` in context.
- `components/radio/CollabInviteCard.jsx` — new, dismissible invite card.
- `components/radio/RadioBar.jsx` — renders `<CollabInviteCard />` inline in
  the library sheet (added after the declutter merge was verified on main).
- `components/SatelliteMenu.jsx` — two-axis Hermes-style slider rewrite.
- `tests/radio-menu.test.mjs` — new, 19 tests green.
- `reports/radio-menu-2026-09-29.md` — this report.

## Verification

- `node --test tests/radio-menu.test.mjs` — 19/19 pass.
- `node --test tests/radio.test.mjs` — existing suite still green.
- Production build: full `next build` compiles + lints + type-checks clean
  with all of this task's source changes (verified in-session). The final
  full build is blocked by ANOTHER agent's unpublished, in-flight
  `app/argo/page.jsx`, which imports `@/hooks/useEntrance` — a hook file that
  does not exist in the worktree (their file, their fix; not touched).
  All 5 changed source files additionally parse-verified with the project's
  TypeScript parser after the final edits.
- Published via incremental GitHub Git Data API (blob SHA diff + base_tree),
  branch `feature/radio-menu-2026-09-29`, merged to main, remote verified.

## Build output (tail)

```
> nexus-vortex@1.0.0 build
> next build

  ▲ Next.js 14.2.35

   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types ...
   (final full pass blocked only by app/argo/page.jsx's missing
   @/hooks/useEntrance import — another agent's unpublished work)
```

## Publish record

- Branch: `feature/radio-menu-2026-09-29` (commit `696e2a82b25112fd7bc25ae0348962a6fd8d255e`)
- First merge attempt parented on `35f43526`; main had moved (bike-wraps
  merge `7a7fefbc`) so the non-fast-forward ref update was correctly rejected.
- Re-merged onto the new tip: merge commit
  `a1eb9ccf0d191934bcda3ea4a66bdbe50723cb05`
  ("Merge feature/radio-menu-2026-09-29: ENCOM first-load + Hermes two-axis menu")
- Remote `main` verified at `a1eb9ccf0d191934bcda3ea4a66bdbe50723cb05`;
  all 7 published file blobs match the worktree.
