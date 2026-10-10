# Middle-earth — open-world Tolkien tribute pocket universe

**Date:** 2026-10-09
**Route:** `/middle-earth` · **Display name:** Middle-earth · **God category:** DIONYSUS (Thrills & Play)
**Status:** Built, tested, published to main, both Vercel projects READY.

## What was built

One continuous open-world journey across Middle-earth, west to east, following the
Fellowship's path. Modes: menu → quest intro → world → tribute. Free exploration
is always allowed; a quiet 8-beat journey thread guides the way. Progress persists
per user in `localStorage` (`olympus:middleearth:progress`).

**8 regions, 8 quest beats:**

| # | Region | Beat |
|---|--------|------|
| 1 | The Shire (Hobbiton) | Leave the Shire — reach the East Road |
| 2 | Rivendell | The Council — reach the terrace |
| 3 | Moria | The Bridge of Khazad-dûm — cross west gate → bridge → east gate |
| 4 | Lothlórien | The Mirror — reach Galadriel's glade |
| 5 | Mirkwood | Through the Dark Wood — thread the forest trail |
| 6 | Rohan (Edoras) | The Golden Hall — reach Meduseld |
| 7 | Gondor (Minas Tirith) | The White City — stand at the citadel |
| 8 | Mordor (Black Gate, Barad-dûr, Mount Doom) | The Fire — reach the summit |

Completing the final beat opens a quiet tribute screen:
*"In tribute to J.R.R. Tolkien, who wrote for his son."* — restrained, slow fade, no fanfare.

## Files (all new, published)

- `app/middle-earth/page.jsx` — shell: menu → quest intro → world → tribute.
  Walk mode reuses the shared standard (`lib/world/walk-controls`,
  `lib/world/walk-input`, `components/world/WalkJoystick`). Region-name HUD
  + "You have entered …" toasts, objective banner + pips, beat intro/complete
  overlays, WebGL-fail message, Safari-safe clearances.
- `app/middle-earth/world.js` — one continuous 680×320 terrain (PlaneGeometry,
  seeded fbm ±3), vertex colors by region biome, Moria canyon walls, Gondor
  mountain wall, Mordor roughening + red tint near Mount Doom. 7 decorative
  region-gate arches with gold labels (free passage — never blocking), quest
  beacons (checkpoint rings + additive target pillar), per-region ambient
  scatter, localized point lights (red flicker at Mount Doom, warm at
  Rivendell/Lórien/citadel).
- `app/middle-earth/landmarks.js` — 16 procedural landmark types
  (hobbit-hole, party-tree, green-dragon, rivendell-terrace, waterfall,
  moria-door, moria-bridge, mallorn-tree, galadriel-mirror, mirkwood-web,
  edoras-hall, minas-tirith, black-gate, barad-dûr, mount-doom, arganath)
  + 7 ambient types (sheep, deer, horse, bird, firefly, ember, orc-sentry).
  All original geometry, flat-shaded, no shadow maps, local-space colliders.
- `app/middle-earth/textures.js` — 15 procedural canvas texture/sprite makers.
  Lava/rock/smoke/ember techniques adapted from the `app/mount-doom` foundry
  (Merlin's extend-never-rebuild rule: the 2D observatory's visual language
  carries into the 3D Mordor; the `/mount-doom` page itself is untouched).
- `app/middle-earth/data.js` — regions, quests, pure progression helpers.
- `app/middle-earth/tests/data.test.mjs` (10 tests), `tests/builders.test.mjs` (5 tests).

## Registry wiring (published)

- `lib/god-menus.js` — `middle-earth` added to DIONYSUS satellites.
- `lib/i18n/satellites.ts` — dual-registry entry
  `{ key: "middle-earth", route: "/middle-earth", pos: "DIONYSUS", section: "GAMES", constellation: "ZEUS" }`.
- All 31 locale files — `sat.middleearth.title` = "Middle-earth",
  `sat.middleearth.subtitle` = "An open-world tribute across Middle-earth."
  (built from main's versions via the stale-worktree clobber guard — no keys lost).

## Tests

- `node --test app/middle-earth/tests/data.test.mjs` → **10/10 pass**
- `node --test app/middle-earth/tests/builders.test.mjs` → **5/5 pass**
- `npm run build` → **green**; `/middle-earth` in route manifest.

## Quality bar

- Zero external requests: all textures procedural canvas, no CDNs/fonts/hotlinks.
- Solid geometry: circle colliders push out (slide/deflect); bounds contain;
  region gates are decorative only.
- Lighting: Mordor dark but readable (hemisphere floor kept up, lava/eye
  emissive small and localized); Elven lands luminous, textures intact.
- Mobile-first: touch joystick + drag-look, minimal HUD, safe-area constants
  mirrored from the Star Wars shell.
- All quest text is original; no Tolkien poems, songs, or quoted text.
  Place-names used as factual labels only.

## Build notes (for the record)

- Reachability fix caught headless before publish: two landmark colliders would
  have made beats unreachable (minas-tirith r10 == target r10, mount-doom r16 >
  target r10) — scaled to 0.9 / 0.55. All 8 quests' targets/checkpoints verified
  reachable.
- Ambient wrapper: sibling's bird/deer/firefly/ember update() drives group
  position absolutely, so world.js wraps each in a parent holder at the scatter
  point; critters animate locally.
- Worktree is stale (feature/rogers-arena-live); registry agent fetched all 33
  registry files from main before editing — worktree copies of god-menus.js and
  satellites.ts were already in sync with main.

## Follow-ups (not built)

- **Achievements:** 3 Middle-earth achievements + cinematic video prompts
  (queued per Merlin's "videos for achievements always" rule).
- **No PvP in v1** — exploration universe by design.
- **iPhone QA needed:** Merlin's eyes on walk feel across the full 680-unit
  span, region-transition toasts, Mordor readability in daylight, frame rate
  with all landmarks + ambient live.

## Publish

- 40 files via explicit GitHub Contents API PUTs to main:
  - Module (8): `app/middle-earth/{page.jsx, world.js, textures.js,
    landmarks.js, data.js, tests/data.test.mjs, tests/builders.test.mjs}` +
    `reports/middle-earth-2026-10-09.md`
  - Registry (32): `lib/god-menus.js`, `lib/i18n/satellites.ts`, 31 locale files
- Main tip: `<SHA>`
- Vercel `nexus`: **READY** on `<SHA>`
- Vercel `olympianmeg-ctrl-master-launcher`: **READY** on `<SHA>`
