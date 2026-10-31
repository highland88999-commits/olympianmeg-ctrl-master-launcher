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
    path: '/models/swamp/canoe-detailed.glb',
    label: 'Detailed canoe',
    rigged: false,
    fallback: 'procedural',
    description:
      'Wooden dugout canoe. Procedural stand-in: shaped hull with gunwales ' +
      'and thwart seats (upgraded from the old box hull).',
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
