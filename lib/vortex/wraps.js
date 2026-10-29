// lib/vortex/wraps.js
// The vortex skin picker (Merlin, 2026-10-29).
//
// Every ride draws TWO DIFFERENT random graphics from the full ecosystem
// pool (lib/vortex/wraps-manifest.js — every image in public/):
//   - outside: the skin watchers see on the tube's outer wall
//   - inside:  the skin the rider sees on the inner wall
//
// House rules, every ride:
//   1. outside and inside are never the same file — the outside crowd
//      always sees a different skin than the rider inside.
//   2. neither pick repeats either pick from the previous ride — no
//      texture ever appears in back-to-back vortexes.
//
// The tube component keeps the previous pair (a ref is enough — it only
// matters for consecutive rides in the same session) and passes it as
// `prev`. First ride of a session passes null.

import { VORTEX_WRAP_FILES } from './wraps-manifest.js';

// Pure + testable: draw a pair from any file list.
export function pickVortexPair(files, prev, rand = Math.random) {
  const banned = new Set();
  if (prev) {
    if (prev.outside) banned.add(prev.outside);
    if (prev.inside) banned.add(prev.inside);
  }
  const draw = (extraBanned) => {
    let cands = files.filter((f) => !banned.has(f) && !extraBanned.has(f));
    if (cands.length === 0) cands = files.filter((f) => !extraBanned.has(f));
    if (cands.length === 0) cands = files;
    if (cands.length === 0) return null;
    return cands[Math.floor(rand() * cands.length)];
  };
  const outside = draw(new Set());
  const inside = draw(new Set([outside]));
  return { outside, inside };
}

// The real pool: every ecosystem graphic.
export function pickVortexWraps(prev) {
  return pickVortexPair(VORTEX_WRAP_FILES, prev || null);
}

export { VORTEX_WRAP_FILES };
