# Full-Scale UI Review + Optimization — 2026-09-29

Merlin: "Do a full scale review and look for well functions layouts. CSS styles… optimize everything in one major upgrade!"

Method: three specialist auditors (CSS/design tokens, route layouts, performance) swept the
master launcher read-only — 159 pages, 610 source files, 3 stylesheets, Tailwind theme.
Full per-file evidence lives in /tmp/css-audit.md, /tmp/layout-audit.md, /tmp/perf-audit.md.

## Executive summary

The app is big, ambitious, and visually striking — but its UI layer grew by accretion, not
architecture. The headline finding: **there is no shared design system**. 1,155 inline styles
across 139 files, 7 cyans / 4+ golds / 9 near-blacks invented per-page, a placement language
(`.scroll-page`, `.page-shell`, `.page-col`) that was built but has **zero adopters**, dead
Tailwind theme tokens, and the same radio-bar spacer copy-pasted 79 times. Performance-wise:
no `next.config` at all, zero `next/image` usage, a 302 MB `public/` folder, 69% client-component
pages, and three.js statically imported on the home route. Layout-wise: 10 pages have genuinely
broken bottom UI (controls hidden under the radio bar — two are game-breaking on mobile), and
25 pages use `100vh`/`h-screen` without `dvh` fallbacks.

The good news: none of this is structural. It's consolidation work, and it's all mapped below.

## What's working (keep these)

- **Home constellation scene** (app/page.jsx): towers + Earth + sun/Mars + god bands is the
  signature look. The declutter pass (portal gates removed, bands visual-only) restored the
  original composition. Do not redesign — optimize around it.
- **Placement language in globals.css** (`.page-shell`, `.page-col`, `.page-header`, `.page-back`,
  `--player-clear`): well-designed, just never adopted. The fix is adoption, not replacement.
- **RadioBar**: global, persistent, safe-area aware (`env(safe-area-inset-bottom)`). The new
  transport strip above it is correct. Its *clearance value* is the thing everyone reimplements.
- **PageBack.jsx**: history-aware back button, 44px target, hub fallback. Used by 1 page;
  60 hand-rolled variants exist. The fix is migration, not invention.
- **next/font (Inter)** in the root layout — correct; some pages bypass it with render-blocking
  Google Fonts `<link>`s (see P1).
- **stake.com native ad inventory** (app/page.jsx constellation towers, god components): intact,
  untouched by this review and must stay that way.

## CSS / design-token findings

1. **Dead CSS (~21 lines)**: `.scroll-page`, `.scroll-clear`, `.page-shell`, `.page-col` in
   app/globals.css have 0 usages repo-wide. `.page-header`/`.page-back` survive on 1 usage each.
2. **Dead Tailwind tokens**: `jet`, `cerberus.*` in tailwind.config.js — 0 usages. Delete or adopt.
3. **Inline-style sprawl: 1,155 occurrences in 139 files.** Worst: app/hephaestus/page.jsx (107).
   Most-repeated: single-prop `{color:…}` (65×), `{height:…}` (47×), `{touchAction:'none'}` (32×),
   eyebrow `{color,fontSize,letterSpacing}` chains (34×), `env(safe-area-inset-bottom)` inline (50 files),
   63 fragmented `fontFamily` values.
4. **Most-duplicated className**: radio-bar spacer `h-[calc(4.5rem+env(safe-area-inset-bottom))]` —
   **79× in 77 files**, plus a competing `h-[max(5rem,…)]` variant (12×). One class kills ~90 dups.
5. **Token chaos**: 7 cyans, 4+ golds, 9 near-blacks, 6 radius variants mixed interchangeably.
   Worst offenders: hephaestus (107 inline, 0 tailwind colors), truman (all-inline shorthand hex),
   alexandria (custom `#08f7fe`), enyo (6 radii in one page).
6. **No shared UI library**: 107 components, zero Button/Card Badge Input Modal. 13 hand-rolled
   back buttons vs 1 PageBack usage.
7. **Global leak**: `fortress.css` `:root` redefines `--cyan/--god-gold/…` globally (Next hoists
   nested-layout CSS); 5 non-fortress pages consume the leaked vars. Scope to `.fortress-*`.
8. **Name collision**: grief-gully redefines `.page-header` locally in styled-jsx, colliding with
   the global placement class.

## Layout findings

1. **Placement language adoption: 0/159 pages.** Every page hand-rolls scroll + clearance.
2. **Radio-bar overlap (genuinely broken)**: labyrinth D-pad fully under the bar (game-breaking),
   omega-pinball plunger/mute covered, nova joystick bottom third under bar+strip, phone-home
   6-tab nav hidden under bar with ~35px targets, museum last rows slide under bar, basketball
   inner scroller `py-10` insufficient, chess `h-screen overflow-hidden` ×2 with no inner scroller,
   publisher-studio `height:100vh` + `overflow:hidden` (no scroll possible), excalibur/guillotine/
   hercules HUD at 1rem clearance.
