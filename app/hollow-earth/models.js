// OLYMPIAN MONSTERVERSE — batch-4 model placements (pure data).
//
// PROVENANCE, not a second mapping: spawns.js MONSTER_MODELS is
// still the one slot→path scheme (`/models/hollow-earth/<key>.glb`,
// dragons by name, Korus by his own seat). This file records
// WHICH batch-4 artifact file fills each seat, so Merlin can
// correct any call: every placement below is a judgment call
// matched by element first, then attitude/form/name, because no
// prior batch ever landed a model at these paths — the earlier
// batches lived only as staged files, so there was no slot→model
// table to replace, only identities to match. Rigged re-sends
// take the seat of their unrigged namesake by identity; the
// batch-3 seven take their dragon/boss/element seats; the ten
// new creatures + the fantasy creature become EXTRA_FAMILIES
// (families.js), never squeezed into ill-fitting slots.
//
// OPTIMIZATION (2026-10-26): every file below was optimized
// with the RIGGED recipe only — dequantize → dedup → prune →
// WebP-1024 textures, float geometry, NO EXT_meshopt_compression
// (meshopt silently inflated rigged bounds ~2.04× in Oct 2026).
// POSITION / JOINTS_0 / WEIGHTS_0 / inverse-bind matrices were
// verified BIT-EXACT after optimization, not counts alone.
// Optimized masters live in ~/workspace/hollow-earth-assets/
// optimized/; the repo copies below are those files, unedited.
// Staged originals in ~/workspace/character-batch-4/ were never
// overwritten. No entry was added to public/models/manifest.json
// (out of scope for this job — the coordinator owns registries).

export const GHORRUM_MODEL = { url: '/models/hollow-earth/ghorrum.glb', height: 8 };

