// lib/hawkins/models.js
// HAWKINS — character & creature manifest (Merlin, 2026-10-22).
//
// Every embodied character in Hawkins: The Vecna Hunt, as data — the
// same manifest pattern as the Earth 2 Bay (lib/earth2/models.js).
// Merlin's Tripo3D characters replace the old procedural WebGL builds:
// the five humanoid-dialect GLBs are IN HAND and placed (Eddie, Eleven,
// Hopper, Vecna, the Demogorgon — Mixamo-spec rigs, 65 joints each);
// the three 'Other'-rig creatures (Demobats, Mind Flayer, Mind Flayer
// Hybrid) are still in Studio rigging, so their file is null and the
// engine keeps its procedural body for those slots ONLY until the GLB
// lands — then slotting one in is a file drop at the path below plus
// flipping `file` here. No engine surgery, by design.
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

  // ── Awaiting their rigs (Studio, 'Other' rig type) ───────────────
  // Demobats: winged swarm creature. When demobats.glb lands at the
  // path below, bats are born as GLBs and the procedural bat retires.
  { id: 'demobats', name: 'Demo-bats', role: 'creature', file: null, status: 'awaiting-rig', heightUnits: 7, tint: 0x191014, roughness: 0.9 },
  // The Mind Flayer: sky colossus. Scaled by span, flown at altitude.
  { id: 'mind-flayer', name: 'Mind Flayer', role: 'creature', file: null, status: 'awaiting-rig', scaleBasis: 'span', spanUnits: 820, tint: 0x050508, roughness: 1, aura: 0xff2222, speedMul: 1 },
  // The Hybrid — a true VARIANT of the Flayer entry (Merlin's standing
  // spec): same body plan, red aura, more aggressive and slightly
  // faster. speedMul divides its attack cooldown.
  { id: 'mind-flayer-hybrid', name: 'Mind Flayer Hybrid', role: 'creature', variantOf: 'mind-flayer', file: null, status: 'awaiting-rig', scaleBasis: 'span', spanUnits: 780, tint: 0x0a0508, roughness: 1, aura: 0xff2222, auraScale: 1.3, speedMul: 1.2 },
];

export const hawkinsModel = (id) => HAWKINS_MODELS.find((m) => m.id === id) || null;

// Player-selectable characters, in menu order (Eleven is the default —
// she is the hunter of the piece).
export const HAWKINS_PLAYER_CHARACTERS = HAWKINS_MODELS.filter((m) => m.role === 'player');

// Placed = a real GLB on disk today. Pending = still in the Studio
// (awaiting-rig). The engine routes every spawn through these lists.
export const hawkinsPlacedModels = () => HAWKINS_MODELS.filter((m) => m.status === 'placed');
export const hawkinsPendingModels = () => HAWKINS_MODELS.filter((m) => m.status === 'awaiting-rig');
