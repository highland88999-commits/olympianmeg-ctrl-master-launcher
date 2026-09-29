# Luge hull wraps regen — 2026-09-29

Unit 2b of the overnight build queue. Regenerated the three recreated-from-description
luge hull wraps (`hull-g2`, `hull-p3`, `hull-p11`) to the masterpiece bar.

## Descriptions (found, not invented)

The OG livery descriptions were already recorded in the provenance header of
`lib/luge_data.js`, sourced from `highland88999-commits/Luge-Refuge` `src/bobsleds/*.py`:

- **hull-g2.webp — Urban Glider:** OG is COMPOSITE_GRAY (128,128,128) with
  adaptive fins + neon underglow.
- **hull-p3.webp — Street Samurai:** OG is BLADE_SILVER (192,192,192) with
  red samurai runes + green edges.
- **hull-p11.webp — Rift Marauder:** OG is RIFT_GRAY (100,100,100) with
  violet vortex emitters.

## What was generated

All three regenerated via the media image pipeline, 1600x1600 WebP (quality 92),
full-bleed edge-to-edge, no grid lines, no bars, no text, no debug artifacts:

- **hull-g2:** composite-grey brushed metal with diagonal fin plates and
  magenta underglow smoke rising from beneath, cyan-white energy threads.
- **hull-p3:** blade-silver brushed steel with crimson rune-like smoke motifs
  and a vivid green glowing blade edge.
- **hull-p11:** rift-grey torn open by violet vortex spirals and glowing
  emitter cores, warped distorted energy.

Each was visually inspected before installation. The earlier seeded procedurals
(`scripts/gen-luge-wraps.py` output — flat test-pattern renders) were retired.

## Honesty labeling

The sled picker keeps the provenance label intact: these three are
**recreations-from-description, never originals**. The header comment in
`lib/luge_data.js` was updated to describe the new renders and the retired
generator script; the "recreations-from-description, not OG assets" line is
unchanged, and a headless test asserts it stays that way.

## Tests

- `tests/luge-hulls.test.js` (new): 22/22 green — file existence, non-trivial
  size, valid WebP bytes (RIFF/WEBP + VP8 header probe), minimum + expected
  1600x1600 dimensions, honesty-label check.
- `tests/luge/test-luge.mjs`: 135/135 green.
- Full suite: green except one pre-existing, unrelated failure in
  `tests/tools.test.js` ("every section constellation has an ACCENT entry") —
  zero luge references; not caused by this change.

## Build

Production build green: `NODE_OPTIONS=--max-old-space-size=6144 npm run build`
(exit 0).

## Publish

- Feature branch: `feature/luge-hull-wraps-regen-2026-09-29`
- Published via the incremental GitHub Git Data API pattern (fetch remote main
  tree, diff by blob SHA, upload only changed blobs, tree with base_tree,
  commit parented on the main tip, merge commit onto main with tip re-fetch /
  re-base, verify ref update).
- 6 files: the 3 wraps, `lib/luge_data.js`, `tests/luge-hulls.test.js`, this report.

## Merlin-only items

None from this unit. No env vars, webhooks, or SQL changes.