// key = MONSTER_MODELS key (slot key, dragon name, or extra-family
// key). artifactId = batch-4 artifact id from SORT.md.
export const BATCH4_PLACEMENTS = [
  // ---- rigged re-sends: same model, rigged copy, by identity ----
  { key: 'slot-02', artifactId: 78, staged: 'lava-demon-3d-model.glb', name: 'Cinderjaw', role: 're-send of batch-1 lava demon, now rigged' },
  { key: 'slot-22', artifactId: 79, staged: 'demon-creature-3d-model.glb', name: 'The Grinning Ember', role: 're-send of batch-1 demon creature, now rigged' },
  { key: 'slot-10', artifactId: 81, staged: 'ice-yeti-3d-model.glb', name: 'Old White', role: 're-send of batch-2 ice yeti, now rigged — exact slot match' },
  { key: 'slot-14', artifactId: 83, staged: 'fiery-lava-demon-3d-model.glb', name: 'Magma Maw', role: 're-send of batch-1 fiery lava demon, now rigged' },
  { key: 'slot-17', artifactId: 84, staged: 'tornado-monster-3d-model.glb', name: 'Howler', role: 're-send of batch-2 tornado monster, now rigged — storm seat' },
  { key: 'slot-26', artifactId: 86, staged: 'smoke-monster-3d-model 2.glb', name: 'Ashwraith the Second', role: 're-send of batch-2 smoke monster 2, now rigged' },
  { key: 'slot-18', artifactId: 87, staged: 'lava-monster-3d-model 2.glb', name: 'Slagheart the Second', role: 're-send of batch-2 lava monster 2, now rigged' },
  { key: 'slot-30', artifactId: 88, staged: 'demon-monster-3d-model.glb', name: 'Malice', role: 're-send of batch-2 demon monster, now rigged' },
  { key: 'slot-06', artifactId: 89, staged: 'lava-golem-3d-model.glb', name: 'Emberhold', role: 're-send of batch-2 lava golem, now rigged' },
  { key: 'slot-08', artifactId: 90, staged: 'fiery-demon-3d-model 2.glb', name: 'Inferna the Second', role: 're-send of batch-2 fiery demon 2, now rigged' },
  { key: 'slot-43', artifactId: 91, staged: 'giant-demon-3d-model.glb', name: 'Colossus Grimm', role: 're-send of batch-2 giant demon, now rigged — colossus seat' },
  { key: 'slot-01', artifactId: 92, staged: 'acid-monster-3d-model.glb', name: 'Vitriol', role: 're-send of batch-2 acid monster, now rigged' },
  { key: 'slot-19', artifactId: 93, staged: 'lightning-demon-3d-model.glb', name: 'Volta', role: 're-send of batch-2 lightning demon, now rigged' },
  { key: 'slot-20', artifactId: 94, staged: 'golden-lightning-monster-3d-model.glb', name: 'Auric Storm', role: 're-send of batch-2 golden lightning monster, now rigged' },
  { key: 'slot-23', artifactId: 95, staged: 'sand-vortex-monster-3d-model.glb', name: 'The Whirling Maw', role: 're-send of batch-2 sand vortex monster, now rigged' },
  { key: 'slot-24', artifactId: 96, staged: 'sand-monster-3d-model.glb', name: 'Sirocco', role: 're-send of batch-1/2 sand monster, now rigged' },
  { key: 'slot-03', artifactId: 97, staged: 'armored-demon-3d-model.glb', name: 'Bastion the Blackclad', role: 're-send of batch-2 armored demon, now rigged' },
  { key: 'slot-32', artifactId: 99, staged: 'fiery-demon-3d-model.glb', name: 'Ember Imp Prime', role: 're-send of batch-2 fiery demon, now rigged — skirmisher seat' },
  { key: 'slot-07', artifactId: 100, staged: 'lava-monster-3d-model.glb', name: 'Magmarr', role: 're-send of batch-2 lava monster, now rigged — WEAKEST MATCH, Merlin may move it' },
  { key: 'slot-11', artifactId: 103, staged: 'smoke-monster-3d-model.glb', name: 'Ashwraith', role: 're-send of batch-2 smoke monster, now rigged' },
  // ---- batch-3 seven, now rigged ----
  { key: 'slot-05', artifactId: 98, staged: 'desert-creature-3d-model.glb', name: 'The Dune Lurker', role: 'batch-3 desert creature, now rigged — dune seat' },
  { key: 'slot-29', artifactId: 101, staged: 'plant-in-whirlpool-3d-model.glb', name: 'The Drowned Bloom', role: 'batch-3 plant in whirlpool, now rigged — whirlpool seat' },
  { key: 'korus', artifactId: 102, staged: 'demon-boss-3d-model.glb', name: 'Korus', role: 'batch-3 demon boss, now rigged — the throne seat (KORUS_MODEL)' },
  { key: 'sky-dragon', artifactId: 105, staged: 'storm-dragon-3d-model.glb', name: 'Stormwing', role: 'batch-3 storm dragon, now rigged — sky seat' },
  { key: 'cinder-dragon', artifactId: 106, staged: 'lava-dragon-3d-model.glb', name: 'Cinder Maw', role: 'batch-3 lava dragon, now rigged — ground seat' },
  { key: 'muse-dragon', artifactId: 107, staged: 'purple-dragon-3d-model.glb', name: 'Muse, the Luminous', role: 'batch-3 purple dragon, now rigged — low-hover tribute seat' },
  // ---- new families (EXTRA_FAMILIES) + the fantasy creature ----
  { key: 'wonder', artifactId: 104, staged: 'fantasy-creature-3d-model.glb', name: 'The Unnamed Wonder', role: 'batch-3 fantasy creature, now rigged — new family, no slot fit it' },
  { key: 'scarab-beetle', artifactId: 44, staged: 'scarab beetle 3d model.glb', name: 'Khepri the Jeweled', role: 'new family — sand band' },
  { key: 'embermane-horse', artifactId: 50, staged: 'riding-horse-3d-model.glb', name: 'Embermane', role: 'new family — mountain band, mount candidate' },
  { key: 'umbrax', artifactId: 55, staged: 'dark-dragon-3d-model.glb', name: 'Umbrax the Nightwing', role: 'new family — shadow band, flying' },
  { key: 'aureline', artifactId: 56, staged: 'fantasy-dragon-3d-model.glb', name: 'Aureline the Dawnscale', role: 'new family — mountain band, flying' },
  { key: 'eagle-talon', artifactId: 59, staged: 'bald-eagle-3d-model.glb', name: "Liberty 'Lib' Talon", role: 'new family — mountain band, flying' },
  { key: 'oozealot', artifactId: 64, staged: 'slug-like-creature-3d-model.glb', name: 'Sir Oozealot', role: 'new family — acid band' },
  { key: 'fenris-warg', artifactId: 65, staged: 'fantasy-warg-3d-model.glb', name: 'Fenris the Road-Shadow', role: 'new family — shadow band' },
  { key: 'frostbite-lizard', artifactId: 70, staged: 'snow-lizard-mount-3d-model.glb', name: 'Frostbite the Patient', role: 'new family — frost band, mount candidate' },
  { key: 'dune-maw-2', artifactId: 80, staged: 'sand-monster-3d-model 2.glb', name: 'Dune Maw the Second', role: 'new family — sand band' },
  { key: 'vice', artifactId: 85, staged: 'demon-monster-3d-model 2.glb', name: 'Vice', role: 'new family — poison band' },
];