3. **Key measurement**: the bar + transport strip obstruct **~5.5–6rem + safe-area**, not 4.5rem.
   The 79× spacer clears the bar but NOT the strip — every page using it is still ~1rem short.
4. **25 pages use `100vh`/`h-screen` without `dvh`** (8 literal `100vh`: blueprint-protocol,
   cerberus, publisher-studio, rem, resume, tools, user-profile, vault; 17 Tailwind h-screen roots
   incl. agora ×4, chess, basketball, persephone, phone-home; plus home root `h-screen` and the
   satellite dialog `max-h-[70vh]`).
5. **9 silent-clipping roots**: `overflow-hidden` on non-fixed pages (chess, publisher-studio,
   hitchhikers-guide, iq-test, pearl, phone-home, world-engine/engine).
6. **60 hand-rolled back navigations** ("Back", "←", "EXIT", "EXIT MATRIX", "‹", "Close").
7. **Small touch targets**: RadioBar `iconBtn` (p-2, the most-tapped global UI), phone-home tabs,
   CollabInviteCard close, py-1 text buttons (world-engine, studio, terminal, forge, holoframe).

## Performance findings

1. **No next.config.* exists.** Costs: no `optimizePackageImports`, no `images` config, no
   `removeConsole`, no headers. (Fixed in Phase 2a — new next.config.js.)
2. **23 raw `<img>` across 16 files; `next/image` used 0 times.** Worst: app/profile/page.jsx:443
   (eager unsized photo grid), app/medusa/lair/page.tsx:379 (eager artifact grid),
   app/rogers-arena/tickets.jsx:371 (full-width seat maps). Layout shift + over-fetching.
3. **`public/` is 302 MB**: 159 MB video incl. 11× `.mov` (unplayable on Chrome/Edge/Android),
   165 PNG/JPG vs 29 WebP/AVIF, a duplicated 9.4 MB `.mov`. ~100+ MB reclaimable.
4. **69% client pages** (110/159 with `'use client'`; 198 client files total). Static pages
   (resume, manuscript-forge, hitchhikers-guide…) ship JS for no reason.
5. **`next/dynamic` in only 5 files.** Home page statically imports fiber+drei+postprocessing+three
   (~1 MB+ JS; three alone 674 KB minified) on first paint — the biggest LCP lever is
   code-splitting the home 3D scene with `ssr:false`.
6. **Zero `React.memo` anywhere.** Hover states in the mythic tower ad panels re-render heavy
   subtrees; memoizing Ares/Argus/Medusa/Thoth/Zeus is cheap and high-value.
7. **Render waste**: `new THREE.MeshStandardMaterial` allocated in render bodies
   (components/Ares.jsx:87, Thoth.jsx:87 — same files carry the stake.com inventory: memoize
   around the ads, never touch them); 9 rAF loops without `cancelAnimationFrame`; 6
   `addEventListener` without cleanup.
8. **Fonts**: render-blocking in-body Google Fonts `<link>`s (app/alexandria/page.tsx:304-306)
   and `<style>@import`s (geometry-engine, publisher-studio, vault) — move to `next/font`.
9. **three imported in 66 files**, fiber in 47, drei in 27 — `optimizePackageImports` (Phase 2a)
   trims the barrel-import cost without touching a line of scene code.

## Accessibility basics

- `maximumScale: 1, userScalable: false` in root viewport — blocks pinch zoom (WCAG failure).
  Recommend removing both; keep `initialScale: 1`.
- Touch targets below 44px in the most-tapped global UI (RadioBar) and phone-home tabs.
- Focus states: `.page-back` has `:focus-visible`; hand-rolled buttons mostly don't — the
  shared Button primitive (Phase 2a) fixes this going forward.
- `user-select: none` on `body` (globals.css) — kills text selection app-wide, including
  manuscript/reading pages. Scope it to canvas/game roots.

## Prioritized fix list

### P0 — broken UI (user-facing damage now)
- [ ] labyrinth: D-pad under radio bar (game-breaking on mobile) — move to
      `bottom-[calc(5.5rem+env(safe-area-inset-bottom))]`
- [ ] omega-pinball: plunger/mute controls covered — same fix
- [ ] nova: joystick bottom third under bar+strip; add HUD z-index
- [ ] phone-home: 6-tab nav hidden under bar; raise targets to 44px
- [ ] museum: zero bottom padding — add player-clearance padding
- [ ] chess: `h-screen overflow-hidden` ×2, no inner scroller — board clips on mobile Safari
- [ ] publisher-studio: `height:100vh` + `overflow:hidden` — content unreachable, no scroll

### P1 — systemic (one fix, dozens of pages)
- [ ] Replace the 79× radio-bar spacer with one `.player-clear` class — and fix its value to
      5.5rem (it currently misses the transport strip)
