// lib/swamp-run/models.js
// SWAMP RUN — Tripo model slots.
//
// Merlin's order (2026-10-31, from his gameplay video): real rigged
// alligator, real rigged crocodile, real detailed canoe — generated in
// Tripo and dropped into the slots below. Tripo balance was 10 credits
// on the night, not enough to generate; the game ships with procedural
// stand-ins and picks up the GLBs automatically the moment they land.
//
// SHOPPING LIST — generate these three in Tripo (rigged stage) when
// credits are topped up, then save to the paths shown:
//
//   1. "rigged alligator" — American alligator, dark olive-green,
//      broad U-shaped snout, ~4m long. RIGGED (swim + lunge + jaw).
//      -> public/models/swamp/alligator-rigged.glb
//
//   2. "rigged crocodile" — Nile-style crocodile, grey-green, narrow
//      V-shaped snout, ~5m long, visibly distinct from the alligator.
//      RIGGED (swim + chase + jaw).
//      -> public/models/swamp/crocodile-rigged.glb
//
//   3. "detailed canoe" — wooden dugout canoe, ~3.6m, carved hull,
//      gunwales, two thwart seats. UNRIGGED (static prop).
//      -> public/models/swamp/canoe-detailed.glb
//
//   4. "detailed cypress" — bald cypress, buttress trunk, Spanish moss.
//      UNRIGGED (instanced).
//      -> public/models/swamp/cypress-detailed.glb
//
// All four landed in Batch 8 (2026-10-31) and are wired into the scene
// (components/swamp-run/SwampRunScene.jsx, Merlin 2026-11-01).
//
// PERF NOTE: the Tripo "detailed" models are ~1.9M triangles each.
// The scene loads decimated -low derivatives (gltf-transform simplify;
// originals untouched): cypress-detailed-low.glb (~14.5K tris, instanced
// ×420 = ~6M tris in one draw call) and canoe-detailed-low.glb (~48K
// tris, one hero object). The rigged gator/croc are ~7K tris each and
// load full-resolution. If a phone struggles, the procedural
// stand-ins remain one fallback away.
//
// Naming matters: the loader below checks these exact paths. Drop the
// file in, no code changes needed — the procedural stand-in steps aside.
//
// Rig check (per AGENTS.md): rigged models must verify JOINTS_0 /
// WEIGHTS_0 / POSITION as sets with stride-aware reads, and inverse-bind
// matrices bit-exact. Never meshopt-compress a rigged GLB.

export const MODEL_SLOTS = {
  alligator: {
    path: '/models/swamp/alligator-rigged.glb',
    label: 'Rigged alligator',
    rigged: true,
    fallback: 'procedural',
    description:
      'American alligator ambush predator. Procedural stand-in: dark olive ' +
      'low-profile body, broad U snout, lurks near banks.',
  },
  crocodile: {
    path: '/models/swamp/crocodile-rigged.glb',
    label: 'Rigged crocodile',
    rigged: true,
    fallback: 'procedural',
    description:
      'Nile-style crocodile hunter. Procedural stand-in: grey-green box-built ' +
      'body, narrow V snout, patrols the deep channels.',
  },
  canoe: {
    path: '/models/swamp/canoe-detailed-low.glb',
    label: 'Detailed canoe',
    rigged: false,
    fallback: 'procedural',
    description:
      'Wooden dugout canoe. Procedural stand-in: shaped hull with gunwales ' +
      'and thwart seats (upgraded from the old box hull).',
  },
  cypress: {
    path: '/models/swamp/cypress-detailed-low.glb',
    label: 'Detailed cypress',
    rigged: false,
    fallback: 'procedural',
    description:
      'Bald cypress with buttress trunk and Spanish moss. Procedural ' +
      'stand-in: flared trunk with three canopy puffs, instanced per tree.',
  },
};

/**
 * Which renderer to use for a slot: 'glb' when the file is present,
 * 'procedural' until Merlin drops the Tripo model in.
 *
 * In the browser the scene checks availability at load (a HEAD fetch);
 * in headless tests every slot reports 'procedural' — the stand-ins are
 * the contract the game logic is tested against.
 */
export function slotRenderer(slotKey) {
  const slot = MODEL_SLOTS[slotKey];
  if (!slot) return 'procedural';
  if (typeof window === 'undefined') return 'procedural';
  // The scene sets window.__swampModels[slotKey] = true after a
  // successful GLB load; until then the procedural stand-in renders.
  try {
    return window.__swampModels && window.__swampModels[slotKey] ? 'glb' : 'procedural';
  } catch {
    return 'procedural';
  }
}

/** Mark a slot as loaded (called by the scene after a GLB mounts). */
export function markSlotLoaded(slotKey) {
  if (typeof window === 'undefined') return;
  window.__swampModels = window.__swampModels || {};
  window.__swampModels[slotKey] = true;
}

// ── Jaw hinge tuning (Merlin, 2026-11-01: "I want the jaws") ──────
// The Batch 8 Tripo rigs have no jaw bones and no animation clips, so
// the bite is a vertex-shader hinge applied in BIND space (the
// `position` attribute), ahead of the skinning chunk. Measured from
// the real bind geometry (stride-aware reads): both models face +x
// with up +y in bind space; the skinning's 90° yaw turns the
// bind-space z-rotation into a screen-space pitch-down. Jaw-region
// vertices (below the mouth line, forward of the hinge) rotate about
// the jaw joint; a dark cavity inside the skull covers the opening.
export const JAW_PARAMS = {
  alligator: {
    hinge: [0.12, 0.07, -0.12],
    mouthA: 0.07, // mouth-line y at the hinge…
    mouthB: 0.116, // …rising toward the snout tip
    hingeX: 0.12,
    zc: -0.12, zHalf: 0.13,
    feather: 0.035, maxAngle: 0.45,
    cavityPos: [0.305, 0.081, -0.09],
    cavityScale: [0.15, 0.03, 0.07],
  },
  crocodile: {
    hinge: [0.23, 0.078, -0.1],
    mouthA: 0.078,
    mouthB: 0.212,
    hingeX: 0.23,
    zc: -0.1, zHalf: 0.11,
    feather: 0.035, maxAngle: 0.45,
    cavityPos: [0.36, 0.096, -0.08],
    cavityScale: [0.12, 0.03, 0.06],
  },
};