export function placementFor(key) {
  return BATCH4_PLACEMENTS.find((p) => p.key === key) || null;
}

// PLACEMENT REALITY (2026-10-26): 25 of the 37 placements
// above are placed at their model paths (plus Ghorrum's own
// file = 26 GLBs in public/models/hollow-earth/). The 12 below are
// NOT placed, and no doctored copy was shipped for them: their
// staged files are TRUNCATED — the GLB header's total length
// exceeds the actual file, the trailing PNG texture is cut
// mid-image, and the inverse-bind-matrices block (which sits
// after the images in the BIN) is missing entirely. Geometry
// and skinning arrays survive, but a rigged model without its
// inverse-bind matrices cannot skin correctly, so these seats
// keep their procedural stand-ins until Merlin re-sends the 12
// complete files from Tripo. Re-running the optimizer batch
// (~/workspace/tools/gltf-tools/batch.sh) after the re-send
// places them with no other change. Missing bytes are exact.
export const TRUNCATED_AWAITING_RESEND = [
  { key: 'slot-02', artifactId: 78, staged: 'lava-demon-3d-model.glb', missingBytes: 374914 },
  { key: 'slot-18', artifactId: 87, staged: 'lava-monster-3d-model 2.glb', missingBytes: 128100 },
  { key: 'slot-06', artifactId: 89, staged: 'lava-golem-3d-model.glb', missingBytes: 108722 },
  { key: 'slot-24', artifactId: 96, staged: 'sand-monster-3d-model.glb', missingBytes: 12911 },
  { key: 'slot-03', artifactId: 97, staged: 'armored-demon-3d-model.glb', missingBytes: 43581 },
  { key: 'slot-05', artifactId: 98, staged: 'desert-creature-3d-model.glb', missingBytes: 19596 },
  { key: 'wonder', artifactId: 104, staged: 'fantasy-creature-3d-model.glb', missingBytes: 107419 },
  { key: 'cinder-dragon', artifactId: 106, staged: 'lava-dragon-3d-model.glb', missingBytes: 33753 },
  { key: 'muse-dragon', artifactId: 107, staged: 'purple-dragon-3d-model.glb', missingBytes: 55723 },
  { key: 'umbrax', artifactId: 55, staged: 'dark-dragon-3d-model.glb', missingBytes: 23288 },
  { key: 'frostbite-lizard', artifactId: 70, staged: 'snow-lizard-mount-3d-model.glb', missingBytes: 48903 },
  { key: 'vice', artifactId: 85, staged: 'demon-monster-3d-model 2.glb', missingBytes: 38598 },
];

