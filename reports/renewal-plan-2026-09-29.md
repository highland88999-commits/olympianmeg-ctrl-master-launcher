# Renewal Plan — 2026-09-29

Merlin's written product roadmap ("OLYMPUS MEET THE GODS RENEWAL PLAN //
RENEWAL PLAN TIMELINE (ZIG-ZAG)", renewalTimeline array from his Gemini
history) is now a first-class, app-wide presence in the launcher.

## Source of truth

`lib/renewal-plan.js` — the 8 nodes with his titles and descriptions verbatim,
his catbox demo videos, and the original prototype links. Module deep-links
were verified against `app/` on disk; nothing was invented:

| # | Title | Launcher module | Status |
|---|-------|-----------------|--------|
| 1 | OUTDOOR AIR PURIFIERS | /aetheris | built |
| 2 | PURIFIER INSTALLATION TRACKING SYSTEM | /olympus-aetheris | built |
| 3 | AETHERIS BUSINESS MODEL | /aetheris | built |
| 4 | AURA GENESIS | — (original prototype link only) | prototype |
| 5 | LAND/WATER WASTE EXTRACTION | /waste-extraction | built |
| 6 | MORDOR | /mordor-smelting | built |
| 7 | ATLANTIS | /atlantis | built |
| 8 | BEYOND THE GODS | — (no link) | future, labeled honestly |

## What was built

- `app/renewal-plan/page.jsx` — the zig-zag timeline route. Alternating
  left/right node cards on desktop, stacked on mobile. Each node opens an
  inline (never modal) holographic detail view: verbatim copy, demo video
  mounted only when opened (lazy), "Launch in Olympus" where a module exists,
  original prototype links labeled as originals. Node 8 shows as future with
  no invented module. Reduced-motion aware; scroll clearance + safe-area
  padding; deep-linkable anchors (`/renewal-plan#node-3`).
- `components/RenewalPlanBadge.jsx` — the quiet "◈ Part of the Renewal Plan"
  cross-link, rendered on the 5 module pages (aetheris → node-1,
  olympus-aetheris → node-2, waste-extraction → node-5, mordor-smelting →
  node-6, atlantis → node-7).
- `app/page.jsx` — a compact "◈ RENEWAL PLAN" pill on the hub next to INTRO,
  same styling language, links to /renewal-plan.
- No new Supabase tables. No payments, no currency, no secrets. No pop-ups.

## Verification

- `tests/renewal-plan.test.mjs`: 9/9 green — verbatim copy, video URLs,
  module-route existence on disk, prototype/future honesty, helpers.
- `npm run build`: green.
