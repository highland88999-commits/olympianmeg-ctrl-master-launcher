// lib/hawkins/models.js
// HAWKINS — character & creature manifest (Merlin, 2026-10-22).
//
// Every embodied character in Hawkins: The Vecna Hunt, as data — the
// same manifest pattern as the Earth 2 Bay (lib/earth2/models.js).
// Merlin's Tripo3D characters replace the old procedural WebGL builds:
// ALL EIGHT are placed. The five humanoid-dialect GLBs came first
// (Eddie, Eleven, Hopper, Vecna, the Demogorgon — Mixamo-spec rigs,
// 65 joints each); the three creatures landed with their rigs on
// 2026-10-22 — the Demobats on the 78-joint humanoid-retarget template
// (its arm chains skin the wings), the Mind Flayer and its Hybrid on
// Tripo-native 'Other' rigs (65 / 64 joints). The engine's procedural
// bodies survive ONLY as fallbacks if a file ever goes missing again:
// spawn routing reads `file` here, so a missing file falls back and a
// present one takes the GLB — no engine surgery, by design.
//
// heightUnits is the in-game standing height the loader scales each
// model to. The swap preserves the game's existing sense of size
// (the procedural builds they replace): the player avatar stood ~13.7
// units, the Demogorgon ~36 with its head at ~32 (the headshot line),
// Vecna ~50. Eleven is deliberately a touch smaller (she's a kid —
// small and quick, per Merlin's character spec); Hopper a touch
// broader-taller. Gameplay never reads these numbers — hit tests are
// position-based — they are the visual truth only.
//
// scaleBasis 'span' (the sky creatures) scales the model's longest
// horizontal extent instead of its height: the Mind Flayer is a
// colossus silhouette ~800 units across, not a standing figure.
//
// tint: the delivered Studio rig exports carry NO materials, textures
// or vertex colours (verified in the files: POSITION/NORMAL/JOINTS/
// WEIGHTS only). The loader dresses each model in a MeshStandardMaterial
// of this tint so it reads in Hawkins' dark instead of renderer-white.

export const HAWKINS_MODELS = [
  // ── The player characters (third-person avatar) ──────────────────
  { id: 'eleven', name: 'Eleven', role: 'player', file: '/models/hawkins/eleven.glb', status: 'placed', heightUnits: 12.2, tint: 0x8a7f72, roughness: 0.85 },
  { id: 'eddie', name: 'Eddie Munson', role: 'player', file: '/models/hawkins/eddie.glb', status: 'placed', heightUnits: 13.6, tint: 0x5d5648, roughness: 0.9 },
  { id: 'hopper', name: 'Jim Hopper', role: 'player', file: '/models/hawkins/hopper.glb', status: 'placed', heightUnits: 14.4, tint: 0x4c4a44, roughness: 0.9 },

  // ── The boss ─────────────────────────────────────────────────────
  { id: 'vecna', name: 'Vecna', role: 'boss', file: '/models/hawkins/vecna.glb', status: 'placed', heightUnits: 50, tint: 0x2c1a20, roughness: 0.7 },

  // ── The pack ─────────────────────────────────────────────────────
  { id: 'demogorgon', name: 'Demogorgon', role: 'enemy', file: '/models/hawkins/demogorgon.glb', status: 'placed', heightUnits: 36, tint: 0x241a1a, roughness: 0.85 },

  // ── The creatures (rigged 'Other' in Studio — landed 2026-10-22) ──
  // Demobats: winged swarm creature, 78-joint humanoid-retarget rig —
  // bats are born as GLBs; the resolver flaps the arm-chain wings.
  { id: 'demobats', name: 'Demo-bats', role: 'creature', file: '/models/hawkins/demobats.glb', status: 'placed', heightUnits: 7, tint: 0x191014, roughness: 0.9 },
  // The Mind Flayer: sky colossus, 65-joint Tripo-native rig. Scaled
  // by span, flown at altitude; its limb chains sway via the resolver.
  { id: 'mind-flayer', name: 'Mind Flayer', role: 'creature', file: '/models/hawkins/mind-flayer.glb', status: 'placed', scaleBasis: 'span', spanUnits: 820, tint: 0x050508, roughness: 1, aura: 0xff2222, speedMul: 1 },
  // The Hybrid — a true VARIANT of the Flayer entry (Merlin's standing
  // spec): same body plan, 64-joint Tripo-native rig, red aura, more
  // aggressive and slightly faster. speedMul divides its attack cooldown.
  { id: 'mind-flayer-hybrid', name: 'Mind Flayer Hybrid', role: 'creature', variantOf: 'mind-flayer', file: '/models/hawkins/mind-flayer-hybrid.glb', status: 'placed', scaleBasis: 'span', spanUnits: 780, tint: 0x0a0508, roughness: 1, aura: 0xff2222, auraScale: 1.3, speedMul: 1.2 },
];

export const hawkinsModel = (id) => HAWKINS_MODELS.find((m) => m.id === id) || null;

// Player-selectable characters, in menu order (Eleven is the default —
// she is the hunter of the piece).
export const HAWKINS_PLAYER_CHARACTERS = HAWKINS_MODELS.filter((m) => m.role === 'player');

// Placed = a real GLB on disk today (all eight, since 2026-10-22).
// Pending = awaiting-rig — empty today; the split stays because the
// engine routes every spawn through these lists and the procedural
// fallbacks key off it.
export const hawkinsPlacedModels = () => HAWKINS_MODELS.filter((m) => m.status === 'placed');
export const hawkinsPendingModels = () => HAWKINS_MODELS.filter((m) => m.status === 'awaiting-rig');