- [ ] Adopt-or-delete the placement language: migrate pages onto `.scroll-page`/`.page-shell`/
      `.page-header`/`.page-back` (or delete the dead CSS); fix grief-gully's `.page-header` collision
- [ ] Canonical palette sweep: 7 cyans → `#00f2ff`, 4+ golds → `#ffd700`, 9 blacks → surface scale
      (lib/design-tokens.js is now the source of truth — Phase 2a)
- [ ] Migrate 60 hand-rolled back buttons → shared BackButton (`@/components/ui`)
- [ ] Migrate 23 `<img>` → `next/image` with `sizes` + dimensions (profile, medusa/lair, rogers-arena first)
- [ ] `100vh`/`h-screen` → `dvh` sweep (25 pages)
- [ ] Scope `fortress.css` `:root` vars into `.fortress-*` (stops the global leak)
- [ ] Move render-blocking font `<link>`/`<style>@import` → `next/font`
- [ ] Remove `maximumScale: 1, userScalable: false` (pinch-zoom block); scope `user-select: none`
      off body

### P2 — performance depth
- [ ] Code-split the home 3D scene (`next/dynamic`, `ssr:false`) — biggest LCP lever
- [ ] `public/` diet: 11 `.mov` → mp4/webm, large PNGs → WebP, dedupe 9.4 MB duplicate (~100 MB saved)
- [ ] Convert static client pages → server components (resume, manuscript-forge, hitchhikers-guide…)
- [ ] `React.memo` on Ares/Argus/Medusa/Thoth/Zeus panels (around the stake.com inventory, never touching it)
- [ ] Move `new THREE.*` allocations out of render bodies into `useMemo`
- [ ] Add `cancelAnimationFrame` / listener cleanups (9 rAF loops, 6 listeners)
- [ ] Delete dead Tailwind tokens (`jet`, `cerberus.*`) or adopt them

## Phase 2a — shipped in this upgrade (2026-09-29)

New files only (zero changes to existing code — safe to land while other builders are in flight):

- `next.config.js` — the repo's first. `optimizePackageImports` for drei/fiber/postprocessing/
  lucide/framer-motion/three; `images.remotePatterns` + avif/webp (prerequisite for the
  `<img>`→`next/image` migration); `removeConsole` in production (keeps error/warn).
- `lib/design-tokens.js` — canonical palette (one cyan `#00f2ff`, one gold `#ffd700`,
  unified surface/text/line scales), radii, spacing (incl. `playerClear` mirroring
  `--player-clear`), type scale, 44px touch floor, Tailwind arbitrary-value helpers.
- `components/ui/` — Button (4 variants, 44px targets, focus-visible), Card, Badge (canonical
  eyebrow chain), BackButton (re-exports the existing PageBack — no duplication), index.
- `tests/fullscale-ui.test.mjs` — 3/3 green (tokens, primitives, config).
- This report.

Verification: new tests 3/3 green; `next.config.js` loads clean in node. Full production build
was deliberately NOT run locally — the 8 GB box is shared with 4 sibling builders running
concurrent full Next.js builds (previous session: repeated OOM kills). The change is purely
additive (no existing file touched), so local build risk is nil; **Vercel's production build
on merge is the final gate.**

## Phase 2b — HELD for tree cooldown (do not start until in-flight publishes land)

The wide sweeps touch 77+ files shared with active builders (ui-declutter finisher, radio/menu,
erebus, battleship-oasis, human-ai council). Starting them now would collide with their
allowlisted publishes. Run as one follow-up task when the tree is quiet:

1. `.player-clear` class + fix value to 5.5rem; replace all 79+12 spacer copies
2. P0 layout repairs (7 pages above)
3. Placement-language adoption sweep (or dead-CSS deletion)
4. Canonical palette sweep onto `lib/design-tokens.js` (hephaestus, truman, alexandria, enyo first)
5. 60 back buttons → `@/components/ui` BackButton; hand-rolled panels → Card/Badge/Button
6. 23 `<img>` → `next/image`; `public/` diet (~100 MB)
7. `100vh`/`h-screen` → `dvh` (25 pages); 9 silent-clipping roots fixed
8. `fortress.css` `:root` scoping; grief-gully collision fix
9. Home 3D scene code-split; static pages → server components; `React.memo` on god panels;
   render-body allocation cleanup; rAF/listener cleanups
10. Font `<link>`s → `next/font`; viewport pinch-zoom restore; `user-select` scoping
11. Dead Tailwind token deletion

## Constraints honored

- stake.com native ad inventory untouched (only memoization *around* it is ever proposed).
- No pop-ups, no predatory UX, no visual redesign — polish and optimization only.
- Per-user state untouched. No Supabase SQL. No payments. No settings changes.
- Scroll + Safari safe-area clearance is the #1 layout criterion throughout (P0).