export function placementStatus(key) {
  return TRUNCATED_AWAITING_RESEND.some((t) => t.key === key) ? 'staged-truncated' : 'placed';
}

// PLACED MODEL KEYS — the single source of truth for which
// monsters actually render. A placement counts as placed only
// when its file is NOT in TRUNCATED_AWAITING_RESEND: 37
// placements minus 12 truncated = 25 keys (16 slot families +
// Korus + sky-dragon + 7 extra families). Ghorrum is NOT here
// — he has his own watcher seat (GHORRUM_MODEL), not a monster
// placement. spawns.js filters the field to PLACED_FIELD_KEYS,
// so a family with no GLB on disk simply does not spawn — and
// returns automatically the moment its re-send lands: removing
// its TRUNCATED entry re-includes it with no other change.
export const PLACED_MODEL_KEYS = BATCH4_PLACEMENTS
  .filter((p) => !TRUNCATED_AWAITING_RESEND.some((t) => t.key === p.key))
  .map((p) => p.key);

// Field-spawnable placed keys: everything placed except Korus,
// who is not a field monster (his own throne seat, spawns.js
// KORUS_MODEL). 24 keys: 16 slot families + sky-dragon + 7
// extra families. The 27 types NOT here (21 slot families + 4
// extra families + cinder-dragon + muse-dragon) vanish from the
// field until their Tripo re-sends arrive.
export const PLACED_FIELD_KEYS = PLACED_MODEL_KEYS.filter((k) => k !== 'korus');

export function modelUrlFor(key) {
  if (key === 'korus') return '/models/hollow-earth/korus.glb';
  return `/models/hollow-earth/${key}.glb`;
}

// Rainforest five: optimized and STAGED-READY only. They were NOT
// placed in this repo: Aethelgard's Wildlife is procedural birds /
// butterflies / fireflies with no animal-model slots, and no
// unrigged rainforest uploads exist in this repo to replace — the
// rainforest-uploads artifact is a separate TS space, not this
// Next app. Wiring them here would be new-system work, not a
// replacement, so they stay staged until that system is specced.
export const RAINFOREST_STAGED = [
  { artifactId: 69, staged: 'black-panther-3d-model.glb', optimized: 'rainforest-panther.glb', name: "Midnight 'Mid'", note: 'forest-floor stalker' },
  { artifactId: 73, staged: 'red-eyed-tree-frog-3d-model.glb', optimized: 'rainforest-frog.glb', name: 'Prince Pipsqueak', note: 'canopy leaf' },
  { artifactId: 75, staged: 'rainbow-toucan-3d-model.glb', optimized: 'rainforest-toucan.glb', name: 'Prism', note: 'canopy flyer' },
  { artifactId: 77, staged: 'capuchin-monkey-3d-model.glb', optimized: 'rainforest-monkey.glb', name: 'Captain Caper', note: 'canopy troop' },
  { artifactId: 82, staged: 'sloth-3d-model.glb', optimized: 'rainforest-sloth.glb', name: 'Elder Slowpoke', note: 'canopy branch' },
];

// Deliberately NOT wired this job (no destination given): the 24
// full-size characters, the decimated files (109–112, 114–116),
// and the vehicles (108 rover, 113 speed bike). Together with
// the 6 decimated character-class files, SORT.md counts 30
// character-class files in the batch. They stay staged in
// ~/workspace/character-batch-4/.
export const STAGED_NOT_WIRED = {
  characters: [41, 43, 45, 46, 47, 48, 49, 51, 52, 53, 54, 57, 58, 60, 61, 62, 63, 66, 67, 68, 71, 72, 74, 76],
  decimated: [109, 110, 111, 112, 114, 115, 116],
  vehicles: [108, 113],
  note: 'No destination was given for these in this order; Merlin decides where each one lives.',
};
