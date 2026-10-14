/**
 * KOMBAT ARENA — per-fighter visual parameters for all 43 roster fighters.
 *
 * Each entry is a params object for buildFighterRig() from lib/kombat/rig.js
 * (see the PARAMS SCHEMA documented at the top of that file).
 *
 * Keys are kebab-case fighter ids and must match the roster exactly.
 * Likeness note: these are procedural approximations — signature silhouettes,
 * colors, weapons and effects only. No actor likenesses, no photo scans,
 * no copyrighted mesh data; everything is generated box/sphere/cylinder
 * geometry driven by these parameter sets.
 */

export const VISUALS = {
  // ------------------------------------------------ HORROR
  'freddy-krueger': {
    body: 'humanoid', height: 1.0, bulk: 0.95,
    colors: { skin: 0xb0714f, suit: 0xa02020, accent: 0x1f5c1f, eyes: 0xffdd44 },
    head: { type: 'cap', color: 0x5a3a22, detail: 'fedora' }, // fedora + claw glove
    attachments: [{ type: 'claw-glove', side: 'right' }],
  },
  'jason-voorhees': {
    body: 'bulky', height: 1.12, bulk: 1.15,
    colors: { skin: 0xc9a180, suit: 0x2e2e33, accent: 0xb02020, eyes: 0x111111 },
    head: { type: 'mask', color: 0xd8d4cc, detail: 'jason' }, // hockey mask + red chevrons
    attachments: [{ type: 'machete', side: 'right' }],
  },
  'michael-myers': {
    body: 'humanoid', height: 1.05, bulk: 1.0,
    colors: { skin: 0xd8c8b8, suit: 0x1f2a44, accent: 0x1f2a44, eyes: 0x0a0a0a },
    head: { type: 'mask', color: 0xe8e0d4 }, // blank white mask, dark coveralls
    attachments: [{ type: 'knife', side: 'right' }],
  },
  'leatherface': {
    body: 'bulky', height: 1.1, bulk: 1.2,
    colors: { skin: 0xd8b898, suit: 0x6b5233, accent: 0x8a2a2a, eyes: 0x3a2a1a },
    head: { type: 'mask', color: 0xd8b898 }, // stitched skin mask
    attachments: [{ type: 'chainsaw', side: 'right', color: 0x8a2a2a }],
  },
  'pennywise': {
    body: 'humanoid', height: 1.05, bulk: 1.0,
    colors: { skin: 0xf0ece4, suit: 0xc02020, accent: 0xe8a020, eyes: 0xffdd00 },
    head: { type: 'bare', detail: ['clown', 'balloon'] }, // red nose, hair puffs, balloon
    effects: [{ type: 'glow', color: 0xff3020 }],
  },
  'ghostface': {
    body: 'humanoid', height: 1.0, bulk: 0.9,
    colors: { skin: 0xe8e8e8, suit: 0x0c0c0e, accent: 0xe8e8e8, eyes: 0x000000 },
    head: { type: 'hood', color: 0x0c0c0e },
    attachments: [{ type: 'knife', side: 'right' }],
  },
  'chucky': {
    body: 'small', height: 0.55, bulk: 0.9,
    colors: { skin: 0xd8a878, suit: 0x2a4a8a, accent: 0xcc2222, eyes: 0x33aaff },
    head: { type: 'bare', color: 0xd8a878, detail: [] }, // striped shirt via torso bands
    attachments: [{ type: 'knife', side: 'right' }],
    stance: { armSpread: 0.45, crouch: 0.1 },
  },
  'pinhead': {
    body: 'humanoid', height: 1.05, bulk: 0.95,
    colors: { skin: 0xd8cfc0, suit: 0x141416, accent: 0x9a9aa0, eyes: 0x0a0a0a },
    head: { type: 'bare' },
    effects: [{ type: 'glow', color: 0x8888aa }],
  },
  'candyman': {
    body: 'humanoid', height: 1.05, bulk: 1.0,
    colors: { skin: 0x6b4a30, suit: 0x3a2e24, accent: 0xc8a020, eyes: 0x221100 },
    head: { type: 'bare' },
    attachments: [{ type: 'claws', side: 'right', color: 0xb0b0b8 }], // hook approximated as claws
  },
  'samara-morgan': {
    body: 'humanoid', height: 0.95, bulk: 0.8,
    colors: { skin: 0xd8cfc4, suit: 0xdcd8d0, accent: 0x1a1a1a, eyes: 0x000000 },
    head: { type: 'hood', color: 0x141414 }, // black hair veil over white dress
    effects: [{ type: 'particles', color: 0x88aaff }],
  },
  'xenomorph': {
    body: 'humanoid', height: 1.12, bulk: 0.8,
    colors: { skin: 0x15151a, suit: 0x1c1c22, accent: 0x3a3a44, eyes: 0x111111 },
    head: { type: 'bare', detail: 'jaw' }, // elongated cranium + inner jaw
    attachments: [{ type: 'claws', side: 'right' }, { type: 'claws', side: 'left' }],
    effects: [{ type: 'slime', color: 0x66ff88 }],
  },
  'predator': {
    body: 'bulky', height: 1.15, bulk: 1.1,
    colors: { skin: 0x7a6a3a, suit: 0x2a2a26, accent: 0xc8a020, eyes: 0xffaa00 },
    head: { type: 'bare', detail: 'dreadlocks' },
    attachments: [{ type: 'blaster', side: 'right', color: 0x88ccff }], // plasma caster
    effects: [{ type: 'glow', color: 0x44ff88 }],
  },

  // ------------------------------------------------ SCI-FI
  'darth-vader': {
    body: 'humanoid', height: 1.12, bulk: 1.1,
    colors: { skin: 0x0a0a0c, suit: 0x101014, accent: 0xff2222, eyes: 0xff2222 },
    head: { type: 'helmet', color: 0x0a0a0c, detail: 'vader' },
    attachments: [{ type: 'lightsaber', side: 'right' }], // blade color from accent = red
    effects: [{ type: 'glow', color: 0xff2222 }],
  },
  'luke-skywalker': {
    body: 'humanoid', height: 1.0, bulk: 0.95,
    colors: { skin: 0xd8a878, suit: 0xc8b898, accent: 0x2266cc, eyes: 0x446688 },
    head: { type: 'bare', color: 0xd8a878 },
    attachments: [{ type: 'lightsaber', side: 'right', color: 0x3388ff }], // blue blade
  },
  'yoda': {
    body: 'small', height: 0.55, bulk: 0.9,
    colors: { skin: 0x6a8a4a, suit: 0x8a6f4a, accent: 0x33ff66, eyes: 0x222211 },
    head: { type: 'hood', color: 0x6b5233 },
    attachments: [
      { type: 'lightsaber', side: 'right', color: 0x33ff66 },
      { type: 'staff', side: 'back', color: 0x6b5233 },
    ],
    effects: [{ type: 'glow', color: 0x66ff88 }],
  },
  'emperor-palpatine': {
    body: 'humanoid', height: 1.0, bulk: 0.9,
    colors: { skin: 0xc8b898, suit: 0x1a1a20, accent: 0x8844ff, eyes: 0xffdd44 },
    head: { type: 'hood', color: 0x1a1a20 },
    attachments: [{ type: 'staff', side: 'right', color: 0x8844ff }],
    effects: [{ type: 'electricity', color: 0xaa66ff }],
  },
  't-800': {
    body: 'bulky', height: 1.08, bulk: 1.15,
    colors: { skin: 0xd8a878, suit: 0x1a1a1c, accent: 0xb0b0b8, eyes: 0xff2222 },
    head: { type: 'bare', detail: 'visor-red' },
    attachments: [{ type: 'blaster', side: 'right', color: 0xffaa00 }],
  },
  't-1000': {
    body: 'humanoid', height: 1.02, bulk: 1.0,
    colors: { skin: 0xb8bcc4, suit: 0x8a8e96, accent: 0xd8dce4, eyes: 0x444a52 },
    head: { type: 'bare' },
    attachments: [{ type: 'knife', side: 'right', color: 0xd8dce4 }], // morphing blade arm
    effects: [{ type: 'glow', color: 0xaaccff }],
  },
  'ellen-ripley': {
    body: 'humanoid', height: 1.0, bulk: 0.95,
    colors: { skin: 0xd8a878, suit: 0x6a6a72, accent: 0xe8722a, eyes: 0x446688 },
    head: { type: 'bare', color: 0xd8a878 },
    attachments: [{ type: 'blaster', side: 'right', color: 0xffcc33 }],
  },
  'neo': {
    body: 'humanoid', height: 1.02, bulk: 0.95,
    colors: { skin: 0xd8a878, suit: 0x0c0c0e, accent: 0x33ff66, eyes: 0x111111 },
    head: { type: 'bare', detail: 'visor' }, // sunglasses
    effects: [{ type: 'particles', color: 0x33ff66 }], // matrix code rain
  },

  // ------------------------------------------------ DINOS
  't-rex': {
    body: 'dino', height: 1.6, bulk: 1.3,
    colors: { skin: 0x5a6b3a, suit: 0x4a5a30, accent: 0xd8cc88, eyes: 0xffcc00 },
    head: { type: 'bare' },
  },
  'raptor-swift': {
    body: 'dino', height: 1.05, bulk: 0.85,
    colors: { skin: 0x7a5a34, suit: 0x6a4e2c, accent: 0x44ddff, eyes: 0xffcc00 },
    head: { type: 'bare' },
    effects: [{ type: 'particles', color: 0x88ccff }], // speed trail
  },
  'raptor-claw': {
    body: 'dino', height: 1.1, bulk: 0.9,
    colors: { skin: 0x8a3a2a, suit: 0x7a3222, accent: 0xff6622, eyes: 0xffcc00 },
    head: { type: 'bare' },
  },
  'raptor-fang': {
    body: 'dino', height: 1.0, bulk: 0.8,
    colors: { skin: 0x3a5a6a, suit: 0x324e5c, accent: 0x88ffcc, eyes: 0xffcc00 },
    head: { type: 'bare' },
  },

  // ------------------------------------------------ GHOSTBUSTERS
  'peter-venkman': {
    body: 'humanoid', height: 1.0, bulk: 0.95,
    colors: { skin: 0xd8a878, suit: 0xa89878, accent: 0xcc2222, eyes: 0x446688 },
    head: { type: 'bare' },
    attachments: [
      { type: 'proton-pack', side: 'back' },
      { type: 'ghost-trap', side: 'left' },
    ],
  },
  'ray-stantz': {
    body: 'humanoid', height: 0.98, bulk: 1.05,
    colors: { skin: 0xd8a878, suit: 0xa89878, accent: 0xcc2222, eyes: 0x446688 },
    head: { type: 'cap', color: 0x6b5a3a },
    attachments: [
      { type: 'proton-pack', side: 'back' },
      { type: 'ghost-trap', side: 'left' },
    ],
  },
  'egon-spengler': {
    body: 'humanoid', height: 1.02, bulk: 0.9,
    colors: { skin: 0xd8c8a8, suit: 0xa89878, accent: 0xcc2222, eyes: 0x446688 },
    head: { type: 'bare', detail: 'visor' }, // glasses
    attachments: [
      { type: 'proton-pack', side: 'back' },
      { type: 'ghost-trap', side: 'left' },
    ],
  },
  'winston-zeddemore': {
    body: 'humanoid', height: 1.0, bulk: 1.05,
    colors: { skin: 0x8a5a34, suit: 0xa89878, accent: 0xcc2222, eyes: 0x332211 },
    head: { type: 'cap', color: 0x3a3a3a },
    attachments: [
      { type: 'proton-pack', side: 'back' },
      { type: 'ghost-trap', side: 'left' },
    ],
  },
  'slimer': {
    body: 'blob', height: 1.0, bulk: 1.1,
    colors: { skin: 0x44cc44, suit: 0x33aa33, accent: 0x88ff88, eyes: 0xffffff },
    head: { type: 'bare' },
    effects: [{ type: 'slime', color: 0x55ee55 }],
  },
  'stay-puft': {
    body: 'giant', height: 1.7, bulk: 1.35,
    colors: { skin: 0xf0f0f0, suit: 0xe8e8e8, accent: 0x2255aa, eyes: 0x334455 },
    head: { type: 'cap', color: 0xf0f0f0 }, // sailor cap
    effects: [{ type: 'glow', color: 0xffffff }],
  },

  // ------------------------------------------------ TOONS
  'bugs-bunny': {
    body: 'small', height: 0.8, bulk: 0.85,
    colors: { skin: 0x9a9aa0, suit: 0x8a8a90, accent: 0xffffff, eyes: 0x222222 },
    head: { type: 'bare', detail: 'rabbit-ears' },
    attachments: [{ type: 'carrot', side: 'right' }],
  },
  'tasmanian-devil': {
    body: 'humanoid', height: 0.85, bulk: 1.25,
    colors: { skin: 0x6b4a2e, suit: 0x5a3d26, accent: 0xd8b088, eyes: 0xffdd00 },
    head: { type: 'bare' },
    effects: [{ type: 'particles', color: 0x8a6a4a }], // dust whirl
    stance: { armSpread: 0.6, crouch: 0.2 },
  },

  // ------------------------------------------------ MARVEL
  'hulk': {
    body: 'bulky', height: 1.35, bulk: 1.5,
    colors: { skin: 0x3a8a3a, suit: 0x5a2a6a, accent: 0x2a6a2a, eyes: 0x111111 },
    head: { type: 'bare' },
    stance: { armSpread: 0.5, crouch: 0.15 },
  },
  'deadpool': {
    body: 'humanoid', height: 1.0, bulk: 1.0,
    colors: { skin: 0xcc2222, suit: 0xb02020, accent: 0x1a1a1a, eyes: 0xffffff },
    head: { type: 'mask', color: 0xb02020 },
    // Dual-wield law: twin katanas, one per hand (was one katana + a knife).
    attachments: [
      { type: 'katana', side: 'right' },
      { type: 'katana', side: 'left' },
    ],
  },
  'wolverine': {
    body: 'humanoid', height: 0.95, bulk: 1.15,
    colors: { skin: 0xd8a878, suit: 0xd8a020, accent: 0x1a2a6a, eyes: 0x111111 },
    head: { type: 'mask', color: 0x1a2a6a }, // blue cowl
    attachments: [
      { type: 'claws', side: 'right', color: 0xd8dce4 },
      { type: 'claws', side: 'left', color: 0xd8dce4 },
    ],
  },
  'thanos': {
    body: 'bulky', height: 1.25, bulk: 1.4,
    colors: { skin: 0x6a4a8a, suit: 0x2a2a4a, accent: 0xc8a020, eyes: 0xffdd44 },
    head: { type: 'bare' },
    effects: [{ type: 'glow', color: 0xcc88ff }],
  },
  'iron-man': {
    body: 'humanoid', height: 1.0, bulk: 1.05,
    colors: { skin: 0xb02020, suit: 0xa01818, accent: 0xd8a020, eyes: 0x88ccff },
    head: { type: 'helmet', color: 0xa01818, detail: 'visor' }, // gold faceplate visor
    effects: [{ type: 'glow', color: 0x66ccff, anchor: 'hand' }], // repulsor glow
  },

  // ------------------------------------------------ FINAL FANTASY
  'cloud-strife': {
    body: 'humanoid', height: 1.0, bulk: 0.95,
    colors: { skin: 0xd8a878, suit: 0x2a2a5a, accent: 0x8a8ab0, eyes: 0x33aaff },
    head: { type: 'bare', color: 0xd8a878 },
    attachments: [{ type: 'buster-sword', side: 'back' }],
  },
  'sephiroth': {
    body: 'humanoid', height: 1.15, bulk: 0.9,
    colors: { skin: 0xd8c8b8, suit: 0x0c0c10, accent: 0x8a8aa0, eyes: 0x44ff88 },
    head: { type: 'bare', color: 0xd8d8e0 }, // silver hair approximated via head color
    attachments: [{ type: 'masamune', side: 'right' }],
    effects: [{ type: 'particles', color: 0x664488 }],
  },
  'tifa-lockhart': {
    body: 'humanoid', height: 1.0, bulk: 0.9,
    colors: { skin: 0xd8a878, suit: 0xe8e8e8, accent: 0xcc2222, eyes: 0x882222 },
    head: { type: 'bare', color: 0x1a1a1a }, // dark hair
    effects: [{ type: 'glow', color: 0xff4444 }],
  },

  // ------------------------------------------------ MONSTERS VS ALIENS
  'bob-blob': {
    body: 'blob', height: 1.05, bulk: 1.2,
    colors: { skin: 0x3388cc, suit: 0x2a76b8, accent: 0x88ccff, eyes: 0xffffff },
    head: { type: 'bare' },
    effects: [{ type: 'slime', color: 0x55aaff }],
  },
  'missing-link': {
    body: 'humanoid', height: 1.05, bulk: 1.1,
    colors: { skin: 0x3a8a7a, suit: 0x2a6a5a, accent: 0x88ddcc, eyes: 0xffdd44 },
    head: { type: 'bare' },
    effects: [{ type: 'particles', color: 0x66ccff }],
  },
  'dr-cockroach': {
    body: 'humanoid', height: 0.9, bulk: 0.9,
    colors: { skin: 0x6b4a2a, suit: 0xe8e8e8, accent: 0x44aaff, eyes: 0x111111 },
    head: { type: 'bare', detail: 'visor' }, // goggles
    effects: [{ type: 'electricity', color: 0x66ccff }],
  },
};

export const FIGHTER_IDS = Object.keys(VISUALS);
export const FIGHTER_COUNT = FIGHTER_IDS.length;
